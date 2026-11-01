// A real local worker run -> independently recomputed result -> local signed EVM
// claim -> XP -> pilot ignition -> revocable consumer access. No external RPC.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync, execFileSync } from "node:child_process";
import { id, keccak256, toUtf8Bytes } from "ethers";
import checker from "./evidence-checker.cjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const out = path.resolve(here, "../evidence/activity-pilot");
fs.mkdirSync(out, { recursive: true });
// A failed rerun must not leave a stale success report.
for (const name of ["report.json", "evidence.json"]) fs.rmSync(path.join(out, name), { force: true });
// Load/compile only after stale success evidence has been removed.
const { createFixture } = await import("./evm-fixture.mjs");
const sha = bytes => "0x" + createHash("sha256").update(bytes).digest("hex");
const digest = object => keccak256(toUtf8Bytes(checker.canonical(object)));
const clone = object => JSON.parse(JSON.stringify(object));
const f = await createFixture();
const { account, attestor, verifierAddress, core, xp, registry, token, ignition,
  gate, consumer, proxy, tier1Fee, read, send, admin, rejects } = f;
const checks = [], states = [];
async function check(name, fn) {
  await fn(); checks.push({ name, status: "PASS" }); console.log("PASS " + checks.length + " " + name);
}
function child(script, value) {
  const result = spawnSync(process.execPath, [path.join(here, script)], {
    input: JSON.stringify(value), encoding: "utf8", timeout: 10000, maxBuffer: 1024 * 1024
  });
  return result;
}
function checkedChild(script, value) {
  const result = child(script, value);
  assert.ifError(result.error); assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}
const input = JSON.parse(fs.readFileSync(path.join(here, "task-input.json"), "utf8"));
const expected = Object.freeze({ taskId: "octopush-local-reconcile-001",
  rule: "completed-units-v1", runId: "local-run-001", recipient: account,
  executorVersion: "task-worker/0.1.0", inputHash: checker.hash(input),
  workerSourceHash: sha(fs.readFileSync(path.join(here, "task-worker.cjs"))) });
let evidence, verdict, proof, signature, claim;
const ruleId = id("LOCAL_ACTIVITY_RECONCILIATION_1000_XP");
// Stable across attempts and recipients: this rule rewards this one registered
// task once. A new task ID is a new trusted registration, not Sybil prevention.
const eventFor = e => digest({ namespace: "gflo-local-pilot-v1", taskId: e.taskId,
  inputHash: e.inputHash, rule: e.rule });
