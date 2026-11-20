const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const http = require("node:http");
const { randomUUID, randomBytes } = require("node:crypto");

// DESIGN-005 §6: the GFLO bridge worker against the real contracts (EAS, PIE core, Path registry,
// XPAttestationResolverV02, Registry, EffectiveTierGate, TierProgression) and a mock of the OctoPush
// L3 bridge API (Bearer token, lease, idempotent results, revocations), signed by a test issuer key.
const bridge = require("../../bridge/octopush-bridge.cjs");
const EAS_ART = require("@ethereum-attestation-service/eas-contracts/artifacts/contracts/EAS.sol/EAS.json");
const REG_ART = require("@ethereum-attestation-service/eas-contracts/artifacts/contracts/SchemaRegistry.sol/SchemaRegistry.json");

const id = (s) => ethers.id(s);
const DAY = 86400;
const REF_RULE = id("reformer.octopush-room-review-accepted");
const SOV_RULE = id("sovereign.weekly-consistency");
const TOKEN = randomBytes(32).toString("hex");
const advance = async (s) => { await network.provider.send("evm_increaseTime", [s]); await network.provider.send("evm_mine"); };
const deploy = async (name, ...args) => { const c = await (await ethers.getContractFactory(name)).deploy(...args); await c.waitForDeployment(); return c; };
const addr = (c) => c.getAddress();

// ── Mock OctoPush bridge API ────────────────────────────────
function startOctoPush({ issuer }) {
  const rows = new Map();
  const state = { failNextResult: false, reports: [] };
  const server = http.createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const send = (status, obj) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return send(401, { error: "UNAUTHORIZED" });
    const json = body ? JSON.parse(body) : {};
    let m;
    if (req.url === "/outbox/lease") {
      const events = [];
      for (const r of rows.values()) {
        if (events.length >= json.limit) break;
        if (r.status === "ready" || (r.status === "leased" && r.leaseExpired)) {
          r.status = "leased"; r.leaseExpired = false;
          events.push({ id: r.id, reviewId: r.reviewId, roomMessageId: r.roomMessageId, contentFingerprint: r.contentFingerprint,
            version: r.version, authorWallet: r.authorWallet, reviewerWallet: r.reviewerWallet, reviewedAt: r.reviewedAt,
            issuerSignature: r.issuerSignature });
        }
      }
      return send(200, { events });
    }
    if ((m = req.url.match(/^\/outbox\/([0-9a-f-]+)\/result$/))) {
      const r = rows.get(m[1]);
      if (!r) return send(404, { error: "NOT_FOUND" });
      if (state.failNextResult) { state.failNextResult = false; return send(503, { error: "BRIDGE_UNAVAILABLE" }); }
      if (r.status !== "leased") {
        const same = r.result && JSON.stringify(r.result) === JSON.stringify(json);
        return same ? send(200, { result: "noop" }) : send(409, { error: "CONFLICT" });
      }
      r.status = json.status; r.result = json; state.reports.push({ id: r.id, ...json });
      return send(200, { result: "ok" });
    }
    if (req.url === "/outbox/revocations/lease") {
      const revocations = [...rows.values()].filter((r) => r.status === "attested" && r.sourceDeleted && !r.revocationTx)
        .slice(0, json.limit).map((r) => ({ id: r.id, attestationUid: r.result.attestationUid }));
      return send(200, { revocations });
    }
    if ((m = req.url.match(/^\/outbox\/([0-9a-f-]+)\/revocation-result$/))) {
      const r = rows.get(m[1]);
      if (!r) return send(404, { error: "NOT_FOUND" });
      if (r.revocationTx) return r.revocationTx === json.txHash ? send(200, { result: "noop" }) : send(409, { error: "CONFLICT" });
      r.revocationTx = json.txHash; return send(200, { result: "ok" });
    }
    return send(404, { error: "NOT_FOUND" });
  });
  const add = async ({ author, reviewer, signer = issuer, version = "agent-v1" }) => {
    const row = { id: randomUUID(), reviewId: randomUUID(), roomMessageId: randomUUID(),
      contentFingerprint: randomBytes(32).toString("hex"), version, authorWallet: author.toLowerCase(),
      reviewerWallet: reviewer.toLowerCase(), reviewedAt: Math.floor(Date.now() / 1000), status: "ready" };
    row.issuerSignature = await signer.signTypedData(bridge.ISSUER_DOMAIN, bridge.REVIEW_EVENT_TYPES, bridge.reviewMessage(ethers, row));
    rows.set(row.id, row);
    return row;
  };
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () =>
    resolve({ url: `http://127.0.0.1:${server.address().port}`, rows, state, add, close: () => new Promise((r) => server.close(r)) })));
}

