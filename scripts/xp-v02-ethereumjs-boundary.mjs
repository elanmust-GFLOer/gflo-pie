// GFLO XP Policy v0.2 — Termux/EthereumJS VM boundary + adversarial suite.
// In-memory execution; actual Solidity constructors; controlled UTC block timestamps.
// Dependencies already present in ~/gflo-v02-evm: @ethereumjs/vm, common, util.
// @ethereumjs/block is a transitive EthereumJS VM dependency.
// Solidity compiler and ethers are loaded from ~/gflo-pie.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import { createBlock } from "@ethereumjs/block";
import { createVM } from "@ethereumjs/vm";
import { Common, Hardfork, Mainnet } from "@ethereumjs/common";
import { createAccount, createAddressFromString, hexToBytes, bytesToHex } from "@ethereumjs/util";

const repo = join(homedir(), "gflo-pie");
const dep = createRequire(join(repo, "package.json"));
const solc = dep("solc");
const { Interface, id } = dep("ethers");
const sources = {};
for (const file of ["PIECoreV02.sol", "XPPolicyV02.sol"]) {
  sources[file] = {
    content: execFileSync(
      "git", ["show", `origin/feature/pie-core-v0.2:contracts/${file}`],
      { cwd: repo, encoding: "utf8" }
    ),
  };
}
const compiled = JSON.parse(solc.compile(JSON.stringify({
  language: "Solidity", sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "cancun",
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
})));
for (const error of compiled.errors ?? []) {
  if (error.severity === "error") throw new Error(error.formattedMessage);
}
const artifacts = {
  PIE: compiled.contracts["PIECoreV02.sol"].PIECoreV02,
  XP: compiled.contracts["XPPolicyV02.sol"].XPPolicyV02,
};
const abi = {
  PIE: new Interface(artifacts.PIE.abi),
  XP: new Interface(artifacts.XP.abi),
};
const common = new Common({ chain: Mainnet, hardfork: Hardfork.Cancun });
const vm = await createVM({ common });
const HOUR = 3600n, DAY = 86400n, WEEK = 7n * DAY;
const START = 1_700_000_000n - 1_700_000_000n % WEEK + DAY;
function blockAt(timestamp) {
  return createBlock(
    { header: { number: 1n, timestamp, gasLimit: 30_000_000n } },
    { common, skipConsensusFormatValidation: true }
  );
}
function address(hex) {
  return createAddressFromString("0x" + hex.padStart(40, "0"));
}
const owner = address("01"), incomingOwner = address("02");
const creatorCore = address("d1"), creatorPolicy = address("d2");
const standard = address("f1"), elevated = address("f2"), outsider = address("ff");
const alice = address("a1"), noIdentity = address("ab");
const claimsUser = address("b1"), cooldownUser = address("b2");
const dayUser = address("b3"), weekUser = address("b4");
const pauseUser = address("b5"), switchUser = address("b6");
const revokedUser = address("b7");
const participants = [
  owner, incomingOwner, creatorCore, creatorPolicy,
  standard, elevated, outsider,
  alice, noIdentity, claimsUser, cooldownUser, dayUser, weekUser,
  pauseUser, switchUser, revokedUser,
];
for (const account of participants) {
  await vm.stateManager.putAccount(account, createAccount({ balance: 10n ** 18n }));
}
async function run(kind, to, method, args = [], sender = owner, timestamp = START) {
  const data = hexToBytes(abi[kind].encodeFunctionData(method, args));
  return (await vm.evm.runCall({
    caller: sender, to, data, gasLimit: 4_000_000n, block: blockAt(timestamp),
  })).execResult;
}
async function success(kind, to, method, args = [], sender = owner, timestamp = START) {
  const r = await run(kind, to, method, args, sender, timestamp);
  if (r.exceptionError) throw new Error(
    `${method} unexpected EVM exception: ${r.exceptionError.error}; return ${bytesToHex(r.returnValue)}`
  );
  return r;
}
async function read(kind, to, method, args = [], sender = owner, timestamp = START) {
  const r = await success(kind, to, method, args, sender, timestamp);
  return abi[kind].decodeFunctionResult(method, bytesToHex(r.returnValue));
}
async function reject(kind, to, method, args, reason, sender = owner, timestamp = START) {
  const r = await run(kind, to, method, args, sender, timestamp);
  assert.ok(r.exceptionError, `${method} unexpectedly succeeded (expected ${reason})`);
  const error = abi[kind].parseError(bytesToHex(r.returnValue));
  assert.equal(error?.name, reason, `${method}: incorrect error`);
}
async function deploy(kind, caller, args = []) {
  const initial = artifacts[kind].evm.bytecode.object;
  assert.ok(initial, `Missing ${kind} creation bytecode`);
  const data = hexToBytes("0x" + initial + abi[kind].encodeDeploy(args).slice(2));
  const result = await vm.evm.runCall({
    caller, data, gasLimit: 10_000_000n, block: blockAt(START),
  });
  if (result.execResult.exceptionError) throw result.execResult.exceptionError;
  assert.ok(result.createdAddress, `Missing created address for ${kind}`);
  assert.ok((await vm.stateManager.getCode(result.createdAddress)).length > 0);
  return result.createdAddress;
}
let counter = 0;
function evidence() {
  counter++;
  return [id(`GFLO_BOUNDARY_EVENT_${counter}`), id(`GFLO_BOUNDARY_EVIDENCE_${counter}`)];
}
function awardArgs(account, ruleId, proof = evidence()) {
  return [account.toString(), ruleId, ...proof];
}
let passed = 0;
const TOTAL = 17;
async function test(title, fn) {
  try {
    await fn();
    passed++;
    console.log(`✅ ${passed}/${TOTAL} ${title}`);
  } catch (e) {
    console.error(`❌ FAIL [${passed + 1}/${TOTAL}] ${title}`);
    throw e;
  }
}

