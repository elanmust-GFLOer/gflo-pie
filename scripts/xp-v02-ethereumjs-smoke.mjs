// GFLO XP Policy v0.2 — initial Termux smoke test.
// Executes actual CREATE initialization (not merely injected runtime bytecode).
// Uses @ethereumjs/vm@10 and @ethereumjs/common/@ethereumjs/util from this directory,
// and solc + ethers from ~/gflo-pie. No on-chain network or private keys.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import { createVM } from "@ethereumjs/vm";
import { Common, Hardfork, Mainnet } from "@ethereumjs/common";
import { createAccount, createAddressFromString, hexToBytes, bytesToHex } from "@ethereumjs/util";

const repo = join(homedir(), "gflo-pie");
const req = createRequire(join(repo, "package.json"));
const solc = req("solc");
const { Interface, id } = req("ethers");

const sources = {};
for (const name of ["PIECoreV02.sol", "XPPolicyV02.sol"]) {
  sources[name] = { content: execFileSync("git", [
    "show", `origin/feature/pie-core-v0.2:contracts/${name}`
  ], { cwd: repo, encoding: "utf8" }) };
}
const input = {
  language: "Solidity", sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "cancun",
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};
const output = JSON.parse(solc.compile(JSON.stringify(input)));
for (const e of output.errors ?? []) {
  if (e.severity === "error") throw Error(e.formattedMessage);
}
const compiled = {
  PIE: output.contracts["PIECoreV02.sol"].PIECoreV02,
  XP: output.contracts["XPPolicyV02.sol"].XPPolicyV02,
};
const interfaces = Object.fromEntries(Object.entries(compiled).map(
  ([name, artifact]) => [name, new Interface(artifact.abi)]
));
const vm = await createVM({
  common: new Common({ chain: Mainnet, hardfork: Hardfork.Cancun }),
});

function a(hexSuffix) {
  return createAddressFromString("0x" + hexSuffix.padStart(40, "0"));
}
const creatorPie = a("d1");
const creatorXP = a("d2");
const owner = a("01");
const alice = a("a1");
const bob = a("b2"); // no Genesis
const standard = a("f1");
const elevated = a("f2");
const outsider = a("c1");
for (const address of [creatorPie, creatorXP, owner, alice, bob, standard, elevated, outsider]) {
  await vm.stateManager.putAccount(address, createAccount({ balance: 10n ** 18n }));
}

async function deploy(kind, sender, args = []) {
  const bytecode = compiled[kind].evm.bytecode.object;
  assert.ok(bytecode, `missing ${kind} initcode`);
  const initcode = "0x" + bytecode + interfaces[kind].encodeDeploy(args).slice(2);
  const result = await vm.evm.runCall({
    caller: sender, data: hexToBytes(initcode), gasLimit: 10_000_000n,
  });
  if (result.execResult.exceptionError) throw result.execResult.exceptionError;
  assert.ok(result.createdAddress, `${kind} contract creation returned no address`);
  assert.ok((await vm.stateManager.getCode(result.createdAddress)).length > 0,
    `${kind} runtime code not stored`);
  return result.createdAddress;
}
async function call(kind, address, name, args = [], sender = alice) {
  const data = hexToBytes(interfaces[kind].encodeFunctionData(name, args));
  return (await vm.evm.runCall({
    caller: sender, to: address, data, gasLimit: 3_000_000n,
  })).execResult;
}
async function success(kind, address, name, args = [], sender = alice) {
  const result = await call(kind, address, name, args, sender);
  if (result.exceptionError) throw result.exceptionError;
  return result;
}
async function read(kind, address, name, args = [], sender = alice) {
  const result = await success(kind, address, name, args, sender);
  return interfaces[kind].decodeFunctionResult(name, bytesToHex(result.returnValue));
}
async function rejected(kind, address, name, args, error, sender = alice) {
  const result = await call(kind, address, name, args, sender);
  assert.ok(result.exceptionError, `${name}: expected revert`);
  const decoded = interfaces[kind].parseError(bytesToHex(result.returnValue));
  assert.equal(decoded?.name, error, `${name}: unexpected revert reason`);
}
let passed = 0;
async function check(label, fn) {
  await fn();
  passed++;
  console.log(`✅ ${passed}/10 ${label}`);
}
console.log("=== GFLO XP Policy v0.2 — EVM CREATE + XP smoke tests ===");
console.log("solc:", solc.version());