describe("DESIGN-005 — GFLO bridge worker (OctoPush review events → EAS)", function () {
  let api;
  afterEach(async () => { if (api) await api.close(); api = null; });

  async function setup() {
    const [gov, bridgeSigner, govAttester, author, reviewer, newbie] = await ethers.getSigners();
    const schemaRegistry = await (new ethers.ContractFactory(REG_ART.abi, REG_ART.bytecode, gov)).deploy();
    const eas = await (new ethers.ContractFactory(EAS_ART.abi, EAS_ART.bytecode, gov)).deploy(await addr(schemaRegistry));
    const core = await deploy("PIECoreIgnitionV01", gov.address);
    const paths = await deploy("PathRuleRegistryV01", gov.address);
    const resolver = await deploy("XPAttestationResolverV02", await addr(eas), await addr(core), await addr(paths), gov.address);
    await schemaRegistry.register(await resolver.SCHEMA(), await addr(resolver), true);
    const registry = await deploy("TrustedXPSourceRegistryV02", await addr(core), gov.address);
    await registry.proposePolicy(await addr(resolver), ethers.keccak256(await ethers.provider.getCode(await addr(resolver))), gov.address);
    await registry.activatePolicy(); await registry.setPaused(false);
    const gate = await deploy("EffectiveTierGateV01", await addr(core), await addr(registry));
    const progression = await deploy("TierProgressionV01", await addr(core), await addr(registry));
    await core.bindIgnition(await addr(progression));
    for (const [rule, path, attester] of [[REF_RULE, 2, bridgeSigner], [SOV_RULE, 1, govAttester]]) {
      await resolver.registerRule(rule, 350, 1000); await paths.assignRule(rule, path);
      await resolver.setAttesterLevel(attester.address, 1); await resolver.setRuleAttester(rule, attester.address, true);
    }
    await core.connect(author).createIdentity(2);
    await core.connect(reviewer).createIdentity(2);
    await core.connect(newbie).createIdentity(2);
    const schemaUID = await resolver.schemaUID();
    const deployBlock = (await ethers.provider.getBlockNumber()) - 30;

    // Reviewer earns Tier 1 the production way: verified XP, then 30 days of sustained growth.
    let n = 0;
    const govGrant = async (to) => {
      n++;
      const data = ethers.AbiCoder.defaultAbiCoder().encode(["bytes32", "bytes32", "bytes32"], [SOV_RULE, id("g" + n), id("gd" + n)]);
      const rc = await (await eas.connect(govAttester).attest({ schema: schemaUID, data: { recipient: to, expirationTime: 0, revocable: true, refUID: ethers.ZeroHash, data, value: 0 } })).wait();
      return rc.logs.map((l) => { try { return eas.interface.parseLog(l); } catch { return null; } }).find((l) => l && l.name === "Attested").args.uid;
    };
    const u = [await govGrant(reviewer.address), await govGrant(reviewer.address), await govGrant(reviewer.address)];
    await advance(3 * DAY); for (const x of u) await resolver.finalize(x);
    await progression.connect(reviewer).start();
    const g = await govGrant(reviewer.address); await advance(3 * DAY); await resolver.finalize(g);
    await advance(30 * DAY); await progression.connect(reviewer).complete();
    expect(await gate.effectiveTier(reviewer.address)).to.equal(1n);

    const issuer = ethers.Wallet.createRandom();
    api = await startOctoPush({ issuer });
    const ctx = { ethers, eas: eas.connect(bridgeSigner), resolver, core, tierGate: gate, schemaUID, ruleId: REF_RULE,
      issuerAddress: issuer.address, deployBlock, baseUrl: api.url, token: TOKEN };
    return { gov, bridgeSigner, author, reviewer, newbie, eas, resolver, core, gate, schemaUID, issuer, ctx, reviewerGrants: [...u, g] };
  }

  it("attests a valid review event for the author, with the Reformer Path bonus, and reports the UID", async function () {
    const { author, reviewer, resolver, ctx } = await setup();
    const row = await api.add({ author: author.address, reviewer: reviewer.address });
    const acts = await bridge.tick(ctx);
    expect(acts.map((a) => a.outcome)).to.deep.equal(["attested"]);
    const report = api.state.reports.find((r) => r.id === row.id);
    expect(report.status).to.equal("attested");
    const grant = await resolver.grants(report.attestationUid);
    expect(grant.recipient).to.equal(author.address);
    expect(grant.amount).to.equal(420n); // 350 + 20% on the author's selected Reformer Path
    expect(grant.status).to.equal(1n);   // PENDING: the 3-day challenge period still applies
    expect(await bridge.tick(ctx)).to.deep.equal([]); // nothing left to do
  });

  it("rejects a forged issuer signature without touching the chain", async function () {
    const { author, reviewer, resolver, ctx } = await setup();
    const forger = ethers.Wallet.createRandom();
    const row = await api.add({ author: author.address, reviewer: reviewer.address, signer: forger });
    await bridge.tick(ctx);
    expect(api.state.reports).to.deep.equal([{ id: row.id, status: "rejected", reason: "issuer_signature_invalid" }]);
    expect(await resolver.usedEvents(ethers.keccak256(ethers.toUtf8Bytes(row.reviewId)))).to.equal(false);
  });

  it("rejects a Tier 0 reviewer and an author without a PIE identity", async function () {
    const { author, reviewer, newbie, ctx } = await setup();
    const lowTier = await api.add({ author: author.address, reviewer: newbie.address });
    const noId = await api.add({ author: ethers.Wallet.createRandom().address, reviewer: reviewer.address });
    await bridge.tick(ctx);
    const byId = Object.fromEntries(api.state.reports.map((r) => [r.id, r.reason]));
    expect(byId[lowTier.id]).to.equal("reviewer_tier");
    expect(byId[noId.id]).to.equal("author_no_identity");
  });

  it("turns an on-chain rule violation into a named rejection (daily cap)", async function () {
    const { author, reviewer, ctx } = await setup();
    for (let i = 0; i < 4; i++) await api.add({ author: author.address, reviewer: reviewer.address }); // 4 x 420 > 1500
    await bridge.tick(ctx);
    expect(api.state.reports.map((r) => r.status === "attested" ? "attested" : r.reason))
      .to.deep.equal(["attested", "attested", "attested", "resolver:LimitReached"]);
  });

  it("recovers after a lost report: re-leased event is reported with the existing UID, never attested twice", async function () {
    const { author, reviewer, eas, ctx } = await setup();
    const row = await api.add({ author: author.address, reviewer: reviewer.address });
    api.state.failNextResult = true;                       // attest succeeds, the report is lost (503)
    expect((await bridge.tick(ctx)).map((a) => a.outcome)).to.deep.equal(["attested"]);
    expect(api.rows.get(row.id).status).to.equal("leased");
    api.rows.get(row.id).leaseExpired = true;              // lease expires, OctoPush hands it out again
    const before = (await eas.queryFilter(eas.filters.Attested())).length;
    const acts = await bridge.tick(ctx);
    expect(acts).to.have.length(1);
    expect(acts[0]).to.include({ outcome: "attested", recovered: true });
    expect((await eas.queryFilter(eas.filters.Attested())).length).to.equal(before);
    expect(api.rows.get(row.id).status).to.equal("attested");
  });

  it("revokes an attestation whose OctoPush source was deleted, once, and removes the XP", async function () {
    const { author, reviewer, resolver, ctx } = await setup();
    const row = await api.add({ author: author.address, reviewer: reviewer.address });
    await bridge.tick(ctx);
    const uid = api.state.reports[0].attestationUid;
    api.rows.get(row.id).sourceDeleted = true;              // author deleted the task in OctoPush
    const acts = await bridge.tick(ctx);
    expect(acts.map((a) => a.outcome)).to.deep.equal(["revoked"]);
    expect((await resolver.grants(uid)).status).to.equal(3n); // REVOKED
    expect(api.rows.get(row.id).revocationTx).to.match(/^0x[0-9a-f]{64}$/);
    expect(await bridge.tick(ctx)).to.deep.equal([]);
  });

  it("review fix: finalizes its own grants after the challenge period, so XP actually lands", async function () {
    const { author, reviewer, resolver, ctx } = await setup();
    await api.add({ author: author.address, reviewer: reviewer.address });
    await bridge.tick(ctx);
    const uid = api.state.reports[0].attestationUid;
    expect(await bridge.tick(ctx)).to.deep.equal([]);           // still inside the challenge period
    expect((await resolver.grants(uid)).status).to.equal(1n);
    await advance(3 * DAY);
    const acts = await bridge.tick(ctx);
    expect(acts.map((a) => [a.type, a.outcome])).to.deep.equal([["finalize", "finalized"]]);
    expect((await resolver.grants(uid)).status).to.equal(2n);   // VALID
    expect(await resolver.totalXP(author.address)).to.equal(25n + 420n);
    expect(await bridge.tick(ctx)).to.deep.equal([]);           // idempotent
  });

  it("review fix: a lost report is recovered even if the reviewer's tier dropped meanwhile", async function () {
    const { gov, author, reviewer, resolver, gate, ctx, reviewerGrants } = await setup();
    const row = await api.add({ author: author.address, reviewer: reviewer.address });
    api.state.failNextResult = true;
    await bridge.tick(ctx);                                       // attested, report lost
    await resolver.connect(gov).governanceRevoke(reviewerGrants[0], id("FRAUD"));
    await resolver.connect(gov).governanceRevoke(reviewerGrants[1], id("FRAUD"));
    expect(await gate.effectiveTier(reviewer.address)).to.equal(0n);
    api.rows.get(row.id).leaseExpired = true;
    const acts = await bridge.tick(ctx);
    expect(acts[0]).to.include({ outcome: "attested", recovered: true });
    expect(api.rows.get(row.id).status).to.equal("attested");
  });

  it("dry run changes nothing on chain and reports nothing", async function () {
    const { author, reviewer, resolver, ctx } = await setup();
    const row = await api.add({ author: author.address, reviewer: reviewer.address });
    const acts = await bridge.tick({ ...ctx, dryRun: true });
    expect(acts.map((a) => a.outcome)).to.deep.equal(["would_attest"]);
    expect(api.state.reports).to.deep.equal([]);
    expect(await resolver.usedEvents(ethers.keccak256(ethers.toUtf8Bytes(row.reviewId)))).to.equal(false);
  });

  it("the production runner's human-readable ABIs match the compiled contracts", async function () {
    const { ABI } = require("../../bridge/abi.cjs");
    const real = {
      eas: new ethers.Interface(EAS_ART.abi),
      resolver: (await ethers.getContractFactory("XPAttestationResolverV02")).interface,
      core: (await ethers.getContractFactory("PIECoreIgnitionV01")).interface,
      gate: (await ethers.getContractFactory("EffectiveTierGateV01")).interface,
    };
    for (const [k, frags] of Object.entries(ABI)) {
      for (const f of new ethers.Interface(frags).fragments) {
        const key = (x) => (x.type === "event" ? x.topicHash : x.selector);
        const match = real[k].fragments.find((r) => r.type === f.type && key(r) === key(f));
        expect(match, `${k}: ${f.format()}`).to.not.equal(undefined);
        if (f.type === "function") expect(match.outputs.map((o) => o.format())).to.deep.equal(f.outputs.map((o) => o.format()));
      }
    }
  });

  it("refuses to run with a wrong token, without an issuer address, or without deployBlock", async function () {
    const { ctx } = await setup();
    let err;
    try { await bridge.tick({ ...ctx, token: "wrong" }); } catch (e) { err = e; }
    expect(err && err.message).to.match(/lease failed: HTTP 401/);
    for (const bad of [{ issuerAddress: undefined }, { deployBlock: undefined }]) {
      err = null;
      try { await bridge.tick({ ...ctx, ...bad }); } catch (e) { err = e; }
      expect(err, JSON.stringify(Object.keys(bad))).to.be.an("error");
    }
  });
});