console.log("=== GFLO XP Policy v0.2 — BOUNDARY & SECURITY ===");
console.log("Compiler:", solc.version());
console.log("Timestamp control: fixed UTC day & seven-day Unix epoch");

const pie = await deploy("PIE", creatorCore);
const xp = await deploy("XP", creatorPolicy, [pie.toString(), owner.toString()]);
const R25 = id("GFLO_BOUNDARY_RULE_25");
const R500 = id("GFLO_BOUNDARY_RULE_500");
const R1000 = id("GFLO_BOUNDARY_RULE_1000");
const RONE = id("GFLO_BOUNDARY_RULE_ONE_CLAIM");
const RCOOL = id("GFLO_BOUNDARY_RULE_COOLDOWN");
const RSWITCH = id("GFLO_BOUNDARY_RULE_SWITCH");
for (const account of [
  alice, claimsUser, cooldownUser, dayUser, weekUser,
  pauseUser, switchUser, revokedUser,
]) {
  await success("PIE", pie, "createIdentity", [1], account, START);
}
await success("XP", xp, "setVerifierRole", [standard.toString(), 1]);
await success("XP", xp, "setVerifierRole", [elevated.toString(), 2]);

await test("Real contract creation, Genesis 25 and initial zero earned XP", async () => {
  assert.equal((await read("XP", xp, "pie"))[0].toLowerCase(), pie.toString().toLowerCase());
  assert.equal((await read("XP", xp, "totalXP", [alice.toString()]))[0], 25n);
  assert.equal((await read("XP", xp, "earnedXP", [alice.toString()]))[0], 0n);
  assert.equal((await read("XP", xp, "totalXP", [noIdentity.toString()]))[0], 0n);
});

await test("Minimum 25, maximum 1000; invalid rule amounts rejected", async () => {
  await reject("XP", xp, "registerRule", [id("bad24"), 24, 1, 0], "InvalidRule");
  await reject("XP", xp, "registerRule", [id("bad1001"), 1001, 1, 0], "InvalidRule");
  await reject("XP", xp, "registerRule", [id("badzero"), 0, 1, 0], "InvalidRule");
  await reject("XP", xp, "registerRule", [id("badclaim"), 25, 0, 0], "InvalidRule");
  await reject("XP", xp, "registerRule", ["0x" + "00".repeat(32), 25, 1, 0], "InvalidRule");
  for (const [rule, amount, max, cool] of [
    [R25, 25, 100, 0], [R500, 500, 100, 0], [R1000, 1000, 100, 0],
    [RONE, 25, 1, 0], [RCOOL, 50, 3, 3600], [RSWITCH, 75, 3, 0],
  ]) await success("XP", xp, "registerRule", [rule, amount, max, cool]);
});