async function snapshot(stage) {
  states.push({ stage, xp: String(await read("registry", registry, "totalXP", [account])),
    earnedXP: String(await read("xp", xp, "validEarnedXP", [account])),
    achievedTier: String((await read("core", core, "getIdentity", [account])).tier),
    effectiveTier: String(await read("gate", gate, "effectiveTier", [account])),
    successfulUses: String(await read("consumer", consumer, "uses", [account])) });
}
await check("governance binds the declared pilot components and separate signer roles", async () => {
  assert.equal(await read("safe", proxy, "getThreshold"), 2n);
  await admin("core", core, "bindIgnition", [ignition]);
  await admin("registry", registry, "proposePolicy", [xp, await f.codeHash(xp), proxy]);
  await admin("registry", registry, "activatePolicy");
  await admin("registry", registry, "setPaused", [false]);
  await admin("xp", xp, "registerRule", [ruleId, 1000, 3]);
  await admin("xp", xp, "setVerifierRole", [verifierAddress, 2]);
  await admin("xp", xp, "setAttestor", [ruleId, attestor, true]);
  assert.notEqual(attestor, verifierAddress);
  await send("alice", "core", core, "createIdentity", [2]);
  await send("alice", "token", token, "approve", [ignition, tier1Fee]);
  await snapshot("genesis");
});
await check("separate worker process actually executes the registered task", async () => {
  const output = checkedChild("task-worker.cjs", input);
  assert.deepEqual(output, { acceptedIds: ["job-a", "job-b", "job-c"],
    completedCount: 3, totalUnits: "1000" });
  evidence = { version: 1, ...expected, input, output, outputHash: checker.hash(output) };
});
await check("separate checker process recomputes and accepts the worker result", async () => {
  verdict = checkedChild("evidence-checker.cjs", { evidence, expected });
  assert.equal(verdict.verdict, "VALID_DETERMINISTIC_RESULT");
  assert.equal(verdict.evidenceHash, checker.hash(evidence));
});
function checkerRejects(changed, reason) {
  const result = child("evidence-checker.cjs", { evidence: changed, expected });
  assert.ifError(result.error); assert.equal(result.signal, null);
  assert.equal(result.status, 1); assert.match(result.stderr, new RegExp(reason));
}
await check("wrong output with recomputed hash is rejected before signing", async () => {
  const changed = clone(evidence); changed.output.totalUnits = "999999";
  changed.outputHash = checker.hash(changed.output);
  checkerRejects(changed, "WRONG_RESULT");
});
await check("changed input and hashes cannot replace the registered task", async () => {
  const changed = clone(evidence); changed.input.entries[0].units = 1;
  changed.inputHash = checker.hash(changed.input);
  checkerRejects(changed, "ARTIFACT_HASH_MISMATCH");
});
await check("recipient, task, run and executor bindings cannot be relabelled", async () => {
  for (const [field, value] of [["recipient", attestor], ["taskId", "other-task"],
    ["runId", "unregistered-run"], ["workerSourceHash", "0x" + "00".repeat(32)]]) {
    const changed = clone(evidence); changed[field] = value;
    checkerRejects(changed, "BINDING_MISMATCH");
  }
});
await check("invalid worker input is rejected without producing an evidence result", async () => {
  const changed = clone(input); changed.entries[1].id = changed.entries[0].id;
  const result = child("task-worker.cjs", changed);
  assert.ifError(result.error); assert.equal(result.signal, null);
  assert.equal(result.status, 1); assert.match(result.stderr, /INVALID_ENTRY/);
  assert.equal(result.stdout, "");
});
await check("validated evidence is bound into an EIP-712 signed claim", async () => {
  // The fixture operator controls both synthetic keys; different addresses and
  // processes demonstrate boundaries, not real organizational independence.
  assert.equal(checkedChild("evidence-checker.cjs", { evidence, expected }).verdict,
    "VALID_DETERMINISTIC_RESULT");
  proof = [account, ruleId, eventFor(evidence), digest(evidence), 1n, 0n, 864000n];
  signature = await f.signProof(proof);
  const receipt = await send("verifier", "xp", xp, "submit", [proof, attestor, signature]);
  claim = f.claimFromReceipt(receipt);
  await snapshot("pending");
  assert.equal(await read("registry", registry, "totalXP", [account]), 25n);
});
await check("signed proof tampering and unauthorized submission return exact errors", async () => {
  const changed = [...proof]; changed[3] = id("tampered-evidence");
  await rejects("xp", xp, "submit", [changed, attestor, signature], "verifier", "InvalidProof");
  await rejects("xp", xp, "submit", [proof, attestor, signature], "outsider", "NotVerifier");
});
await check("PENDING evidence cannot finalize early, ignite or unlock the consumer", async () => {
  await rejects("xp", xp, "finalize", [claim], "outsider", "TooEarly");
  await rejects("ignition", ignition, "ignite", [], "alice", "InsufficientXP");
  const before = await read("consumer", consumer, "uses", [account]);
  // The consumer propagates the Gate's custom error.
  const failure = await send("alice", "consumer", consumer, "useFeature", [], 0);
  const bytes = "0x" + Buffer.from(failure.execResult.returnValue).toString("hex");
  assert.equal(bytes.slice(0, 10), f.abi.gate.getError("InsufficientEffectiveTier").selector);
  assert.equal(await read("consumer", consumer, "uses", [account]), before);
});
await check("same proof and a separately executed retry cannot earn another grant", async () => {
  await rejects("xp", xp, "submit", [proof, attestor, signature], "verifier", "Replay");
  const retryExpected = { ...expected, runId: "local-run-002" };
  const output = checkedChild("task-worker.cjs", input);
  const retry = { ...evidence, runId: retryExpected.runId, output, outputHash: checker.hash(output) };
  checkedChild("evidence-checker.cjs", { evidence: retry, expected: retryExpected });
  assert.notEqual(digest(retry), digest(evidence));
  assert.equal(eventFor(retry), eventFor(evidence));
  const retriedProof = [...proof]; retriedProof[3] = digest(retry); retriedProof[4] = 2n;
  await rejects("xp", xp, "submit", [retriedProof, attestor, await f.signProof(retriedProof)],
    "verifier", "Replay");
});
await check("finalization adds exactly 1000 XP once after the simulated challenge", async () => {
  f.atDay(3); // Local simulated time only; no real 3-day wait is claimed.
  await send("outsider", "xp", xp, "finalize", [claim]);
  assert.equal(await read("registry", registry, "totalXP", [account]), 1025n);
  await rejects("xp", xp, "finalize", [claim], "outsider", "BadGrantStatus");
  assert.equal(await read("xp", xp, "validEarnedXP", [account]), 1000n);
  assert.equal(await read("gate", gate, "effectiveTier", [account]), 0n);
  await snapshot("finalized-before-ignition");
});
await check("required pilot burn grants Tier 1 and the consumer permits a use", async () => {
  await send("alice", "ignition", ignition, "ignite");
  assert.equal(await read("token", token, "totalSupply"), f.initialSupply - tier1Fee);
  assert.equal(await read("gate", gate, "effectiveTier", [account]), 1n);
  await send("alice", "consumer", consumer, "useFeature");
  assert.equal(await read("consumer", consumer, "uses", [account]), 1n);
  await snapshot("access-granted");
});
await check("revocation removes XP and subsequent access while retaining historical tier", async () => {
  const supply = await read("token", token, "totalSupply");
  await admin("xp", xp, "revoke", [claim, id("LOCAL_PILOT_CORRECTION")]);
  assert.equal(await read("registry", registry, "totalXP", [account]), 25n);
  assert.equal((await read("core", core, "getIdentity", [account])).tier, 1n);
  assert.equal(await read("gate", gate, "effectiveTier", [account]), 0n);
  const failure = await send("alice", "consumer", consumer, "useFeature", [], 0);
  const bytes = "0x" + Buffer.from(failure.execResult.returnValue).toString("hex");
  assert.equal(bytes.slice(0, 10), f.abi.gate.getError("InsufficientEffectiveTier").selector);
  assert.equal(await read("consumer", consumer, "uses", [account]), 1n);
  assert.equal(await read("token", token, "totalSupply"), supply);
  await snapshot("revoked-access-denied");
});
await check("revoked work remains spent and cannot be replayed or finalized", async () => {
  await rejects("xp", xp, "submit", [proof, attestor, signature], "verifier", "Replay");
  await rejects("xp", xp, "finalize", [claim], "outsider", "BadGrantStatus");
});
assert.equal(checks.length, 15);
const tracked = ["tests-redteam5b/package-lock.json", ...f.sourceFiles.map(n => "contracts/" + n),
  ...["task-worker.cjs", "evidence-checker.cjs", "evm-fixture.mjs", "run.mjs", "task-input.json"]
    .map(n => "tests-redteam5b/pilot/" + n)];
