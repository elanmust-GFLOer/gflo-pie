// GFLO Ignition v0.1 — Praxis Tier 2 and adversarial burn (native Termux).
// Intentional test fixtures; no actual GFLO funds or network deployment.
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
import {homedir} from "node:os";
import {join} from "node:path";
import {createVM} from "@ethereumjs/vm";
import {createBlock} from "@ethereumjs/block";
import {Common,Mainnet,Hardfork} from "@ethereumjs/common";
import {createAccount,createAddressFromString,hexToBytes,bytesToHex} from "@ethereumjs/util";

const repo=join(homedir(),"gflo-pie"),req=createRequire(join(repo,"package.json"));
const solc=req("solc"),{Interface,keccak256,id}=req("ethers");
const entries={
 core:["PIECoreIgnitionV01.sol","PIECoreIgnitionV01"],
 xp:["XPPolicyV02.sol","XPPolicyV02"],
 reg:["TrustedXPSourceRegistryV02.sol","TrustedXPSourceRegistryV02"],
 token:["test/GFLOFaultBurnTokenV01.sol","GFLOFaultBurnTokenV01"],
 ign:["GFLOIgnitionV01.sol","GFLOIgnitionV01"]
};
const sources=Object.fromEntries(Object.values(entries).map(([file])=>[file,{
 content:execFileSync("git",["show","origin/feature/pie-core-v0.2:contracts/"+file],{cwd:repo,encoding:"utf8"})}]));
const out=JSON.parse(solc.compile(JSON.stringify({language:"Solidity",sources,settings:{
 optimizer:{enabled:true,runs:200},evmVersion:"cancun",
 outputSelection:{"*":{"*":["abi","evm.bytecode.object"]}}}})));