await test("Non-owner cannot administer; rule IDs cannot be redefined", async () => {
  await reject("XP", xp, "registerRule", [id("outsider-rule"), 25, 1, 0],
    "NotOwner", outsider);
  await reject("XP", xp, "setVerifierRole", [outsider.toString(), 2],
    "NotOwner", outsider);
  await reject("XP", xp, "setPaused", [true], "NotOwner", outsider);
  await reject("XP", xp, "registerRule", [R25, 1000, 1, 0], "RuleAlreadyExists");
});

await test("Standard verifier blocked from 1000 XP, elevated succeeds", async () => {
  const args = awardArgs(alice, R1000);
  await reject("XP", xp, "awardXP", args, "NotAuthorizedVerifier", standard);
  await success("XP", xp, "awardXP", args, elevated);
  assert.equal((await read("XP", xp, "totalXP", [alice.toString()]))[0], 1025n);
});

await test("Replay: same eventId with new evidence rejected", async () => {
  const original = evidence();
  const first = awardArgs(alice, R25, original);
  await success("XP", xp, "awardXP", first, standard);
  const another = [alice.toString(), R25, original[0], id("another-evidence")];
  await reject("XP", xp, "awardXP", another, "DuplicateEvent", standard);
});

await test("Replay: same evidence with fresh eventId rejected", async () => {
  const original = evidence();
  const args = awardArgs(claimsUser, R25, original);
  await success("XP", xp, "awardXP", args, standard);
  const another = [dayUser.toString(), R25, id("another-event"), original[1]];
  await reject("XP", xp, "awardXP", another, "DuplicateEvidence", standard);
});

await test("Missing identity, empty account and empty evidence rejected", async () => {
  await reject("XP", xp, "awardXP", awardArgs(noIdentity, R25),
    "IdentityRequired", standard);
  await reject("XP", xp, "awardXP",
    [address("0").toString(), R25, ...evidence()], "InvalidEvidence", standard);
  await reject("XP", xp, "awardXP",
    [alice.toString(), R25, "0x" + "00".repeat(32), evidence()[1]],
    "InvalidEvidence", standard);
});

await test("Per-rule maxClaims enforced with unique attempted events", async () => {
  const first = awardArgs(claimsUser, RONE);
  await success("XP", xp, "awardXP", first, standard);
  await reject("XP", xp, "awardXP", awardArgs(claimsUser, RONE),
    "ClaimLimitReached", standard);
  assert.equal((await read("XP", xp, "claimsPerRule", [claimsUser.toString(), RONE]))[0], 1n);
});

await test("Cooldown: 3599 seconds rejects, 3600 seconds permits", async () => {
  const first = awardArgs(cooldownUser, RCOOL);
  await success("XP", xp, "awardXP", first, standard, START);
  assert.equal(
    (await read("XP", xp, "lastClaimAt", [cooldownUser.toString(), RCOOL]))[0],
    START, "Block timestamp not forwarded to EVM"
  );
  const second = awardArgs(cooldownUser, RCOOL);
  await reject("XP", xp, "awardXP", second, "CooldownActive",
    standard, START + HOUR - 1n);
  await success("XP", xp, "awardXP", second, standard, START + HOUR);
  assert.equal((await read("XP", xp, "earnedXP", [cooldownUser.toString()]))[0], 100n);
});

