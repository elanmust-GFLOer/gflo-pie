"use strict";
// GFLO agent keeper (DESIGN-003 Phase B). Dependency-free: callers pass ethers v6 Contract
// objects connected to a signer (or a provider, for dryRun). One `tick` is idempotent and
// stateless: it rescans from `deployBlock` every time, so it can run from cron or a worker.
//
// What it does, in order:
//   1. ERC-8004 watch: for every bound agent with an identity `Transfer` or
//      `MetadataSet("agentWallet")` event after its bind (by block and log position), end a
//      stale binding with the permissionless `unbind`. If the binding is backed again after a
//      real departure (wallet/owner flip-back, DESIGN-003 §9), only the operator could unbind:
//      report a `flipback` alert so governance can suspend the agent (not repeated once suspended).
//   2. Unpublish: retract every live ERC-8004 entry whose grant is no longer eligible.
//   3. Publish: mirror every finalized, eligible grant into ERC-8004.
// Every on-chain step is simulated with staticCall first; dryRun never sends a transaction.

const AGENT_WALLET_KEY = "agentWallet";
const ZERO = "0x0000000000000000000000000000000000000000";

// Mirrors AgentBindingRegistryV01._backedByIdentity: any failing read counts as stale.
async function isStale(identity, agentId, b) {
  try {
    const owner = await identity.ownerOf(agentId);
    const wallet = await identity.getAgentWallet(agentId);
    return owner.toLowerCase() !== b.operator.toLowerCase() || wallet.toLowerCase() !== b.agentWallet.toLowerCase();
  } catch {
    return true;
  }
}

const later = (a, b) => a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]);

// Position of the AgentBound event that created the current epoch. If it is older than the scan
// window, every scanned change is after it.
async function bindPosition(binding, agentId, epoch, fromBlock, toBlock) {
  const evs = await binding.queryFilter(binding.filters.AgentBound(agentId), fromBlock, toBlock);
  const ev = evs.filter((e) => BigInt(e.args.epoch) === BigInt(epoch)).pop();
  return ev ? [ev.blockNumber, ev.index] : [-1, -1];
}

// `deployBlock` is the block the GFLO contracts were deployed in. Every tick rescans the FULL
// history from there: it is the keeper's only memory. Never advance it to the last processed
// block, or grants and entries seen earlier would never be re-checked (revocations, suspensions).
async function tick({ identity, binding, agentXP, publisher, deployBlock, toBlock = "latest", dryRun = false, log = () => {} }) {
  if (deployBlock === undefined || deployBlock === null) throw new Error("deployBlock is required (the GFLO deployment block)");
  const fromBlock = deployBlock;
  const actions = [];
  const send = async (contract, method, args, record) => {
    try {
      await contract[method].staticCall(...args);
    } catch (err) {
      return false;
    }
    if (dryRun) { actions.push({ ...record, sent: false }); return true; }
    const tx = await contract[method](...args);
    await tx.wait();
    actions.push({ ...record, sent: true, tx: tx.hash });
    log(`${record.type} ${JSON.stringify(record, (_, v) => (typeof v === "bigint" ? v.toString() : v))}`);
    return true;
  };

  // 1. ERC-8004 changes on bound agents.
  // Events are ordered by (blockNumber, logIndex), never by timestamp: a bind and a change in the
  // same block share a timestamp. A flip-back needs a real departure: a transfer (ERC-8004 then
  // clears the wallet) or a wallet set to a different address; re-setting the same wallet is not one.
  const changes = new Map(); // agentId -> [{ pos, departsFrom(wallet) }]
  const add = (agentId, ev, departsFrom) => {
    const key = agentId.toString();
    if (!changes.has(key)) changes.set(key, []);
    changes.get(key).push({ pos: [ev.blockNumber, ev.index], departsFrom });
  };
  for (const ev of await identity.queryFilter(identity.filters.Transfer(), fromBlock, toBlock)) {
    if (ev.args.from !== ZERO) add(ev.args.tokenId, ev, () => true);
  }
  for (const ev of await identity.queryFilter(identity.filters.MetadataSet(), fromBlock, toBlock)) {
    if (ev.args.metadataKey !== AGENT_WALLET_KEY) continue;
    const value = ev.args.metadataValue;
    const wallet = value && value.length === 42 ? value.toLowerCase() : ZERO; // 20-byte packed address or ""
    add(ev.args.agentId, ev, (boundWallet) => wallet !== boundWallet.toLowerCase());
  }
  for (const [key, list] of changes) {
    const agentId = BigInt(key);
    const b = await binding.getBinding(agentId);
    if (b.operator === ZERO) continue;
    const bindPos = await bindPosition(binding, agentId, b.epoch, fromBlock, toBlock);
    const after = list.filter((c) => later(c.pos, bindPos));
    if (after.length === 0) continue; // every change predates this binding
    // Staleness is checked against ERC-8004 directly: a keeper whose signer is also this agent's
    // operator could otherwise unbind a still-backed agent (the operator may always unbind).
    if (await isStale(identity, agentId, b)) {
      await send(binding, "unbind", [agentId], { type: "unbind", agentId, epoch: Number(b.epoch) });
      continue;
    }
    if (b.suspended) continue; // governance already acted
    if (!after.some((c) => c.departsFrom(b.agentWallet))) continue; // idempotent updates only
    actions.push({ type: "flipback", agentId, epoch: Number(b.epoch),
      note: "ERC-8004 owner/wallet left and returned after binding; governance should suspend" });
    log(`flipback alert agent ${agentId} epoch ${b.epoch}`);
  }

  // 2. Retract entries that are no longer eligible.
  const published = new Set();
  for (const ev of await publisher.queryFilter(publisher.filters.Published(), fromBlock, toBlock)) published.add(ev.args.uid);
  for (const uid of published) {
    if (await publisher.canUnpublish(uid)) await send(publisher, "unpublish", [uid], { type: "unpublish", uid });
  }

  // 3. Mirror finalized, eligible grants.
  for (const ev of await agentXP.queryFilter(agentXP.filters.GrantFinalized(), fromBlock, toBlock)) {
    const uid = ev.args.uid;
    if (await publisher.canPublish(uid)) await send(publisher, "publish", [uid], { type: "publish", uid, agentId: ev.args.agentId });
  }
  return actions;
}

module.exports = { tick, AGENT_WALLET_KEY };