for(const e of out.errors??[])if(e.severity==="error")throw Error(e.formattedMessage);
const abi={},code={};
for(const [k,[file,name]]of Object.entries(entries)){
 const c=out.contracts[file][name];abi[k]=new Interface(c.abi);code[k]=c.evm.bytecode.object;
}
const common=new Common({chain:Mainnet,hardfork:Hardfork.Cancun});
const vm=await createVM({common});
const WEEK=7n*86400n, DAY=86400n;
const START=1700000000n-1700000000n%WEEK+DAY;
const blockAt=timestamp=>createBlock({header:{number:1n,timestamp,gasLimit:30000000n}},{common,skipConsensusFormatValidation:true});
const addr=x=>createAddressFromString("0x"+x.padStart(40,"0"));
const creator=addr("d1"),admin=addr("01"),verifier=addr("f1"),alice=addr("a1"),outsider=addr("ee");
for(const v of [creator,admin,verifier,alice,outsider])await vm.stateManager.putAccount(v,createAccount({balance:10n**18n}));
async function deploy(k,args=[]){
 const r=await vm.evm.runCall({caller:creator,data:hexToBytes("0x"+code[k]+abi[k].encodeDeploy(args).slice(2)),gasLimit:12000000n,block:blockAt(START)});
 if(r.execResult.exceptionError)throw Error("CREATE "+k+": "+r.execResult.exceptionError.error);
 assert.ok(r.createdAddress);return r.createdAddress;
}
async function invoke(k,to,fn,args=[],sender=alice,timestamp=START){
 return (await vm.evm.runCall({caller:sender,to,data:hexToBytes(abi[k].encodeFunctionData(fn,args)),gasLimit:6000000n,block:blockAt(timestamp)})).execResult;
}
async function ok(k,to,fn,args=[],sender=alice,timestamp=START){
 const r=await invoke(k,to,fn,args,sender,timestamp);
 if(r.exceptionError)throw Error(k+"."+fn+": "+r.exceptionError.error+" "+bytesToHex(r.returnValue));
 return abi[k].decodeFunctionResult(fn,bytesToHex(r.returnValue));
}
async function fail(k,to,fn,args=[],sender=alice,timestamp=START){
 const r=await invoke(k,to,fn,args,sender,timestamp);
 assert.ok(r.exceptionError,k+"."+fn+" unexpectedly succeeded");
}
async function value(k,to,fn,args=[]){return (await ok(k,to,fn,args))[0];}
let passed=0;const TOTAL=10;
async function check(label,action){await action();console.log("✅ "+(++passed)+"/"+TOTAL+" "+label);}
console.log("=== GFLO IGNITION — TIER 2 & ATOMIC ROLLBACK ===");
console.log("solc:",solc.version());
const core=await deploy("core",[admin.toString()]);
const xp=await deploy("xp",[core.toString(),admin.toString()]);
const reg=await deploy("reg",[core.toString(),admin.toString()]);
const token=await deploy("token");
const ign=await deploy("ign",[core.toString(),reg.toString(),token.toString(),100n,200n]);
await ok("core",core,"bindIgnition",[ign.toString()],admin);
await ok("reg",reg,"proposePolicy",[xp.toString(),keccak256(bytesToHex(await vm.stateManager.getCode(xp))),admin.toString()],admin);
await ok("reg",reg,"activatePolicy",[],admin);
await ok("reg",reg,"setPaused",[false],admin);
await ok("core",core,"createIdentity",[3],alice);
await ok("token",token,"mint",[alice.toString(),1000n],admin);
await ok("token",token,"approve",[ign.toString(),1000n],alice);
await ok("xp",xp,"setVerifierRole",[verifier.toString(),2],admin);
const rule=id("TIER2_1000_XP");
await ok("xp",xp,"registerRule",[rule,1000,20,0],admin);
let eventSeq=0;
async function award(t){
 eventSeq++;
 await ok("xp",xp,"awardXP",[alice.toString(),rule,id("ign-tier2-event-"+eventSeq),id("ign-tier2-evidence-"+eventSeq)],verifier,t);
}
const tier=async()=>(await ok("core",core,"getIdentity",[alice.toString()]))[0][3];
async function balances(){
 return {wallet:await value("token",token,"balanceOf",[alice.toString()]),
 supply:await value("token",token,"totalSupply"),
 allowance:await value("token",token,"allowance",[alice.toString(),ign.toString()]),tier:await tier()};
}
await check("Tier 2 cannot be skipped at Genesis",async()=>{
 await fail("core",core,"upgradeTier",[alice.toString(),2],outsider);
 assert.equal(await tier(),0n);
});
await award(START);
await check("Canonical XP 1025 qualifies for Tier 1",async()=>{
 assert.equal(await value("reg",reg,"totalXP",[alice.toString()]),1025n);
 await ok("ign",ign,"ignite",[]);
 assert.equal(await tier(),1n);
 assert.equal((await balances()).wallet,900n);
});
await check("Four other days/epochs respect daily and weekly XP quotas",async()=>{
 await award(START+DAY);
 await award(START+2n*DAY);
 await award(START+WEEK);
 await award(START+WEEK+DAY);
 assert.equal(await value("reg",reg,"totalXP",[alice.toString()]),5025n);
 assert.equal(await value("xp",xp,"dailyXP",[alice.toString(),START/DAY]),1000n);
 assert.equal(await value("xp",xp,"weeklyXP",[alice.toString(),START/WEEK]),3000n);
 assert.equal(await value("xp",xp,"weeklyXP",[alice.toString(),(START+WEEK)/WEEK]),2000n);
});
await check("Invalid owner cannot rebind Ignition after deployment",async()=>{
 await fail("core",core,"bindIgnition",[ign.toString()],outsider);
 await fail("core",core,"bindIgnition",[ign.toString()],admin);
});
async function failedBurn(mode){
 await ok("token",token,"setMode",[mode],admin);
 const before=await balances();
 await fail("ign",ign,"ignite",[]);
 assert.deepEqual(await balances(),before);
}
await check("Forced burn revert preserves Tier, balance, supply and allowance",async()=>failedBurn(1));
await check("Silent no-op burn rejected with full state rollback",async()=>failedBurn(2));
await check("Partial burn rejected with full EVM rollback",async()=>failedBurn(3));
await check("Token callback cannot recursively ignite",async()=>{
 await ok("token",token,"setMode",[4],admin);
 const before=await balances();
 await ok("ign",ign,"ignite",[]);
 assert.equal(await value("token",token,"callbackSucceeded"),false);
 assert.equal(await tier(),2n);
 assert.equal((await balances()).wallet,before.wallet-200n);
 assert.equal((await balances()).supply,before.supply-200n);
 assert.equal((await balances()).allowance,before.allowance-200n);
});
await check("Praxis reached with 5025 XP, and currentPath is Praxis",async()=>{
 assert.equal(await value("reg",reg,"totalXP",[alice.toString()]),5025n);
 assert.equal(await tier(),2n);
 assert.equal(await value("core",core,"getCurrentPath",[alice.toString()]),3n);
});
await check("No further Tier or burn beyond Praxis",async()=>{
 const before=await balances();
 await fail("ign",ign,"ignite",[]);
 assert.deepEqual(await balances(),before);
});
assert.equal(passed,TOTAL);
console.log("✅ 10/10 TIER 2 & ATOMIC ROLLBACK CHECKS PASS");
console.log("Scope: EthereumJS in-memory VM and adversarial mock; no live token, signed tx, or security audit.");