const pie = await deploy("PIE", creatorPie);
const xp = await deploy("XP", creatorXP, [pie.toString(), owner.toString()]);

await check("PIE + XP contracts deployed; constructors initialized", async () => {
  assert.equal((await read("XP", xp, "owner"))[0].toLowerCase(), owner.toString().toLowerCase());
  assert.equal((await read("XP", xp, "pie"))[0].toLowerCase(), pie.toString().toLowerCase());
});

const r25 = id("GFLO_REWARD_ACTIVITY_V1");
const r1000 = id("GFLO_REWARD_ACHIEVEMENT_V1");
await success("XP", xp, "registerRule", [r25, 25, 1, 0], owner);
await success("XP", xp, "registerRule", [r1000, 1000, 1, 0], owner);
await success("XP", xp, "setVerifierRole", [standard.toString(), 1], owner);
await success("XP", xp, "setVerifierRole", [elevated.toString(), 2], owner);

await check("Only owner can administer verifiers and rules", async () => {
  await rejected("XP", xp, "setVerifierRole", [outsider.toString(), 2], "NotOwner", outsider);
  await rejected("XP", xp, "registerRule", [id("FAKE"), 100, 1, 0], "NotOwner", outsider);
});

await success("PIE", pie, "createIdentity", [1], alice);
await check("Genesis creates 25 XP; policy-earned XP initially zero", async () => {
  assert.equal((await read("XP", xp, "totalXP", [alice.toString()]))[0], 25n);
  assert.equal((await read("XP", xp, "earnedXP", [alice.toString()]))[0], 0n);
});

const eventA = id("event-A");
const evidenceA = id("evidence-A");
await check("Untrusted caller cannot award XP", async () => {
  await rejected("XP", xp, "awardXP", [alice.toString(), r25, eventA, evidenceA],
    "NotAuthorizedVerifier", outsider);
  assert.equal((await read("XP", xp, "totalXP", [alice.toString()]))[0], 25n);
});

await check("Verified 25 XP awarded once; total becomes 50", async () => {
  const r = await success("XP", xp, "awardXP", [alice.toString(), r25, eventA, evidenceA], standard);
  assert.ok((r.logs ?? []).length > 0, "Missing XPAwarded event");
  assert.equal((await read("XP", xp, "totalXP", [alice.toString()]))[0], 50n);
});
await check("Reused eventId rejected", async () => {
  await rejected("XP", xp, "awardXP", [alice.toString(), r25, eventA, id("different-proof")],
    "DuplicateEvent", standard);
});
await check("Reused evidence hash rejected (even with a fresh eventId)", async () => {
  await rejected("XP", xp, "awardXP", [alice.toString(), r1000, id("event-B"), evidenceA],
    "DuplicateEvidence", elevated);
});
await check("A nonexistent PIE identity cannot earn XP", async () => {
  await rejected("XP", xp, "awardXP", [bob.toString(), r25, id("bob-A"), id("bob-proof-A")],
    "IdentityRequired", standard);
});
await check("1000 XP requires elevated verifier; then succeeds", async () => {
  const args = [alice.toString(), r1000, id("event-C"), id("evidence-C")];
  await rejected("XP", xp, "awardXP", args, "NotAuthorizedVerifier", standard);
  await success("XP", xp, "awardXP", args, elevated);
  assert.equal((await read("XP", xp, "totalXP", [alice.toString()]))[0], 1050n);
});
await check("XP does not modify earned Tier or allow duplicate claims", async () => {
  const current = (await read("PIE", pie, "getIdentity", [alice.toString()]))[0];
  assert.equal(current[1], 25n);
  assert.equal(current[3], 0n);
  await rejected("XP", xp, "awardXP",
    [alice.toString(), r25, id("event-D"), id("evidence-D")],
    "ClaimLimitReached", standard);
});
assert.equal(passed, 10);
console.log("✅ 10/10 XP POLICY SMOKE PASS");
console.log("Scope: EVM CREATE plus limited authorization/replay tests; not complete limit, cooldown or audit coverage.");
