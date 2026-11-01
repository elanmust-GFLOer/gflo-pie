// GFLO RED TEAM 2A: REAL Safe v1.5 signed outer transactions + receipts.
// Local EthereumJS v10, synthetic private keys only. Not an external network/audit.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
import {homedir} from "node:os";
import {join} from "node:path";
import {createVM,runTx} from "@ethereumjs/vm";
import {createLegacyTx} from "@ethereumjs/tx";
import {createBlock} from "@ethereumjs/block";
import {Common,Mainnet,Hardfork} from "@ethereumjs/common";
import {createAccount,createAddressFromPrivateKey,createAddressFromString,hexToBytes,bytesToHex} from "@ethereumjs/util";

const repo=join(homedir(),"gflo-pie"),req=createRequire(join(repo,"package.json"));
const localReq=createRequire(import.meta.url);
const solc=req("solc"),{Interface,Wallet,getCreateAddress,ZeroAddress,parseUnits,id,keccak256}=req("ethers");
const root=join(process.cwd(),"node_modules/@safe-global/safe-smart-account/build/artifacts/contracts");
const artifacts={
 safe:JSON.parse(fs.readFileSync(join(root,"Safe.sol/Safe.json"),"utf8")),
 factory:JSON.parse(fs.readFileSync(join(root,"proxies/SafeProxyFactory.sol/SafeProxyFactory.json"),"utf8"))
};
const files={"XPPolicyV02.sol":"XPPolicyV02","PIECoreIgnitionV01.sol":"PIECoreIgnitionV01","TrustedXPSourceRegistryV02.sol":"TrustedXPSourceRegistryV02","GFLOIgnitionV01.sol":"GFLOIgnitionV01","GFLOFixedSupplyV01.sol":"GFLOFixedSupplyV01"};
const sources=Object.fromEntries(Object.keys(files).map(f=>[f,{content:execFileSync("git",["show","origin/feature/pie-core-v0.2:contracts/"+f],{cwd:repo,encoding:"utf8"})}]));
const ozRoot=path.dirname(localReq.resolve("@openzeppelin/contracts/package.json"));
const compiled=JSON.parse(solc.compile(JSON.stringify({language:"Solidity",sources,settings:{optimizer:{enabled:true,runs:200},evmVersion:"cancun",outputSelection:{"*":{"*":["abi","evm.bytecode.object"]}}}}),{import:(name)=>{
 try{
  if(!name.startsWith("@openzeppelin/contracts/"))return {error:"unexpected import "+name};
  const target=path.resolve(ozRoot,name.slice("@openzeppelin/contracts/".length));
  if(!target.startsWith(ozRoot+path.sep))return {error:"unsafe import"};
  return {contents:fs.readFileSync(target,"utf8")};
 }catch(e){return {error:String(e)};}
}}));
for(const e of compiled.errors??[])if(e.severity==="error")throw Error(e.formattedMessage);
for(const [f,n] of Object.entries(files))artifacts[({XPPolicyV02:"xp",PIECoreIgnitionV01:"core",TrustedXPSourceRegistryV02:"registry",GFLOIgnitionV01:"ignition",GFLOFixedSupplyV01:"token"})[n]]=compiled.contracts[f][n];
const abi=Object.fromEntries(Object.entries(artifacts).map(([k,v])=>[k,new Interface(v.abi)]));
const bytecode=k=>{const b=artifacts[k].bytecode?.object??artifacts[k].bytecode??artifacts[k].evm.bytecode.object;return b.startsWith("0x")?b:"0x"+b;};
const common=new Common({chain:Mainnet,hardfork:Hardfork.Cancun}),vm=await createVM({common});
const secret=c=>hexToBytes("0x"+c.repeat(32));
const keys={deployer:secret("a1"),relayer:secret("a2"),outsider:secret("a3"),alice:secret("a4"),verifier:secret("a5")};
const senders={};
for(const [name,key] of Object.entries(keys)){
 const address=createAddressFromPrivateKey(key);
 senders[name]={key,address,nonce:0n};
 await vm.stateManager.putAccount(address,createAccount({balance:10n**23n}));
}
const owners=["11","22","33"].map(c=>new Wallet("0x"+c.repeat(32)));
const TEST_GAS=22000000n,GAS_PRICE=2000000000n;
let activeTimestamp=1000n;
const atDay=day=>{activeTimestamp=BigInt(day)*86400n+1000n;};
async function tx(name,to,data,status=1){
 const s=senders[name],before=s.nonce;
 const signed=createLegacyTx({nonce:before,gasLimit:TEST_GAS,gasPrice:GAS_PRICE,
   ...(to?{to:to.toString()}:{}),data:hexToBytes(data)},{common}).sign(s.key);
 const block=createBlock({header:{timestamp:activeTimestamp,gasLimit:30000000n}},{common});
 const out=await runTx(vm,{tx:signed,block});
 assert.equal(Number(out.receipt.status),status,"tx receipt status for "+name+" nonce "+before);
 assert.ok(out.totalGasSpent>21000n,"gas must be accounted");
 s.nonce++;
 assert.equal((await vm.stateManager.getAccount(s.address)).nonce,s.nonce,"outer nonce was not consumed");
 if(status===0)assert.equal(out.receipt.logs.length,0,"failed outer transaction emitted logs");
 return out;
}
async function deploy(name,k,args=[]){
 const s=senders[name],address=getCreateAddress({from:s.address.toString(),nonce:s.nonce});
 const receipt=await tx(name,null,bytecode(k)+abi[k].encodeDeploy(args).slice(2));
 assert.ok((await vm.stateManager.getCode(createAddressFromString(address))).length>0,"deployment runtime empty");
 return {address,receipt};
}
async function send(name,k,address,fn,args=[],status=1){
 return tx(name,address,abi[k].encodeFunctionData(fn,args),status);
}
async function read(k,address,fn,args=[]){
 const viewer=createAddressFromString("0x"+"fe".repeat(20));
 await vm.stateManager.checkpoint();
 try{
  const res=(await vm.evm.runCall({caller:viewer,to:createAddressFromString(address),
   isStatic:true,gasLimit:2000000n,data:hexToBytes(abi[k].encodeFunctionData(fn,args))})).execResult;
  if(res.exceptionError)throw Error("read "+k+"."+fn+": "+res.exceptionError.error);
  return abi[k].decodeFunctionResult(fn,bytesToHex(res.returnValue))[0];
 }finally{await vm.stateManager.revert();}
}
let n=0;const N=14;
async function check(title,fn){await fn();console.log("✅ "+(++n)+"/"+N+" "+title);}
console.log("=== GFLO RED TEAM 3 — SIGNED PRAXIS XP TIME WINDOWS ===");
console.log("Solc:",solc.version());
const singleton=(await deploy("deployer","safe")).address;
const factory=(await deploy("deployer","factory")).address;
const init=abi.safe.encodeFunctionData("setup",[owners.map(w=>w.address),2,ZeroAddress,"0x",ZeroAddress,ZeroAddress,0,ZeroAddress]);
// The SafeProxyFactory returns the deployed proxy through its ProxyCreation log;
// parse instead of assuming its CREATE2 address.
const created=await send("deployer","factory",factory,"createProxyWithNonce",[singleton,init,20261015n]);
const logs=created.receipt.logs;
let proxy;
for(const log of logs){
 try{
  const decoded=abi.factory.parseLog({topics:log[1].map(bytesToHex),data:bytesToHex(log[2])});
  if(decoded?.name==="ProxyCreation")proxy=decoded.args.proxy;
 }catch{}
}
assert.ok(proxy,"Missing official Safe ProxyCreation event");
const core=(await deploy("deployer","core",[proxy])).address;
const xp=(await deploy("deployer","xp",[core,proxy])).address;

