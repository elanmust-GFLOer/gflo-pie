import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
import {homedir} from "node:os";
import {join} from "node:path";
import {createVM} from "@ethereumjs/vm";
import {Common,Mainnet,Hardfork} from "@ethereumjs/common";
import {createAccount,createAddressFromString,hexToBytes,bytesToHex} from "@ethereumjs/util";

const repo=join(homedir(),"gflo-pie"),req=createRequire(join(repo,"package.json"));
const solc=req("solc"),{Interface,keccak256,id}=req("ethers");
const entries={
 core:["PIECoreIgnitionV01.sol","PIECoreIgnitionV01"],
 xp:["XPPolicyV02.sol","XPPolicyV02"],
 reg:["TrustedXPSourceRegistryV02.sol","TrustedXPSourceRegistryV02"],
 token:["test/GFLOTestBurnTokenV01.sol","GFLOTestBurnTokenV01"],
 ignition:["GFLOIgnitionV01.sol","GFLOIgnitionV01"]
};
const sources=Object.fromEntries(Object.values(entries).map(([file])=>[file,{
 content:execFileSync("git",["show","origin/feature/pie-core-v0.2:contracts/"+file],{cwd:repo,encoding:"utf8"})}]));
const result=JSON.parse(solc.compile(JSON.stringify({language:"Solidity",sources,settings:{
 optimizer:{enabled:true,runs:200},evmVersion:"cancun",outputSelection:{"*":{"*":["abi","evm.bytecode.object"]}}}})));
for(const e of result.errors??[])if(e.severity==="error")throw Error(e.formattedMessage);
const abi={},bytecode={};
for(const [k,[file,name]]of Object.entries(entries)){
 const c=result.contracts[file][name];abi[k]=new Interface(c.abi);bytecode[k]=c.evm.bytecode.object;
}
const vm=await createVM({common:new Common({chain:Mainnet,hardfork:Hardfork.Cancun})});
const a=x=>createAddressFromString("0x"+x.padStart(40,"0"));
const creator=a("d1"),owner=a("01"),verifier=a("f1"),alice=a("a1"),bob=a("b1"),outsider=a("ee");
for(const addr of [creator,owner,verifier,alice,bob,outsider])
 await vm.stateManager.putAccount(addr,createAccount({balance:10n**18n}));
async function deploy(k,args=[]){
 const r=await vm.evm.runCall({caller:creator,data:hexToBytes("0x"+bytecode[k]+abi[k].encodeDeploy(args).slice(2)),gasLimit:12000000n});
 if(r.execResult.exceptionError)throw Error(k+" CREATE: "+r.execResult.exceptionError.error);
 assert.ok(r.createdAddress);return r.createdAddress;
}
async function invoke(k,to,method,args=[],caller=alice){
 return (await vm.evm.runCall({caller,to,gasLimit:6000000n,
 data:hexToBytes(abi[k].encodeFunctionData(method,args))})).execResult;
}
async function good(k,to,method,args=[],caller=alice){
 const r=await invoke(k,to,method,args,caller);
 if(r.exceptionError)throw Error(k+"."+method+": "+r.exceptionError.error);
 return abi[k].decodeFunctionResult(method,bytesToHex(r.returnValue));
}
async function fails(k,to,method,args=[],caller=alice){
 const r=await invoke(k,to,method,args,caller);
 assert.ok(r.exceptionError,"Expected failure: "+k+"."+method);
}
let n=0;const TOTAL=9;
async function check(label,fn){await fn();console.log("✅ "+(++n)+"/"+TOTAL+" "+label);}
console.log("=== GFLO IGNITION MVP — ATOMIC EVM ===");
console.log("solc:",solc.version());
const core=await deploy("core",[owner.toString()]);
const xp=await deploy("xp",[core.toString(),owner.toString()]);
const reg=await deploy("reg",[core.toString(),owner.toString()]);
const token=await deploy("token");
const ignition=await deploy("ignition",[core.toString(),reg.toString(),token.toString(),100n,200n]);
await good("core",core,"bindIgnition",[ignition.toString()],owner);
await good("reg",reg,"proposePolicy",[xp.toString(),keccak256(bytesToHex(await vm.stateManager.getCode(xp))),owner.toString()],owner);
await good("reg",reg,"activatePolicy",[],owner);
await good("reg",reg,"setPaused",[false],owner);
await good("core",core,"createIdentity",[3],alice);
await good("core",core,"createIdentity",[1],bob);
await check("Canonical Registry reports 25 Genesis XP",async()=>{
 assert.equal((await good("reg",reg,"totalXP",[alice.toString()]))[0],25n);
});
await check("No tier mutation by outsider",async()=>{
 await fails("core",core,"upgradeTier",[alice.toString(),1],outsider);
 assert.equal((await good("core",core,"getIdentity",[alice.toString()]))[0][3],0n);
});
await good("token",token,"mint",[alice.toString(),1000n],owner);
await good("token",token,"approve",[ignition.toString(),1000n],alice);
await check("Low XP blocks ignition without burning",async()=>{
 await fails("ignition",ignition,"ignite",[],alice);
 assert.equal((await good("token",token,"balanceOf",[alice.toString()]))[0],1000n);
});
await good("xp",xp,"setVerifierRole",[verifier.toString(),2],owner);
const rule=id("IGNITION_MVP_AWARD_1000");
await good("xp",xp,"registerRule",[rule,1000,2,0],owner);
await good("xp",xp,"awardXP",[alice.toString(),rule,id("ignition-event-01"),id("ignition-evidence-01")],verifier);
await check("Earned 1000 XP yields canonical 1025 XP",async()=>{
 assert.equal((await good("reg",reg,"totalXP",[alice.toString()]))[0],1025n);
});
await check("Ignition atomically burns 100 and advances to Tier 1",async()=>{
 await good("ignition",ignition,"ignite",[],alice);
 assert.equal((await good("token",token,"balanceOf",[alice.toString()]))[0],900n);
 assert.equal((await good("token",token,"totalSupply"))[0],900n);
 assert.equal((await good("core",core,"getIdentity",[alice.toString()]))[0][3],1n);
 assert.equal((await good("core",core,"getCurrentPath",[alice.toString()]))[0],2n);
});
await check("Repeat with XP below Praxis threshold cannot double-burn",async()=>{
 await fails("ignition",ignition,"ignite",[],alice);
 assert.equal((await good("token",token,"balanceOf",[alice.toString()]))[0],900n);
 assert.equal((await good("core",core,"getIdentity",[alice.toString()]))[0][3],1n);
});
await good("reg",reg,"setPaused",[true],owner);
await check("Paused canonical Registry blocks future ignition",async()=>{
 await fails("ignition",ignition,"ignite",[],alice);
 assert.equal((await good("token",token,"balanceOf",[alice.toString()]))[0],900n);
});
await good("reg",reg,"setPaused",[false],owner);
await check("Ghost wallet cannot ignite or change tier",async()=>{
 await fails("ignition",ignition,"ignite",[],outsider);
 assert.equal((await good("core",core,"getIdentity",[outsider.toString()]))[0][0],false);
});
await check("Core Genesis XP remains unchanged after ignition",async()=>{
 const identity=(await good("core",core,"getIdentity",[alice.toString()]))[0];
 assert.equal(identity[1],25n);
 assert.equal((await good("reg",reg,"totalXP",[alice.toString()]))[0],1025n);
});
assert.equal(n,TOTAL);
console.log("✅ 9/9 GFLO IGNITION MVP ATOMIC SCENARIOS PASS");
console.log("Scope: local VM pilot only; fees illustrative, Tier 2 success and real token not yet tested.");
