// SPDX-License-Identifier: MIT
// GFLO PIE Core v0.2 — first stateful Termux/EthereumJS smoke test.
// Works with already installed @ethereumjs/vm@10, solc-js and ethers v6.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import { createVM } from "@ethereumjs/vm";
import { Common, Hardfork, Mainnet } from "@ethereumjs/common";
import { createAccount, createAddressFromString, hexToBytes, bytesToHex } from "@ethereumjs/util";

const repo = join(homedir(), "gflo-pie");
const gfloRequire = createRequire(join(repo, "package.json"));
const solc = gfloRequire("solc");
const { Interface } = gfloRequire("ethers");

const source = execFileSync(
  "git",
  ["show", "origin/feature/pie-core-v0.2:contracts/PIECoreV02.sol"],
  { cwd: repo, encoding: "utf8" },
);
const input = {
  language: "Solidity",
  sources: { "PIECoreV02.sol": { content: source } },
  settings: {
    evmVersion: "cancun",
    outputSelection: { "*": { "*": ["abi", "evm.deployedBytecode.object"] } },
  },
};
const output = JSON.parse(solc.compile(JSON.stringify(input)));
for (const error of output.errors ?? []) {
  if (error.severity === "error") throw new Error(error.formattedMessage);
}
const contractOutput = output.contracts?.["PIECoreV02.sol"]?.PIECoreV02;
assert.ok(contractOutput?.evm?.deployedBytecode?.object, "Missing deployed runtime bytecode");
const iface = new Interface(contractOutput.abi);

const vm = await createVM({ common: new Common({ chain: Mainnet, hardfork: Hardfork.Cancun }) });
const contract = createAddressFromString("0x0000000000000000000000000000000000000c02");
const alice = createAddressFromString("0x00000000000000000000000000000000000000a1");
const bob = createAddressFromString("0x00000000000000000000000000000000000000b2");

// This first smoke test injects runtime bytecode; PIECoreV02 has no constructor.
await vm.stateManager.putCode(contract, hexToBytes("0x" + contractOutput.evm.deployedBytecode.object));
for (const user of [alice, bob]) {
  await vm.stateManager.putAccount(user, createAccount({ balance: 10n ** 18n }));
}

async function invoke(name, args = [], caller = alice) {
  const data = hexToBytes(iface.encodeFunctionData(name, args));
  const result = await vm.evm.runCall({ caller, to: contract, data, gasLimit: 3_000_000n });
  return result;
}
async function read(name, args = [], caller = alice) {
  const r = await invoke(name, args, caller);
  if (r.execResult.exceptionError) throw r.execResult.exceptionError;
  return iface.decodeFunctionResult(name, bytesToHex(r.execResult.returnValue));
}
async function write(name, args = [], caller = alice) {
  const r = await invoke(name, args, caller);
  if (r.execResult.exceptionError) throw r.execResult.exceptionError;
}
function ok(title) { console.log("✅", title); }

console.log("=== GFLO PIE v0.2 — CONTRACT SMOKE TEST ===");
console.log("Compiler:", solc.version());

const empty = (await read("getIdentity", [alice.toString()]))[0];
assert.equal(empty[0], false);
assert.equal((await read("getCurrentPath", [alice.toString()]))[0], 0n);
ok("Unregistered wallet has no identity / Path None");

await write("createIdentity", [3], alice); // target Praxis
const genesis = (await read("getIdentity", [alice.toString()]))[0];
assert.equal(genesis[0], true);
assert.equal(genesis[1], 25n);
assert.equal(genesis[2], 3n);
assert.equal(genesis[3], 0n);
assert.equal((await read("getCurrentPath", [alice.toString()]))[0], 1n);
ok("Genesis: 25 XP, Praxis goal, actual Sovereign/Tier 0");

const duplicate = await invoke("createIdentity", [2], alice);
assert.ok(duplicate.execResult.exceptionError, "Duplicate Genesis must revert");
assert.equal(((await read("getIdentity", [alice.toString()]))[0])[1], 25n);
ok("Duplicate Genesis rejected; XP remains 25");

await write("setSelectedPath", [2], alice);
const revised = (await read("getIdentity", [alice.toString()]))[0];
assert.equal(revised[2], 2n);
assert.equal(revised[1], 25n);
assert.equal(revised[3], 0n);
ok("Target changed to Reformer without changing XP/Tier");

assert.equal((await read("isValidTransition", [0, 1]))[0], true);
assert.equal((await read("isValidTransition", [1, 2]))[0], true);
assert.equal((await read("isValidTransition", [0, 2]))[0], false);
assert.equal((await read("isValidTransition", [2, 3]))[0], false);
ok("Adjacent tier transitions only; skip / beyond Praxis rejected");

await write("createIdentity", [1], bob);
assert.equal(((await read("getIdentity", [bob.toString()]))[0])[1], 25n);
ok("Second wallet has independent Genesis identity");

console.log("✅ 6/6 smoke checks passed.");
console.log("Note: this is a runtime-code simulation, not deployment, security audit, or the full 11-case suite.");
