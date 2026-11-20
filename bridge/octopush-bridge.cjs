"use strict";
// GFLO ⇄ OctoPush bridge worker (DESIGN-005 §6). Dependency-free: callers inject ethers v6 and
// connected Contract objects. One `tick` leases signed review events from the OctoPush bridge API,
// re-checks them, attests them on EAS for the Reformer rule, and reports the outcome. It also
// revokes attestations whose OctoPush source was deleted.
//
// Safety rules:
//   - The issuer signature must recover OCTOPUSH_ISSUER_ADDRESS; otherwise the event is rejected.
//   - The author must have a PIE identity; the reviewer's effective tier must be >= minReviewerTier.
//   - Every chain write is simulated with staticCall first; a resolver revert becomes a rejection
//     with the decoded error name. Transient failures (RPC, HTTP) are NOT reported: the lease
//     expires and the event is retried, never marked "failed" by accident.
//   - Crash recovery: if an event's eventId is already used on chain, the bridge looks up its own
//     earlier attestation and reports that UID instead of attesting twice.
//   - Grants this bridge attested are finalized once their challenge period is over.
//   - dryRun never sends a transaction and never reports.

const ISSUER_DOMAIN = { name: "OctoPush GFLO Issuer", version: "1", chainId: 84532 };
const REVIEW_EVENT_TYPES = {
  OctoPushReviewEvent: [
    { name: "reviewId", type: "bytes32" },
    { name: "roomMessageId", type: "bytes32" },
    { name: "contentFingerprint", type: "bytes32" },
    { name: "version", type: "string" },
    { name: "author", type: "address" },
    { name: "reviewer", type: "address" },
    { name: "reviewedAt", type: "uint64" },
  ],
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

class TransientError extends Error {}

function bridgeApi({ baseUrl, token, fetchImpl = globalThis.fetch }) {
  if (!baseUrl || !token) throw new Error("baseUrl and token are required");
  return async (path, body) => {
    let res;
    try {
      res = await fetchImpl(baseUrl.replace(/\/$/, "") + path, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new TransientError(`HTTP ${path}: ${err.message}`);
    }
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    if (res.status >= 500 || res.status === 429) throw new TransientError(`HTTP ${path}: ${res.status}`);
    return { status: res.status, json };
  };
}

function reviewMessage(ethers, ev) {
  if (!UUID.test(ev.reviewId) || !UUID.test(ev.roomMessageId)) throw new Error("INVALID_UUID");
  if (!/^[0-9a-f]{64}$/.test(ev.contentFingerprint)) throw new Error("INVALID_FINGERPRINT");
  return {
    reviewId: ethers.keccak256(ethers.toUtf8Bytes(ev.reviewId)),
    roomMessageId: ethers.keccak256(ethers.toUtf8Bytes(ev.roomMessageId)),
    contentFingerprint: "0x" + ev.contentFingerprint,
    version: ev.version,
    author: ethers.getAddress(ev.authorWallet),
    reviewer: ethers.getAddress(ev.reviewerWallet),
    reviewedAt: BigInt(ev.reviewedAt),
  };
}

function issuerSignatureValid(ethers, ev, issuerAddress) {
  try {
    const recovered = ethers.verifyTypedData(ISSUER_DOMAIN, REVIEW_EVENT_TYPES, reviewMessage(ethers, ev), ev.issuerSignature);
    return recovered.toLowerCase() === issuerAddress.toLowerCase();
  } catch {
    return false;
  }
}

function revertName(err, interfaces) {
  const data = err?.data ?? err?.info?.error?.data ?? err?.error?.data;
  if (typeof data === "string" && data.length >= 10) {
    for (const iface of interfaces) {
      try { const parsed = iface.parseError(data); if (parsed) return parsed.name; } catch { /* next */ }
    }
  }
  return err?.revert?.name ?? err?.reason ?? null;
}

async function tick(ctx) {
  const {
    ethers, eas, resolver, core, tierGate, schemaUID, ruleId, issuerAddress,
    deployBlock, limit = 10, minReviewerTier = 1n, dryRun = false, log = () => {},
  } = ctx;
  if (deployBlock === undefined || deployBlock === null) throw new Error("deployBlock is required");
  if (!issuerAddress || !ethers.isAddress(issuerAddress)) throw new Error("issuerAddress is required");
  const call = bridgeApi(ctx);
  const bridgeAddress = await eas.runner.getAddress();
  const coder = ethers.AbiCoder.defaultAbiCoder();
  const actions = [];

  const report = async (id, body, record) => {
    actions.push({ ...record, reported: !dryRun });
    if (dryRun) return;
    try {
      const r = await call(`/outbox/${id}/result`, body);
      if (r.status >= 400) log(`result ${id} -> HTTP ${r.status}`);
    } catch (err) {
      log(`result ${id} not reported (${err.message}); the lease will expire and recovery will re-report`);
    }
  };

  // Finds this bridge's earlier attestation for an eventId (crash recovery).
  const findOwnAttestation = async (recipient, eventId) => {
    const logs = await eas.queryFilter(eas.filters.Attested(recipient, bridgeAddress), deployBlock, "latest");
    for (const ev of logs) {
      if (ev.args.schemaUID !== schemaUID) continue;
      const att = await eas.getAttestation(ev.args.uid);
      const [, evId] = coder.decode(["bytes32", "bytes32", "bytes32"], att.data);
      if (evId === eventId) return { uid: ev.args.uid, txHash: ev.transactionHash };
    }
    return null;
  };

  // ── 1. Attest leased review events ──────────────────────────
  const leased = await call("/outbox/lease", { limit });
  if (leased.status !== 200) throw new Error(`lease failed: HTTP ${leased.status}`);
  for (const ev of leased.json?.events ?? []) {
    const base = { type: "event", id: ev.id };
    try {
      if (!issuerSignatureValid(ethers, ev, issuerAddress)) {
        await report(ev.id, { status: "rejected", reason: "issuer_signature_invalid" }, { ...base, outcome: "rejected", reason: "issuer_signature_invalid" });
        continue;
      }
      const msg = reviewMessage(ethers, ev);
      const author = msg.author;
      // Recovery first: an attestation that already exists must be reported, whatever the
      // eligibility of a NEW attestation would be now (e.g. the reviewer's tier dropped since).
      const eventId = msg.reviewId;
      if (await resolver.usedEvents(eventId)) {
        const existing = await findOwnAttestation(author, eventId);
        if (existing) {
          await report(ev.id, { status: "attested", attestationUid: existing.uid, txHash: existing.txHash },
            { ...base, outcome: "attested", uid: existing.uid, recovered: true });
        } else {
          await report(ev.id, { status: "rejected", reason: "event_already_used" }, { ...base, outcome: "rejected", reason: "event_already_used" });
        }
        continue;
      }
      const identity = await core.getIdentity(author);
      if (!identity.exists) {
        await report(ev.id, { status: "rejected", reason: "author_no_identity" }, { ...base, outcome: "rejected", reason: "author_no_identity" });
        continue;
      }
      let reviewerTier;
      try {
        reviewerTier = await tierGate.effectiveTier(msg.reviewer);
      } catch (err) {
        if (revertName(err, [tierGate.interface]) === "NoIdentity") reviewerTier = 0n;
        else throw new TransientError(`tier read: ${err.message}`);
      }
      if (BigInt(reviewerTier) < BigInt(minReviewerTier)) {
        await report(ev.id, { status: "rejected", reason: "reviewer_tier" }, { ...base, outcome: "rejected", reason: "reviewer_tier" });
        continue;
      }

      const request = { schema: schemaUID, data: {
        recipient: author, expirationTime: 0, revocable: true, refUID: ethers.ZeroHash,
        data: coder.encode(["bytes32", "bytes32", "bytes32"], [ruleId, eventId, msg.contentFingerprint]), value: 0 } };
      try {
        await eas.attest.staticCall(request);
      } catch (err) {
        const name = revertName(err, [resolver.interface, eas.interface]);
        if (!name) throw new TransientError(`attest simulation: ${err.message}`);
        await report(ev.id, { status: "rejected", reason: `resolver:${name}` }, { ...base, outcome: "rejected", reason: `resolver:${name}` });
        continue;
      }
      if (dryRun) { actions.push({ ...base, outcome: "would_attest", reported: false }); continue; }
      const tx = await eas.attest(request);
      const rc = await tx.wait();
      const attested = rc.logs.map((l) => { try { return eas.interface.parseLog(l); } catch { return null; } })
        .find((l) => l && l.name === "Attested");
      await report(ev.id, { status: "attested", attestationUid: attested.args.uid, txHash: tx.hash },
        { ...base, outcome: "attested", uid: attested.args.uid });
      log(`attested ${ev.id} -> ${attested.args.uid}`);
    } catch (err) {
      if (err instanceof TransientError) { log(`transient on ${ev.id}: ${err.message}`); actions.push({ ...base, outcome: "retry_later" }); continue; }
      log(`unexpected on ${ev.id}: ${err.message}`);
      actions.push({ ...base, outcome: "retry_later" });
    }
  }

  // ── 2. Revoke attestations whose source was deleted ─────────
  const revs = await call("/outbox/revocations/lease", { limit });
  if (revs.status !== 200) throw new Error(`revocations lease failed: HTTP ${revs.status}`);
  for (const r of revs.json?.revocations ?? []) {
    const base = { type: "revocation", id: r.id, uid: r.attestationUid };
    try {
      const att = await eas.getAttestation(r.attestationUid);
      let txHash;
      if (att.revocationTime === 0n) {
        const req = { schema: schemaUID, data: { uid: r.attestationUid, value: 0 } };
        await eas.revoke.staticCall(req);
        if (dryRun) { actions.push({ ...base, outcome: "would_revoke", reported: false }); continue; }
        const tx = await eas.revoke(req);
        await tx.wait();
        txHash = tx.hash;
      } else {
        const logs = await eas.queryFilter(eas.filters.Revoked(att.recipient, bridgeAddress), deployBlock, "latest");
        const found = logs.find((l) => l.args.uid === r.attestationUid);
        if (!found) { actions.push({ ...base, outcome: "retry_later", reason: "revoked_elsewhere" }); continue; }
        txHash = found.transactionHash;
      }
      actions.push({ ...base, outcome: "revoked", reported: !dryRun });
      if (!dryRun) {
        try { await call(`/outbox/${r.id}/revocation-result`, { revoked: true, txHash }); }
        catch (err) { log(`revocation ${r.id} not reported (${err.message})`); }
      }
    } catch (err) {
      log(`revocation ${r.id}: ${err.message}`);
      actions.push({ ...base, outcome: "retry_later" });
    }
  }
  // ── 3. Finalize this bridge's grants after the challenge period ──
  // finalize() is permissionless; without it, attested XP would stay PENDING forever.
  const provider = eas.runner.provider ?? eas.runner;
  const now = BigInt((await provider.getBlock("latest")).timestamp);
  const pending = await resolver.queryFilter(resolver.filters.GrantPending(null, null, bridgeAddress), deployBlock, "latest");
  for (const ev of pending) {
    const uid = ev.args.uid;
    const base = { type: "finalize", uid };
    try {
      const g = await resolver.grants(uid);
      if (BigInt(g.status) !== 1n || now < BigInt(g.finalizesAt)) continue; // not PENDING, or too early
      await resolver.finalize.staticCall(uid);
      if (dryRun) { actions.push({ ...base, outcome: "would_finalize" }); continue; }
      const tx = await resolver.connect(eas.runner).finalize(uid);
      await tx.wait();
      actions.push({ ...base, outcome: "finalized", tx: tx.hash });
      log(`finalized ${uid}`);
    } catch (err) {
      log(`finalize ${uid}: ${err.message}`);
      actions.push({ ...base, outcome: "retry_later" });
    }
  }
  return actions;
}

module.exports = { tick, ISSUER_DOMAIN, REVIEW_EVENT_TYPES, reviewMessage, issuerSignatureValid };