await test("Daily boundary: exactly 1500 XP allowed, 1525 rejected", async () => {
  await success("XP", xp, "awardXP", awardArgs(dayUser, R1000), elevated, START);
  await success("XP", xp, "awardXP", awardArgs(dayUser, R500), elevated, START);
  const failure = awardArgs(dayUser, R25);
  await reject("XP", xp, "awardXP", failure, "DailyLimitReached", standard, START);
  const dayId = START / DAY;
  assert.equal((await read("XP", xp, "dailyXP", [dayUser.toString(), dayId]))[0], 1500n);
  assert.equal((await read("XP", xp, "totalXP", [dayUser.toString()]))[0], 1525n);
  // Failed award must not be consumed by replay bookkeeping.
  await success("XP", xp, "awardXP", failure, standard, START + DAY);
});

await test("Weekly boundary: exactly 3000 XP allowed, +25 rejected", async () => {
  for (let d = 0n; d < 3n; d++) {
    await success("XP", xp, "awardXP", awardArgs(weekUser, R1000),
      elevated, START + d * DAY);
  }
  const extra = awardArgs(weekUser, R25);
  await reject("XP", xp, "awardXP", extra, "WeeklyLimitReached",
    standard, START + 2n * DAY);
  const weekId = START / WEEK;
  assert.equal((await read("XP", xp, "weeklyXP", [weekUser.toString(), weekId]))[0], 3000n);
  assert.equal((await read("XP", xp, "totalXP", [weekUser.toString()]))[0], 3025n);
});

await test("New fixed seven-day epoch resets per-wallet weekly bucket", async () => {
  const nextEpoch = START + WEEK;
  await success("XP", xp, "awardXP", awardArgs(weekUser, R25),
    standard, nextEpoch);
  const weekId = nextEpoch / WEEK;
  assert.equal((await read("XP", xp, "weeklyXP", [weekUser.toString(), weekId]))[0], 25n);
  assert.equal((await read("XP", xp, "totalXP", [weekUser.toString()]))[0], 3050n);
});

await test("Emergency pause blocks awards; failed proof remains claimable", async () => {
  const proof = awardArgs(pauseUser, R25);
  await success("XP", xp, "setPaused", [true]);
  await reject("XP", xp, "awardXP", proof, "AwardsPaused", standard);
  await success("XP", xp, "setPaused", [false]);
  await success("XP", xp, "awardXP", proof, standard);
});

await test("Disabled rules block awards and may be reactivated", async () => {
  const proof = awardArgs(switchUser, RSWITCH);
  await success("XP", xp, "setRuleActive", [RSWITCH, false]);
  await reject("XP", xp, "awardXP", proof, "RuleNotActive", standard);
  await success("XP", xp, "setRuleActive", [RSWITCH, true]);
  await success("XP", xp, "awardXP", proof, standard);
});

await test("Verifier role revocation immediately blocks new awards", async () => {
  const proof = awardArgs(revokedUser, R25);
  await success("XP", xp, "setVerifierRole", [standard.toString(), 0]);
  await reject("XP", xp, "awardXP", proof, "NotAuthorizedVerifier", standard);
  await success("XP", xp, "setVerifierRole", [standard.toString(), 1]);
  await success("XP", xp, "awardXP", proof, standard);
});

await test("Two-step ownership change removes old owner's privileges", async () => {
  await success("XP", xp, "proposeOwner", [incomingOwner.toString()]);
  await reject("XP", xp, "acceptOwnership", [], "NotPendingOwner", outsider);
  await success("XP", xp, "acceptOwnership", [], incomingOwner);
  await reject("XP", xp, "setPaused", [true], "NotOwner", owner);
  await success("XP", xp, "setPaused", [true], incomingOwner);
  await success("XP", xp, "setPaused", [false], incomingOwner);
});

await test("XP does not mutate core Genesis XP, Tier, or active Path", async () => {
  const core = (await read("PIE", pie, "getIdentity", [alice.toString()]))[0];
  assert.equal(core[1], 25n);
  assert.equal(core[3], 0n);
  assert.equal((await read("PIE", pie, "getCurrentPath", [alice.toString()]))[0], 1n);
  assert.equal((await read("XP", xp, "totalXP", [alice.toString()]))[0], 1050n);
});
assert.equal(passed, TOTAL);
console.log("✅ 17/17 BOUNDARY & SECURITY CHECKS PASSED");
console.log("Note: preliminary stateful tests, not audit, actual chain transactions, or Sybil-proof verification.");
