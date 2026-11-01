// GFLO PIE v0.2: 11 EthereumJS VM stateful checks, Termux compatible.
// Requires @ethereumjs/vm, @ethereumjs/common, @ethereumjs/util here;
// solc and ethers in ~/gflo-pie.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import { createVM } from "@ethereumjs/vm";
import { Common, Hardfork, Mainnet } from "@ethereumjs/common";
import { createAccount, createAddressFromString, hexToBytes, bytesToHex } from "@ethereumjs/util";

const repo = join(homedir(), "gflo-pie");
const requireGFLO = createRequire(join(repo, "package.json"));
const solc = requireGFLO("solc");
const { Interface } = requireGFLO("ethers");
const source = execFileSync("git", ["show", "origin/feature/pie-core-v0.2:contracts/PIECoreV02.sol"], { cwd: repo, encoding: "utf8" });
const input = {
  language: "Solidity",
  sources: { "PIECoreV02.sol": { content: source } },
  settings: { evmVersion: "cancun", outputSelection: { "*": { "*": ["abi", "evm.deployedBytecode.object"] } } },
};
const output = JSON.parse(solc.compile(JSON.stringify(input)));
for (const e of output.errors ?? []) if (e.severity === "error") throw new Error(e.formattedMessage);
const compiled = output.contracts?.["PIECoreV02.sol"]?.PIECoreV02;
assert.ok(compiled?.evm?.deployedBytecode?.object, "No deployed bytecode");
const iface = new Interface(compiled.abi);

const vm = await createVM({ common: new Common({ chain: Mainnet, hardfork: Hardfork.Cancun }) });
const contract = createAddressFromString("0x0000000000000000000000000000000000000c02");
const alice = createAddressFromString("0x00000000000000000000000000000000000000a1");
const bob = createAddressFromString("0x00000000000000000000000000000000000000b2");
await vm.stateManager.putCode(contract, hexToBytes("0x" + compiled.evm.deployedBytecode.object));
for (const addr of [alice, bob]) await vm.stateManager.putAccount(addr, createAccount({ balance: 10n ** 18n }));

async function call(name, args = [], sender = alice) {
  const data = hexToBytes(iface.encodeFunctionData(name, args));
  return (await vm.evm.runCall({ caller: sender, to: contract, data, gasLimit: 3_000_000n })).execResult;
}
async function read(name, args = [], sender = alice) {
  const r = await call(name, args, sender);
  if (r.exceptionError) throw r.exceptionError;
  return iface.decodeFunctionResult(name, bytesToHex(r.returnValue));
}
async function success(name, args = [], sender = alice) {
  const r = await call(name, args, sender);
  if (r.exceptionError) throw r.exceptionError;
}
async function revert(name, args, expectedError, sender = alice) {
  const r = await call(name, args, sender);
  assert.ok(r.exceptionError, `Expected revert in ${name}`);
  if (expectedError) {
    const decoded = iface.parseError(bytesToHex(r.returnValue));
    assert.equal(decoded?.name, expectedError, `Wrong revert reason in ${name}`);
  }
}
const addr = a => a.toString();
const identity = async a => (await read("getIdentity", [addr(a)]))[0];
let passed = 0;
async function test(name, run) {
  try { await run(); passed++; console.log(`✅ ${passed}/11 ${name}`); }
  catch (e) { console.error(`❌ FAIL: ${name}\n`, e); process.exitCode = 1; throw e; }
}

console.log("=== GFLO PIE v0.2 - 11 contract tests ===");
console.log("solc:", solc.version());

// Tests are ordered; this suite intentionally exercises persistent identity state.
await test("Unregistered wallet: no identity or active Path", async () => {
  const id = await identity(alice);
  assert.equal(id[0], false); assert.equal(id[1], 0n);
  assert.equal((await read("getCurrentPath", [addr(alice)]))[0], 0n);
});
await test("Genesis: Praxis target still grants only Sovereign / 25 XP", async () => {
  await success("createIdentity", [3], alice);
  const id = await identity(alice);
  assert.equal(id[0], true); assert.equal(id[1], 25n);
  assert.equal(id[2], 3n); assert.equal(id[3], 0n);
  assert.equal((await read("getCurrentPath", [addr(alice)]))[0], 1n);
});
await test("Genesis cannot be claimed a second time", async () => {
  await revert("createIdentity", [2], "IdentityAlreadyExists");
  assert.equal((await identity(alice))[1], 25n);
});
await test("Invalid Genesis target None is rejected", async () => {
  await revert("createIdentity", [0], "InvalidTargetPath", bob);
  assert.equal((await identity(bob))[0], false);
});
await test("Wallet without identity cannot change target", async () => {
  await revert("setSelectedPath", [3], "IdentityDoesNotExist", bob);
});
await test("Changing target leaves XP and Tier unchanged", async () => {
  await success("setSelectedPath", [2], alice);
  const id = await identity(alice);
  assert.equal(id[2], 2n); assert.equal(id[1], 25n); assert.equal(id[3], 0n);
  assert.equal((await read("getCurrentPath", [addr(alice)]))[0], 1n);
});
await test("None cannot be selected as an updated target", async () => {
  await revert("setSelectedPath", [0], "InvalidTargetPath", alice);
  assert.equal((await identity(alice))[2], 2n);
});
await test("Distinct wallets have independent Genesis states", async () => {
  await success("createIdentity", [1], bob);
  assert.equal((await identity(bob))[2], 1n);
  assert.equal((await identity(bob))[1], 25n);
  assert.equal((await identity(alice))[2], 2n);
});
await test("Only consecutive upward transitions are valid", async () => {
  for (const [from, to] of [[0,1],[1,2]]) assert.equal((await read("isValidTransition", [from,to]))[0], true);
  for (const [from, to] of [[0,0],[0,2],[1,0],[1,1],[2,0],[2,1],[2,2],[2,3],[3,4],[255,0]]) {
    assert.equal((await read("isValidTransition", [from,to]))[0], false, `${from} -> ${to}`);
  }
});
await test("nextTier stops at Praxis", async () => {
  assert.equal((await read("nextTier", [0]))[0], 1n);
  assert.equal((await read("nextTier", [1]))[0], 2n);
  const failed = await call("nextTier", [2]);
  assert.ok(failed.exceptionError, "Praxis must be terminal");
});
await test("No XP award or Tier upgrade entrypoint exists in Phase 1", async () => {
  const names = iface.fragments.filter(x => x.type === "function").map(x => x.name);
  for (const forbidden of ["addXP", "awardXP", "upgradeTier", "upgrade", "upgradeToReformer", "upgradeToPraxis"]) {
    assert.ok(!names.includes(forbidden), `Unexpected callable entrypoint: ${forbidden}`);
  }
});
assert.equal(passed, 11);
console.log("✅ 11/11 PASS - PIECoreV02 Phase 1 stateful EVM checks.");
console.log("Scope: injected runtime bytecode, not constructor/deployment or XP/Ignition audit.");
