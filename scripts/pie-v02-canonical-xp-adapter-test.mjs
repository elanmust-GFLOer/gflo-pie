// GFLO Canonical XP Adapter v0.2 — EthereumJS Termux integration tests.
// Existing PIECoreV02 and XPPolicyV02 remain unchanged.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import { createVM } from "@ethereumjs/vm";
import { Common, Mainnet, Hardfork } from "@ethereumjs/common";
import { createAccount, createAddressFromString, hexToBytes, bytesToHex } from "@ethereumjs/util";

const repo = join(homedir(), "gflo-pie");
const dep = createRequire(join(repo, "package.json"));
const solc = dep("solc");
const { Interface, id } = dep("ethers");
const names = ["PIECoreV02", "XPPolicyV02", "CanonicalXPAdapterV02"];
const sources = Object.fromEntries(names.map(name=>[
  name+".sol",{content:execFileSync("git",["show",
    "origin/feature/pie-core-v0.2:contracts/"+name+".sol"],
    {cwd:repo,encoding:"utf8"})}
]));
const output=JSON.parse(solc.compile(JSON.stringify({
  language:"Solidity",sources,
  settings:{optimizer:{enabled:true,runs:200},evmVersion:"cancun",
    outputSelection:{"*":{"*":["abi","evm.bytecode.object"]}}}
})));
for(const error of output.errors??[])if(error.severity==="error")throw Error(error.formattedMessage);
const contracts=Object.fromEntries(names.map(name=>[name,output.contracts[name+".sol"][name]]));
const interfaces=Object.fromEntries(names.map(name=>[name,new Interface(contracts[name].abi)]));
const vm=await createVM({common:new Common({chain:Mainnet,hardfork:Hardfork.Cancun})});
const addr=x=>createAddressFromString("0x"+x.padStart(40,"0"));
const creator1=addr("d1"), creator2=addr("d2"), creator3=addr("d3"),
  creator4=addr("d4"), creator5=addr("d5"), owner=addr("01"),
  verifier=addr("f1"), alice=addr("a1"), bob=addr("b1"), ghost=addr("ee");
for(const a of [creator1,creator2,creator3,creator4,creator5,owner,verifier,alice,bob,ghost]){
  await vm.stateManager.putAccount(a,createAccount({balance:10n**18n}));
}
async function deploy(kind,sender,args=[]){
  const init="0x"+contracts[kind].evm.bytecode.object+interfaces[kind].encodeDeploy(args).slice(2);
  const r=await vm.evm.runCall({caller:sender,data:hexToBytes(init),gasLimit:12000000n});
  if(r.execResult.exceptionError)return {error:r.execResult.exceptionError,returnValue:r.execResult.returnValue};
  assert.ok(r.createdAddress,"No address on CREATE");
  assert.ok((await vm.stateManager.getCode(r.createdAddress)).length>0,"Empty deployment runtime");
  return {address:r.createdAddress};
}
async function run(kind,address,method,args=[],sender=alice){
  return (await vm.evm.runCall({caller:sender,to:address,
    data:hexToBytes(interfaces[kind].encodeFunctionData(method,args)),gasLimit:4000000n})).execResult;
}
async function success(kind,address,method,args=[],sender=alice){
  const r=await run(kind,address,method,args,sender);
  if(r.exceptionError)throw r.exceptionError;
  return interfaces[kind].decodeFunctionResult(method,bytesToHex(r.returnValue));
}
async function rejectDeploy(kind,sender,args,errorName){
  const r=await deploy(kind,sender,args);
  assert.ok(r.error,"Expected constructor revert: "+errorName);
  const decoded=interfaces[kind].parseError(bytesToHex(r.returnValue));
  assert.equal(decoded?.name,errorName);
}
let count=0;const TOTAL=9;
async function check(label,fn){
  await fn();count++;console.log(`✅ ${count}/${TOTAL} ${label}`);
}
const CORE="PIECoreV02",XP="XPPolicyV02",ADAPTER="CanonicalXPAdapterV02";
console.log("=== GFLO CANONICAL XP ADAPTER — SECURITY CHECKS ===");
console.log("solc:",solc.version());
const core=(await deploy(CORE,creator1)).address;
const coreOther=(await deploy(CORE,creator4)).address;
const xp=(await deploy(XP,creator2,[core.toString(),owner.toString()])).address;
const adapter=(await deploy(ADAPTER,creator3,[core.toString(),xp.toString()])).address;
await check("Valid adapter pins Core and Policy addresses",async()=>{
  assert.equal((await success(ADAPTER,adapter,"pieCore"))[0].toLowerCase(),core.toString().toLowerCase());
  assert.equal((await success(ADAPTER,adapter,"xpPolicy"))[0].toLowerCase(),xp.toString().toLowerCase());
});
await check("Reject zero or EOA Core or Policy constructor binding",async()=>{
  const empty="0x"+"00".repeat(20);
  await rejectDeploy(ADAPTER,creator5,[empty,xp.toString()],"InvalidContract");
  await rejectDeploy(ADAPTER,creator5,[core.toString(),empty],"InvalidContract");
  await rejectDeploy(ADAPTER,creator5,[ghost.toString(),xp.toString()],"InvalidContract");
  await rejectDeploy(ADAPTER,creator5,[core.toString(),ghost.toString()],"InvalidContract");
});
await check("Reject mismatched PIE Core / XP Policy binding",async()=>{
  await rejectDeploy(ADAPTER,creator5,[coreOther.toString(),xp.toString()],"PolicyCoreMismatch");
});
await check("Unknown identity has zero total XP",async()=>{
  assert.equal((await success(ADAPTER,adapter,"totalXP",[ghost.toString()]))[0],0n);
});
await success(CORE,core,"createIdentity",[3],alice);
await success(CORE,core,"createIdentity",[1],bob);
await check("Two Genesis wallets start at 25 canonical XP",async()=>{
  assert.equal((await success(ADAPTER,adapter,"totalXP",[alice.toString()]))[0],25n);
  assert.equal((await success(ADAPTER,adapter,"totalXP",[bob.toString()]))[0],25n);
});
await success(XP,xp,"setVerifierRole",[verifier.toString(),2],owner);
const rule=id("GFLO_ADAPTER_500");
await success(XP,xp,"registerRule",[rule,500,4,0],owner);
await success(XP,xp,"awardXP",[alice.toString(),rule,id("adapter-event-1"),id("adapter-evidence-1")],verifier);
await check("Adapter reads canonical 525 XP after verified 500 XP award",async()=>{
  assert.equal((await success(ADAPTER,adapter,"totalXP",[alice.toString()]))[0],525n);
});
await check("Other wallet XP remains isolated",async()=>{
  assert.equal((await success(ADAPTER,adapter,"totalXP",[bob.toString()]))[0],25n);
});
await check("Adapter ABI exposes no source replacement or XP mutation",async()=>{
  const names=interfaces[ADAPTER].fragments.filter(f=>f.type==="function").map(f=>f.name);
  assert.deepEqual(names.sort(),["pieCore","totalXP","xpPolicy"].sort());
});
await check("XP awards do not change Core earned Tier",async()=>{
  const identity=(await success(CORE,core,"getIdentity",[alice.toString()]))[0];
  assert.equal(identity[1],25n);
  assert.equal(identity[3],0n);
  assert.equal((await success(CORE,core,"getCurrentPath",[alice.toString()]))[0],1n);
});
assert.equal(count,TOTAL);
console.log("✅ 9/9 CANONICAL XP ADAPTER SECURITY CHECKS PASS");
console.log("Scope: initial immutable address binding; not a bytecode allowlist, verifier audit, or Ignition.");