const account=senders.alice.address.toString();
const verifierAddress=senders.verifier.address.toString();
const registry=(await deploy("deployer","registry",[core,proxy])).address;
const initialSupply=parseUnits("1000",18),tier1Fee=parseUnits("1",18);
const token=(await deploy("deployer","token",[account,initialSupply])).address;
const ignition=(await deploy("deployer","ignition",[core,registry,token,tier1Fee,2n*tier1Fee])).address;
async function currentHash(target,data){
 return read("safe",proxy,"getTransactionHash",[target,0,data,0,0,0,0,ZeroAddress,ZeroAddress,await read("safe",proxy,"nonce")]);
}
function signatures(hash,who){
 return "0x"+who.map(w=>({addr:w.address.toLowerCase(),sig:w.signingKey.sign(hash).serialized.slice(2)}))
 .sort((a,b)=>a.addr.localeCompare(b.addr)).map(x=>x.sig).join("");
}
async function safeSubmit(target,data,who=[owners[0],owners[1]],status=1){
 const h=await currentHash(target,data);
 return send("relayer","safe",proxy,"execTransaction",[target,0,data,0,0,0,0,ZeroAddress,ZeroAddress,signatures(h,who)],status);
}
async function admin(k,target,fn,args=[]){
 const data=abi[k].encodeFunctionData(fn,args);
 const r=await safeSubmit(target,data);
 assert.ok(r.receipt.logs.some(l=>{try{return abi.safe.parseLog({topics:l[1].map(bytesToHex),data:bytesToHex(l[2])})?.name==="ExecutionSuccess"}catch{return false}}),
  "Missing Safe ExecutionSuccess event for "+k+"."+fn);
 return r;
}
async function state(){
 return {
  supply:await read("token",token,"totalSupply"),
  balance:await read("token",token,"balanceOf",[account]),
  allowance:await read("token",token,"allowance",[account,ignition]),
  tier:(await read("core",core,"getIdentity",[account])).tier,
  safeNonce:await read("safe",proxy,"nonce")
 };
}
async function rejectedIgnition(label,expected){
 const before=await state();
 const receipt=await send("alice","ignition",ignition,"ignite",[],0);
 const after=await state();
 assert.deepEqual(after,before,label+" mutated state on failed signed transaction");
 assert.equal(receipt.receipt.logs.length,0);
 if(expected)assert.equal(after.tier,expected);
}
await check("Signed Safe + Core + XP + Registry + Token + Ignition deployments",async()=>{
 assert.equal(await read("safe",proxy,"getThreshold"),2n);
 assert.equal((await read("safe",proxy,"getOwners")).length,3);
 assert.equal(await read("core",core,"bindingAuthority"),proxy);
 assert.equal(await read("xp",xp,"owner"),proxy);
 assert.equal(await read("registry",registry,"governance"),proxy);
 assert.equal(await read("token",token,"totalSupply"),initialSupply);
});
await check("One Safe signer cannot bind ignition; signed failure preserves nonce",async()=>{
 const before=await read("safe",proxy,"nonce");
 await safeSubmit(core,abi.core.encodeFunctionData("bindIgnition",[ignition]),[owners[0]],0);
 assert.equal(await read("safe",proxy,"nonce"),before);
 assert.equal(await read("core",core,"ignition"),ZeroAddress);
});
await check("Two Safe signers bind ignition and activate canonical registry",async()=>{
 await admin("core",core,"bindIgnition",[ignition]);
 const runtime=await vm.stateManager.getCode(createAddressFromString(xp));
 await admin("registry",registry,"proposePolicy",[xp,keccak256(bytesToHex(runtime)),proxy]);
 await admin("registry",registry,"activatePolicy");
 await admin("registry",registry,"setPaused",[false]);
 assert.equal(await read("core",core,"ignition"),ignition);
 assert.equal(await read("registry",registry,"activeSource"),xp);
});
await send("alice","core",core,"createIdentity",[3]);
await check("25 Genesis XP blocks signed ignition without allowance; token stays intact",async()=>{
 assert.equal(await read("registry",registry,"totalXP",[account]),25n);
 await rejectedIgnition("lowXP_without_allowance",0n);
});
await check("Signed approval exists; low XP still reverts with identical state",async()=>{
 const approval=await send("alice","token",token,"approve",[ignition,tier1Fee]);
 assert.ok(approval.receipt.logs.length>0);
 await rejectedIgnition("lowXP_with_allowance",0n);
});
await check("Safe 2/3 approves XP verifier and reward rule; canonical XP 1025",async()=>{
 await admin("xp",xp,"setVerifierRole",[verifierAddress,2]);
 const rule=id("REDTEAM2B_1000_XP");
 await admin("xp",xp,"registerRule",[rule,1000,1,0]);
 await send("verifier","xp",xp,"awardXP",[account,rule,id("REDTEAM2B_EVENT"),id("REDTEAM2B_EVIDENCE")]);
 assert.equal(await read("registry",registry,"totalXP",[account]),1025n);
 assert.equal((await read("core",core,"getIdentity",[account])).xp,25n);
});
await check("Insufficient allowance rejects signed ignition and preserves all state",async()=>{
 await send("alice","token",token,"approve",[ignition,0n]);
 await rejectedIgnition("insufficient_allowance",0n);
});
await check("Signed valid Ignition burns exactly 1 GFLO and advances only Tier 1",async()=>{
 await send("alice","token",token,"approve",[ignition,tier1Fee]);
 const before=await state();
 const success=await send("alice","ignition",ignition,"ignite");
 assert.ok(success.receipt.logs.length>=3,"Ignition receipt must contain token/Core/Ignition logs");
 const topics=success.receipt.logs.map(l=>bytesToHex(l[1][0]));
 assert.ok(topics.includes(abi.ignition.getEvent("Ignited").topicHash),"Ignited event missing");
 assert.ok(topics.includes(abi.core.getEvent("TierUpgraded").topicHash),"TierUpgraded event missing");
 const after=await state();
 assert.equal(after.supply,before.supply-tier1Fee);
 assert.equal(after.balance,before.balance-tier1Fee);
 assert.equal(after.allowance,0n);
 assert.equal(after.tier,1n);
 assert.equal(after.safeNonce,before.safeNonce);
});
await check("Second signed ignition under Praxis XP threshold reverts atomically",async()=>{
 await send("alice","token",token,"approve",[ignition,2n*tier1Fee]);
 await rejectedIgnition("below_Praxis_threshold",1n);
});
const rewardRule=id("REDTEAM3_FRESH_1000");
await admin("xp",xp,"registerRule",[rewardRule,1000,8,0]);
async function award(eventName,evidenceName,status=1,who="verifier"){
 return send(who,"xp",xp,"awardXP",[account,rewardRule,id(eventName),id(evidenceName)],status);
}
async function xpNow(){return read("registry",registry,"totalXP",[account]);}
await check("Unknown verifier and recycled event/evidence are rejected by signed receipts",async()=>{
 const before=await xpNow();
 await award("REDTEAM3_UNAUTHORIZED","REDTEAM3_UNAUTHORIZED_EVIDENCE",0,"outsider");
 await award("REDTEAM2B_EVENT","REDTEAM3_NEW_EVIDENCE",0);
 await award("REDTEAM3_NEW_EVENT","REDTEAM2B_EVIDENCE",0);
 assert.equal(await xpNow(),before);
});
await check("Same-day second 1000 XP award exceeds 1500 daily cap and rolls back",async()=>{
 const before=await xpNow();
 await award("REDTEAM3_SAME_DAY","REDTEAM3_SAME_DAY_EVIDENCE",0);
 assert.equal(await xpNow(),before);
 assert.equal(await read("xp",xp,"dailyXP",[account,0]),1000n);
});
await check("Three separate days allow 3000 earned XP; fourth award fails weekly cap",async()=>{
 atDay(1);
 await award("REDTEAM3_DAY1","REDTEAM3_EVIDENCE_DAY1");
 atDay(2);
 await award("REDTEAM3_DAY2","REDTEAM3_EVIDENCE_DAY2");
 assert.equal(await xpNow(),3025n);
 atDay(3);
 await award("REDTEAM3_DAY3","REDTEAM3_EVIDENCE_DAY3",0);
 assert.equal(await xpNow(),3025n);
 assert.equal(await read("xp",xp,"weeklyXP",[account,0]),3000n);
});
await check("Week 2 legitimate rewards raise canonical XP to 5025",async()=>{
 atDay(7);
 await award("REDTEAM3_DAY7","REDTEAM3_EVIDENCE_DAY7");
 atDay(8);
 await award("REDTEAM3_DAY8","REDTEAM3_EVIDENCE_DAY8");
 assert.equal(await xpNow(),5025n);
 assert.equal(await read("xp",xp,"weeklyXP",[account,1]),2000n);
 assert.equal((await read("core",core,"getIdentity",[account])).xp,25n);
});
await check("Signed Praxis ignition burns exactly 2 GFLO and reaches Tier 2 once",async()=>{
 const fee=parseUnits("2",18);
 const prior=await state();
 assert.equal(prior.tier,1n);
 assert.equal(prior.allowance,fee);
 const res=await send("alice","ignition",ignition,"ignite");
 const topics=res.receipt.logs.map(log=>bytesToHex(log[1][0]));
 assert.ok(topics.includes(abi.ignition.getEvent("Ignited").topicHash),"No Ignited event");
 assert.ok(topics.includes(abi.core.getEvent("TierUpgraded").topicHash),"No TierUpgraded event");
 const after=await state();
 assert.equal(after.supply,prior.supply-fee);
 assert.equal(after.balance,prior.balance-fee);
 assert.equal(after.allowance,0n);
 assert.equal(after.tier,2n);
 assert.equal(after.safeNonce,prior.safeNonce);
 const finalBefore=await state();
 await send("alice","ignition",ignition,"ignite",[],0);
 assert.deepEqual(await state(),finalBefore,"Max Tier retry mutated state");
});
assert.equal(n,N);
console.log("✅ 14/14 RED TEAM 3 PRAXIS TIME-WINDOW CHECKS PASS");
console.log("Scope: local EthereumJS signed runTx with block timestamps; not public chain/audit.");
