"use strict";
// GFLO agent keeper (DESIGN-003 Phase B). Dependency-free: callers pass ethers v6 Contract
// objects connected to a signer (or a provider, for dryRun). One `tick` is idempotent and
// stateless apart from `fromBlock`, so it can run from cron or a worker.
//
// What it does, in order:
//   1. ERC-8004 watch: for every bound agent touched by an identity `Transfer` or
//      `MetadataSet("agentWallet")` event, end a stale binding with the permissionless
//      `unbind`. If the binding is backed again (wallet/owner flip-back, DESIGN-003 §9),
//      it cannot be unbound by anyone but the operator: report a `flipback` alert so
//      governance can suspend the agent.
//   2. Unpublish: retract every live ERC-8004 entry whose grant is no longer eligible.
//   3. Publish: mirror every finalized, eligible grant into ERC-8004.
// Every on-chain step is simulated with staticCall first; dryRun never sends a transaction.

const AGENT_WALLET_KEY = "agentWallet";

async function tick({ identity, binding, agentXP, publisher, fromBlock = 0, toBlock = "latest", dryRun = false, log = () => {} }) {
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
  const touched = new Map(); // agentId -> latest block number of a relevant change
  const note = (agentId, blockNumber) => {
    const key = agentId.toString();
    touched.set(key, Math.max(touched.get(key) ?? 0, blockNumber));
  };
  for (const ev of await identity.queryFilter(identity.filters.Transfer(), fromBlock, toBlock)) {
    if (ev.args.from !== "0x0000000000000000000000000000000000000000") note(ev.args.tokenId, ev.blockNumber);
  }
  for (const ev of await identity.queryFilter(identity.filters.MetadataSet(), fromBlock, toBlock)) {
    if (ev.args.metadataKey === AGENT_WALLET_KEY) note(ev.args.agentId, ev.blockNumber);
  }
  for (const [key, changedAt] of touched) {
    const agentId = BigInt(key);
    const b = await binding.getBinding(agentId);
    if (b.operator === "0x0000000000000000000000000000000000000000") continue;
    const provider = identity.runner.provider ?? identity.runner; // signer or bare provider
    const changeBlock = await provider.getBlock(changedAt);
    if (BigInt(changeBlock.timestamp) <= BigInt(b.boundAt)) continue; // change predates this binding
    const unbound = await send(binding, "unbind", [agentId], { type: "unbind", agentId, epoch: Number(b.epoch) });
    if (!unbound) {
      actions.push({ type: "flipback", agentId, epoch: Number(b.epoch), changedAtBlock: changedAt,
        note: "ERC-8004 owner/wallet changed after binding but is backed again; governance should suspend" });
      log(`flipback alert agent ${agentId} epoch ${b.epoch}`);
    }
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