const report = { status: "PASS", scope: "LOCAL_DETERMINISTIC_ACTIVITY_PILOT",
  liveOctoPush: false, publicDeployment: false, independentOperators: false,
  head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim(),
  node: process.version, compiler: f.compiler, evm: "Cancun", chainId: f.chainId,
  optimizer: { enabled: true, runs: 200 },
  sourceHashes: Object.fromEntries(tracked.map(n => [n, sha(fs.readFileSync(path.join(repo, n)))])),
  evidenceDigest: digest(evidence), eventId: eventFor(evidence), claimId: claim,
  checkerVerdict: verdict, addresses: { core, xp, registry, token, ignition, gate, consumer, proxy },
  checks, states, receipts: f.receipts,
  limitations: ["Task source, registry and both synthetic signer identities are controlled by this local fixture.",
    "A correct output and valid signature do not prove remote execution, organizational independence or arbitrary activity truth.",
    "1000 XP, 1 token burn and 3-day simulated challenge are test parameters, not approved economics.",
    "No production OctoPush event source, Sybil resistance, audit or migration is established."] };
fs.writeFileSync(path.join(out, "evidence.json"), JSON.stringify(evidence, null, 2) + "\n");
fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2) + "\n");
console.log("ACTIVITY_PILOT_PASS " + checks.length + "/15; report: evidence/activity-pilot/report.json");
