// GFLO source-authenticity red-team test: Termux + EthereumJS VM.
// Demonstrates known spoof vulnerability, then validates a hash-pinned pilot.
// No main branch change, no real wallet, no public deployment.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import { createVM } from "@ethereumjs/vm";
import { Mainnet, Common, Hardfork } from "@ethereumjs/common";
import { createAccount, createAddressFromString, hexToBytes, bytesToHex } from "@ethereumjs/util";

const repo = join(homedir(), "gflo-pie");
const dep = createRequire(join(repo, "package.json"));
const solc = dep("solc");
const { Interface, keccak256 } = dep("ethers");
const entries = {
  core: ["PIECoreV02.sol", "PIECoreV02"],
  policy: ["XPPolicyV02.sol", "XPPolicyV02"],
  old: ["CanonicalXPAdapterV02.sol", "CanonicalXPAdapterV02"],
  mock: ["test/MaliciousXPPolicyMock.sol", "MaliciousXPPolicyMock"],
  guard: ["CanonicalXPAdapterHashGuardV02.sol", "CanonicalXPAdapterHashGuardV02"],
};
const sources = {};
for (const [file] of Object.values(entries)) {
  sources[file] = {content:execFileSync("git",["show",
    "origin/feature/pie-core-v0.2:contracts/"+file],{cwd:repo,encoding:"utf8"})};
}
const compiled=JSON.parse(solc.compile(JSON.stringify({
  language:"Solidity",sources,settings:{optimizer:{enabled:true,runs:200},
  evmVersion:"cancun",outputSelection:{"*":{"*":["abi","evm.bytecode.object"]}}}
})));
for(const error of compiled.errors??[])if(error.severity==="error")throw Error(error.formattedMessage);
const artifacts={},abi={};
for(const [kind,[file,name]] of Object.entries(entries)){
  artifacts[kind]=compiled.contracts[file][name];
  abi[kind]=new Interface(artifacts[kind].abi);
}
const vm=await createVM({common:new Common({chain:Mainnet,hardfork:Hardfork.Cancun})});
const address=x=>createAddressFromString("0x"+x.padStart(40,"0"));
const creator=address("d1"),owner=address("01"),alice=address("a1");
for(const who of [creator,owner,alice]){
  await vm.stateManager.putAccount(who,createAccount({balance:10n**18n}));
}
async function deploy(kind,args=[]){
  const bytes=hexToBytes("0x"+artifacts[kind].evm.bytecode.object+abi[kind].encodeDeploy(args).slice(2));
  const r=await vm.evm.runCall({caller:creator,data:bytes,gasLimit:12000000n});
  if(r.execResult.exceptionError)return {error:r.execResult.exceptionError,bytes:r.execResult.returnValue};
  assert.ok(r.createdAddress,kind+" CREATE produced no address");
  return {address:r.createdAddress};
}
async function read(kind,contract,method,args=[]){
  const r=(await vm.evm.runCall({caller:alice,to:contract,
    data:hexToBytes(abi[kind].encodeFunctionData(method,args)),gasLimit:4000000n})).execResult;
  if(r.exceptionError)throw r.exceptionError;
  return abi[kind].decodeFunctionResult(method,bytesToHex(r.returnValue));
}
async function write(kind,contract,method,args=[],sender=alice){
  const r=(await vm.evm.runCall({caller:sender,to:contract,
    data:hexToBytes(abi[kind].encodeFunctionData(method,args)),gasLimit:4000000n})).execResult;
  if(r.exceptionError)throw r.exceptionError;
}
async function rejectConstructor(kind,args,expected){
  const r=await deploy(kind,args);
  assert.ok(r.error,"Expected "+expected+" but CREATE succeeded");
  const actual=abi[kind].parseError(bytesToHex(r.bytes));
  assert.equal(actual?.name,expected);
}
let done=0;
async function check(title,test){await test();console.log("✅ "+(++done)+"/8 "+title);}
console.log("=== GFLO XP SOURCE AUTHENTICITY — RED TEAM ===");
console.log("solc:",solc.version());
const core=(await deploy("core")).address;
const genuine=(await deploy("policy",[core.toString(),owner.toString()])).address;
const forged=(await deploy("mock",[core.toString()])).address;
const old=(await deploy("old",[core.toString(),forged.toString()])).address;
await write("core",core,"createIdentity",[1],alice);
const trustedHash=keccak256(bytesToHex(await vm.stateManager.getCode(genuine)));
const forgedHash=keccak256(bytesToHex(await vm.stateManager.getCode(forged)));
await check("Legitimate and forged policy runtime code hashes differ",async()=>{
  assert.notEqual(trustedHash,forgedHash);
});
await check("ATTACK REPRODUCED: original adapter accepts fake XP source",async()=>{
  assert.equal((await read("old",old,"totalXP",[alice.toString()]))[0],65000n);
  console.log("⚠️ Original adapter trusts fake totalXP = 65000 (intentional failing security property)");
});
await check("Hash-guard rejects forged policy against reviewed genuine hash",async()=>{
  await rejectConstructor("guard",[core.toString(),forged.toString(),trustedHash],"PolicyCodeHashMismatch");
});
await check("NEGATIVE CONTROL: forged policy with forged expected hash passes HashGuard",async()=>{
  const fakeGuard=await deploy("guard",[core.toString(),forged.toString(),forgedHash]);
  assert.ok(fakeGuard.address,"Forged hash accepted by constructor as test expected");
  assert.equal((await read("guard",fakeGuard.address,"totalXP",[alice.toString()]))[0],65000n);
  console.log("⚠️ Untrusted expectedHash permits fabricated XP = 65000. Provenance is NOT solved.");
});
await check("Hash-guard accepts genuine XP Policy with pinned hash",async()=>{
  const r=await deploy("guard",[core.toString(),genuine.toString(),trustedHash]);
  assert.ok(r.address,"Expected valid adapter deployment");
  globalThis.guardAddress=r.address;
});
await check("Approved policy gives correct 25 Genesis XP",async()=>{
  assert.equal((await read("guard",globalThis.guardAddress,"totalXP",[alice.toString()]))[0],25n);
});
await check("Zero expected code hash is rejected",async()=>{
  await rejectConstructor("guard",[core.toString(),genuine.toString(),"0x"+"00".repeat(32)],"EmptyExpectedHash");
});
await check("No XP or policy-replacement mutator exposed",async()=>{
  assert.deepEqual(abi.guard.fragments.filter(f=>f.type==="function").map(f=>f.name).sort(),
    ["expectedPolicyCodeHash","pieCore","totalXP","xpPolicy"].sort());
});
assert.equal(done,8);
console.log("✅ 8/8 SOURCE PROVENANCE SCENARIOS COMPLETED");
console.log("⚠️ Original adapter spoof vulnerability reproduced; hash-guard pilot rejected mismatched runtime.");
console.log("Not a mitigation if the malicious deployer supplies a matching malicious hash.");
