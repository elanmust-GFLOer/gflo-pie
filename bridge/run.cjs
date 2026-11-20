#!/usr/bin/env node
"use strict";
// Production runner for the GFLO ⇄ OctoPush bridge worker (Railway worker, Phase C).
// Reads configuration from env only; no defaults for addresses or keys. Runs in DRY RUN unless
// BRIDGE_LIVE=1. Retired Sepolia v3 contract addresses are refused.
const { ethers } = require("ethers");
const bridge = require("./octopush-bridge.cjs");

const RETIRED_V3 = new Set([
  "0x9cf55d0b9d61dc28ef3cb10765cf4b861cd0991e", "0x414dedcf9264614fd087bda58be27a0b698ccc54",
  "0xd2c926f67080d6315b5dbbc7d621d729cfe8a9c7", "0x563b2e3b499818a2f84c472efb3169a2667807fe",
]);

const { ABI } = require("./abi.cjs");

function required(name) {
  const v = (process.env[name] || "").trim();
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}
function address(name) {
  const v = required(name);
  if (!ethers.isAddress(v) || RETIRED_V3.has(v.toLowerCase())) throw new Error(`invalid or retired address in ${name}`);
  return ethers.getAddress(v);
}

async function main() {
  const provider = new ethers.JsonRpcProvider(required("GFLO_RPC_URL"));
  const signer = new ethers.Wallet(required("BRIDGE_ATTESTER_KEY"), provider);
  const eas = new ethers.Contract(address("GFLO_EAS"), ABI.eas, signer);
  const resolver = new ethers.Contract(address("GFLO_XP_RESOLVER"), ABI.resolver, provider);
  const core = new ethers.Contract(address("GFLO_PIE_CORE"), ABI.core, provider);
  const tierGate = new ethers.Contract(address("GFLO_EFFECTIVE_TIER_GATE"), ABI.gate, provider);
  const ctx = {
    ethers, eas, resolver, core, tierGate,
    schemaUID: await resolver.schemaUID(),
    ruleId: ethers.id(process.env.GFLO_RULE_NAME || "reformer.octopush-room-review-accepted"),
    issuerAddress: address("OCTOPUSH_ISSUER_ADDRESS"),
    deployBlock: Number(required("GFLO_DEPLOY_BLOCK")),
    baseUrl: required("OCTOPUSH_BRIDGE_URL"), // e.g. https://<octopush-domain>/api/public/gflo
    token: required("GFLO_BRIDGE_TOKEN"),
    dryRun: process.env.BRIDGE_LIVE !== "1",
    log: (m) => console.log(new Date().toISOString(), m),
  };
  const every = Number(process.env.BRIDGE_INTERVAL_SECONDS || 60) * 1000;
  console.log(`bridge ${ctx.dryRun ? "DRY RUN" : "LIVE"} as ${signer.address}, issuer ${ctx.issuerAddress}`);
  for (;;) {
    try {
      const actions = await bridge.tick(ctx);
      if (actions.length) console.log(JSON.stringify(actions, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
    } catch (err) {
      console.error(new Date().toISOString(), "tick failed:", err.message);
    }
    if (process.env.BRIDGE_ONCE === "1") return;
    await new Promise((r) => setTimeout(r, every));
  }
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
module.exports = { address };
