// GFLO RED TEAM 5C: P0-A signed Tier-2 privilege and emergency-stop regressions.
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
const files={"XPPolicyV03.sol":"XPPolicyV03","PIECoreIgnitionV01.sol":"PIECoreIgnitionV01","TrustedXPSourceRegistryV02.sol":"TrustedXPSourceRegistryV02","GFLOIgnitionV01.sol":"GFLOIgnitionV01","GFLOFixedSupplyV01.sol":"GFLOFixedSupplyV01","EffectiveTierGateV01.sol":"EffectiveTierGateV01"};
const sources=Object.fromEntries(Object.keys(files).map(f=>[f,{content:execFileSync("git",["show","origin/feature/pie-core-v0.2:contracts/"+f],{cwd:repo,encoding:"utf8"})}]));
const ozRoot=path.dirname(localReq.resolve("@openzeppelin/contracts/package.json"));
sources["RT5B2Consumer.sol"]={content:`pragma solidity ^0.8.20;
interface IEffectiveTierRT { function requireEffectiveTier(address wallet,uint8 minimum) external view; }
contract RT5B2Consumer {
 IEffectiveTierRT public immutable gate;
 mapping(address => uint256) public uses;
 constructor(address g){ gate=IEffectiveTierRT(g); }
 function exercise() external {
  gate.requireEffectiveTier(msg.sender,2);
  uses[msg.sender]++;
 }
}`};
const compiled=JSON.parse(solc.compile(JSON.stringify({language:"Solidity",sources,settings:{optimizer:{enabled:true,runs:200},evmVersion:"cancun",outputSelection:{"*":{"*":["abi","evm.bytecode.object"]}}}}),{import:(name)=>{
 try{
  if(!name.startsWith("@openzeppelin/contracts/"))return {error:"unexpected import "+name};
  const target=path.resolve(ozRoot,name.slice("@openzeppelin/contracts/".length));
  if(!target.startsWith(ozRoot+path.sep))return {error:"unsafe import"};
  return {contents:fs.readFileSync(target,"utf8")};
 }catch(e){return {error:String(e)};}
}}));
for(const e of compiled.errors??[])if(e.severity==="error")throw Error(e.formattedMessage);
for(const [f,n] of Object.entries(files))artifacts[({XPPolicyV03:"xp",EffectiveTierGateV01:"gate",PIECoreIgnitionV01:"core",TrustedXPSourceRegistryV02:"registry",GFLOIgnitionV01:"ignition",GFLOFixedSupplyV01:"token"})[n]]=compiled.contracts[f][n];
artifacts.consumer=compiled.contracts["RT5B2Consumer.sol"].RT5B2Consumer;
const abi=Object.fromEntries(Object.entries(artifacts).map(([k,v])=>[k,new Interface(v.abi)]));
const bytecode=k=>{const b=artifacts[k].bytecode?.object??artifacts[k].bytecode??artifacts[k].evm.bytecode.object;return b.startsWith("0x")?b:"0x"+b;};
const common=new Common({chain:Mainnet,hardfork:Hardfork.Cancun}),vm=await createVM({common});
const secret=c=>hexToBytes("0x"+c.repeat(32));
const keys={deployer:secret("a1"),relayer:secret("a2"),outsider:secret("a3"),alice:secret("a4"),verifier:secret("a5"),attestor:secret("a6")};
const senders={};
for(const [name,key] of Object.entries(keys)){
 const address=createAddressFromPrivateKey(key);
 senders[name]={key,address,nonce:0n};
 await vm.stateManager.putAccount(address,createAccount({balance:10n**23n}));
}
const owners=["11","22","33"].map(c=>new Wallet("0x"+c.repeat(32)));
const TEST_GAS=22000000n,GAS_PRICE=2000000000n;
let activeTimestamp=1000n;
const atDay=day=>{ activeTimestamp=BigInt(day)*86400n+1000n; };
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
let n=0;const N=23;
async function check(title,fn){await fn();console.log("✅ "+(++n)+"/"+N+" "+title);}
console.log("=== GFLO RED TEAM 5B/2 — SIGNED PRAXIS REVOCATION & LIVE GATE ===");
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
const gate=(await deploy("deployer","gate",[core,registry])).address;
const consumer=(await deploy("deployer","consumer",[gate])).address;
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

const {Wallet: EthersWallet}=req("ethers");
const attestorWallet=new EthersWallet("0x"+"a6".repeat(32));
const attestor=senders.attestor.address.toString();
const rule=id("RT5_REAL_ATTESTED_1000"),event=id("RT5_AUTHENTIC_EVENT"),evidence=id("RT5_AUTHENTIC_EVIDENCE");
const proof=[account,rule,event,evidence,777n,0n,172800n];
let claimId;
async function proofSignature(p=proof){const hash=await read("xp",xp,"proofDigest",[p]);return attestorWallet.signingKey.sign(hash).serialized;}
async function grantFromReceipt(receipt){
 for(const log of receipt.receipt.logs){
  try{const e=abi.xp.parseLog({topics:log[1].map(bytesToHex),data:bytesToHex(log[2])});if(e?.name==="GrantPending")return e.args.claimId;}catch{}
 }
 throw Error("Missing GrantPending receipt event");
}
async function rejected(k,address,fn,args=[],caller="outsider"){
 const before=await read("registry",registry,"totalXP",[account]);
 await send(caller,k,address,fn,args,0);
 assert.equal(await read("registry",registry,"totalXP",[account]),before);
}
await check("Safe 2/3 controls fresh XPPolicyV03 and Gate can read canonical XP",async()=>{
 assert.equal(await read("safe",proxy,"getThreshold"),2n);
 assert.equal(await read("xp",xp,"owner"),proxy);
 assert.equal(await read("core",core,"bindingAuthority"),proxy);
 assert.equal(await read("registry",registry,"governance"),proxy);
 await admin("core",core,"bindIgnition",[ignition]);
 const code=await vm.stateManager.getCode(createAddressFromString(xp));
 await admin("registry",registry,"proposePolicy",[xp,keccak256(bytesToHex(code)),proxy]);
 await admin("registry",registry,"activatePolicy");
 await admin("registry",registry,"setPaused",[false]);
 await send("alice","core",core,"createIdentity",[3]);
 assert.equal(await read("registry",registry,"totalXP",[account]),25n);
 assert.equal(await read("gate",gate,"effectiveTier",[account]),0n);
});
await check("Verifier requires independently authorized signer; unsigned proof rejected",async()=>{
 await admin("xp",xp,"setVerifierRole",[verifierAddress,2]);
 await admin("xp",xp,"registerRule",[rule,1000,3]);
 const empty="0x";
 await rejected("xp",xp,"submit",[proof,attestor,empty],"verifier");
 await admin("xp",xp,"setAttestor",[rule,attestor,true]);
});
await check("Invalid evidence signature rejected; correct independent EIP-712 signature accepted",async()=>{
 const bad=new EthersWallet("0x"+"a7".repeat(32));
 const digest=await read("xp",xp,"proofDigest",[proof]);
 const falseSig=bad.signingKey.sign(digest).serialized;
 await rejected("xp",xp,"submit",[proof,attestor,falseSig],"verifier");
 const sig=await proofSignature();
 const receipt=await send("verifier","xp",xp,"submit",[proof,attestor,sig]);
 claimId=await grantFromReceipt(receipt);
 assert.equal(await read("xp",xp,"validEarnedXP",[account]),0n);
});
await check("Pending XP cannot unlock Tier 1 or increase canonical XP",async()=>{
 assert.equal(await read("registry",registry,"totalXP",[account]),25n);
 await send("alice","token",token,"approve",[ignition,tier1Fee]);
 await send("alice","ignition",ignition,"ignite",[],0);
 assert.equal((await read("core",core,"getIdentity",[account])).tier,0n);
 assert.equal(await read("token",token,"totalSupply"),initialSupply);
});
await check("Early finalize fails; expiry of attestation does not override 3-day finalization",async()=>{
 await send("outsider","xp",xp,"finalize",[claimId],0);
 atDay(3);
 await send("outsider","xp",xp,"finalize",[claimId]);
 assert.equal(await read("xp",xp,"validEarnedXP",[account]),1000n);
 assert.equal(await read("registry",registry,"totalXP",[account]),1025n);
});
await check("Finalized claim permits real signed Tier 1 burn and effective tier 1",async()=>{
 await send("alice","ignition",ignition,"ignite");
 assert.equal((await read("core",core,"getIdentity",[account])).tier,1n);
 assert.equal(await read("gate",gate,"effectiveTier",[account]),1n);
 assert.equal(await read("token",token,"totalSupply"),initialSupply-tier1Fee);
});
await check("Safe 2/3 revokes valid grant: effective Tier falls, achieved Tier remains",async()=>{
 const before=await read("token",token,"totalSupply");
 await admin("xp",xp,"revoke",[claimId,id("RT5_FRAUD_DECISION")]);
 assert.equal(await read("xp",xp,"validEarnedXP",[account]),0n);
 assert.equal(await read("registry",registry,"totalXP",[account]),25n);
 assert.equal((await read("core",core,"getIdentity",[account])).tier,1n);
 assert.equal(await read("gate",gate,"effectiveTier",[account]),0n);
 await send("outsider","gate",gate,"requireEffectiveTier",[account,1],0);
 assert.equal(await read("token",token,"totalSupply"),before);
});
await check("Replay after revocation fails and paused Registry fails closed",async()=>{
 const sig=await proofSignature();
 // A fresh, currently valid signature is intentionally reused with the
 // original event/evidence nullifiers, so expiry cannot mask replay protection.
 const replayProof=[account,rule,event,evidence,778n,BigInt(activeTimestamp),BigInt(activeTimestamp)+86400n];
 const replaySig=await proofSignature(replayProof);
 await send("verifier","xp",xp,"submit",[replayProof,attestor,replaySig],0);
 await send("outsider","xp",xp,"finalize",[claimId],0);
 await admin("registry",registry,"setPaused",[true]);
 await send("outsider","gate",gate,"requireEffectiveTier",[account,1],0);
 assert.equal((await read("core",core,"getIdentity",[account])).tier,1n);
});

await admin("registry",registry,"setPaused",[false]);
const praxisRule=id("RT5B2_PRAxis_1000");
await admin("xp",xp,"registerRule",[praxisRule,1000,12]);
await admin("xp",xp,"setAttestor",[praxisRule,attestor,true]);
const awards=[];
async function createAward(day,index){
 atDay(day);
 const proof2=[account,praxisRule,id("RT5B2_EVENT_"+index),
  id("RT5B2_EVIDENCE_"+index),BigInt(9000+index),
  activeTimestamp,activeTimestamp+86400n];
 const signed=await proofSignature(proof2);
 const receipt=await send("verifier","xp",xp,"submit",[proof2,attestor,signed]);
 const uid=await grantFromReceipt(receipt);
 const grant={uid,index,day,finalized:false};
 awards.push(grant);
 return grant;
}
async function finish(grant){
 const before=await read("xp",xp,"validEarnedXP",[account]);
 const receipt=await send("outsider","xp",xp,"finalize",[grant.uid]);
 assert.ok(receipt.receipt.logs.length>0,"No GrantFinalized log");
 assert.equal(await read("xp",xp,"validEarnedXP",[account]),before+1000n);
 grant.finalized=true;
}
await check("Actual Tier-2 consumer enforces dynamic gate while historical Tier is 1",async()=>{
 assert.equal(await read("consumer",consumer,"uses",[account]),0n);
 assert.equal(await read("gate",gate,"effectiveTier",[account]),0n);
 await send("alice","consumer",consumer,"exercise",[],0);
 assert.equal(await read("consumer",consumer,"uses",[account]),0n);
});
await check("Week zero can accept two new PENDING claims; revocation keeps prior 1000 quota",async()=>{
 await createAward(3,1);
 await createAward(4,2);
 assert.equal(await read("xp",xp,"weeklyXP",[account,0]),3000n);
 assert.equal(await read("registry",registry,"totalXP",[account]),25n);
});
await check("A fourth week-zero 1000 XP submission fails without consuming claim quota",async()=>{
 atDay(5);
 const attack=[account,praxisRule,id("RT5B2_CAP_EVENT"),id("RT5B2_CAP_EVIDENCE"),9900n,activeTimestamp,activeTimestamp+86400n];
 const count=await read("xp",xp,"claimsPerRule",[account,praxisRule]);
 await send("verifier","xp",xp,"submit",[attack,attestor,await proofSignature(attack)],0);
 assert.equal(await read("xp",xp,"claimsPerRule",[account,praxisRule]),count);
 assert.equal(await read("xp",xp,"weeklyXP",[account,0]),3000n);
});
await check("Three-day challenge windows finalize only valid awards",async()=>{
 atDay(6); await finish(awards[0]);
 atDay(7); await finish(awards[1]);
 assert.equal(await read("registry",registry,"totalXP",[account]),2025n);
 assert.equal((await read("core",core,"getIdentity",[account])).tier,1n);
 assert.equal(await read("gate",gate,"effectiveTier",[account]),1n);
});
await check("Three week-one awards finalize after challenge to canonical 5025 XP",async()=>{
 await createAward(7,3);
 await createAward(8,4);
 await createAward(9,5);
 assert.equal(await read("xp",xp,"weeklyXP",[account,1]),3000n);
 atDay(12);
 for(const grant of awards.slice(2))await finish(grant);
 assert.equal(await read("xp",xp,"validEarnedXP",[account]),5000n);
 assert.equal(await read("registry",registry,"totalXP",[account]),5025n);
});
await check("Praxis signed burn grants effective Tier 2 and consumer access",async()=>{
 assert.equal(await read("gate",gate,"effectiveTier",[account]),1n);
 await send("alice","consumer",consumer,"exercise",[],0);
 await send("alice","token",token,"approve",[ignition,2n*tier1Fee]);
 const before=await state();
 const receipt=await send("alice","ignition",ignition,"ignite");
 assert.ok(receipt.receipt.logs.length>=3);
 const after=await state();
 assert.equal(after.tier,2n);
 assert.equal(after.supply,before.supply-2n*tier1Fee);
 assert.equal(after.balance,before.balance-2n*tier1Fee);
 assert.equal(after.allowance,0n);
 assert.equal(await read("gate",gate,"effectiveTier",[account]),2n);
 await send("alice","consumer",consumer,"exercise");
 assert.equal(await read("consumer",consumer,"uses",[account]),1n);
});
// P0-A: additional signed, state-changing Tier-2 consumer checks on real Safe fixture.
async function denyConsumer(reason, expectedSelector) {
 const before=await state(), uses=await read("consumer",consumer,"uses",[account]);
 const result=await send("alice","consumer",consumer,"exercise",[],0);
 assert.equal(bytesToHex(result.execResult.returnValue).slice(0,10).toLowerCase(),expectedSelector.toLowerCase(),reason+" wrong revert selector");
 assert.equal(result.receipt.logs.length,0,reason+" emitted logs");
 assert.deepEqual(await state(),before,reason+" mutated GFLO/Core/Safe state");
 assert.equal(await read("consumer",consumer,"uses",[account]),uses,reason+" mutated privilege counter");
}
async function allowConsumer(reason) {
 const before=await state(), uses=await read("consumer",consumer,"uses",[account]);
 const result=await send("alice","consumer",consumer,"exercise");
 assert.equal(Number(result.receipt.status),1,reason+" receipt failed");
 assert.equal(await read("consumer",consumer,"uses",[account]),uses+1n,reason+" failed to increment by exactly one");
 assert.deepEqual(await state(),before,reason+" unexpectedly changed GFLO/Core/Safe state");
}
async function denyTierZero(reason,expectedSelector) {
 const before=await state(), result=await send("outsider","gate",gate,"requireEffectiveTier",[account,0],0);
 assert.equal(bytesToHex(result.execResult.returnValue).slice(0,10).toLowerCase(),expectedSelector.toLowerCase(),reason+" unexpectedly authorized Tier 0");
 assert.deepEqual(await state(),before,reason+" mutated state");
}
await check("P0A policy-only pause rejects Tier-2 consumer and Tier-0 fallback",async()=>{
 assert.equal(await read("gate",gate,"effectiveTier",[account]),2n);
 await admin("xp",xp,"setPaused",[true]);
 assert.equal(await read("xp",xp,"paused"),true);
 assert.equal(await read("registry",registry,"paused"),false);
 await denyConsumer("policy stop",abi.xp.getError("Paused").selector);
 await denyTierZero("policy stop Tier 0",abi.xp.getError("Paused").selector);
 assert.equal((await read("core",core,"getIdentity",[account])).tier,2n);
});
await check("P0A policy unpause restores one state-changing privilege use",async()=>{
 await admin("xp",xp,"setPaused",[false]);
 assert.equal(await read("registry",registry,"totalXP",[account]),5025n);
 await allowConsumer("policy resumed");
});
await check("P0A registry-only stop independently denies Tier-2 and Tier-0 privilege",async()=>{
 await admin("registry",registry,"setPaused",[true]);
 assert.equal(await read("xp",xp,"paused"),false);
 assert.equal(await read("registry",registry,"paused"),true);
 await denyConsumer("registry stop",abi.registry.getError("RegistryInactive").selector);
 await denyTierZero("registry stop Tier 0",abi.registry.getError("RegistryInactive").selector);
});
await check("P0A registry unpause restores one state-changing privilege use",async()=>{
 await admin("registry",registry,"setPaused",[false]);
 await allowConsumer("registry resumed");
});
await check("P0A simultaneous stops: policy-first resumption stays denied until registry unpause",async()=>{
 await admin("xp",xp,"setPaused",[true]);
 await admin("registry",registry,"setPaused",[true]);
 await denyConsumer("both stopped",abi.registry.getError("RegistryInactive").selector);
 await admin("xp",xp,"setPaused",[false]);
 await denyConsumer("registry remains stopped",abi.registry.getError("RegistryInactive").selector);
 await admin("registry",registry,"setPaused",[false]);
 await allowConsumer("policy-first full recovery");
});
await check("P0A simultaneous stops: registry-first resumption stays denied until policy unpause",async()=>{
 await admin("xp",xp,"setPaused",[true]);
 await admin("registry",registry,"setPaused",[true]);
 await admin("registry",registry,"setPaused",[false]);
 await denyConsumer("policy remains stopped",abi.xp.getError("Paused").selector);
 await denyTierZero("policy remains stopped Tier 0",abi.xp.getError("Paused").selector);
 await admin("xp",xp,"setPaused",[false]);
 await allowConsumer("registry-first full recovery");
});
await check("P0A unknown identity cannot use Tier-0 gate or Tier-2 consumer",async()=>{
 const unknown=senders.outsider.address.toString(), before=await state();
 assert.equal((await read("core",core,"getIdentity",[unknown])).exists,false);
 const t0=await send("outsider","gate",gate,"requireEffectiveTier",[unknown,0],0);
 assert.equal(bytesToHex(t0.execResult.returnValue).slice(0,10).toLowerCase(),abi.gate.getError("NoIdentity").selector.toLowerCase());
 const denied=await send("outsider","consumer",consumer,"exercise",[],0);
 assert.equal(bytesToHex(denied.execResult.returnValue).slice(0,10).toLowerCase(),abi.gate.getError("NoIdentity").selector.toLowerCase());
 assert.equal(await read("consumer",consumer,"uses",[unknown]),0n);
 assert.deepEqual(await state(),before);
});
await check("P0A unauthorized pause-release attempts cannot reopen protected consumer",async()=>{
 await admin("xp",xp,"setPaused",[true]);
 await admin("registry",registry,"setPaused",[true]);
 const before=await state();
 await send("outsider","xp",xp,"setPaused",[false],0);
 await send("outsider","registry",registry,"setPaused",[false],0);
 assert.equal(await read("xp",xp,"paused"),true);
 assert.equal(await read("registry",registry,"paused"),true);
 await denyConsumer("illicit unpause",abi.registry.getError("RegistryInactive").selector);
 assert.deepEqual(await state(),before);
 await admin("registry",registry,"setPaused",[false]);
 await admin("xp",xp,"setPaused",[false]);
});
const usesBeforeRevocation=await read("consumer",consumer,"uses",[account]);
await check("Revoke 2000: 5025→3025 XP, achieved=2, effective=1, Tier-2 access denied",async()=>{
 const before=await state();
 await admin("xp",xp,"revoke",[awards[0].uid,id("RT5B2_FRAUD1")]);
 await admin("xp",xp,"revoke",[awards[2].uid,id("RT5B2_FRAUD2")]);
 assert.equal(await read("registry",registry,"totalXP",[account]),3025n);
 assert.equal((await read("core",core,"getIdentity",[account])).tier,2n);
 assert.equal(await read("gate",gate,"effectiveTier",[account]),1n);
 const after=await state();
 assert.equal(after.supply,before.supply);
 assert.equal(after.balance,before.balance);
 assert.equal(after.allowance,before.allowance);
 assert.equal(after.tier,2n);
 await send("alice","consumer",consumer,"exercise",[],0);
 assert.equal(await read("consumer",consumer,"uses",[account]),usesBeforeRevocation);
 await admin("registry",registry,"setPaused",[true]);
 await send("outsider","gate",gate,"requireEffectiveTier",[account,0],0);
});
assert.equal(n,N);
console.log("✅ 23/23 RED TEAM 5C P0-A TIER-2 CONSUMER PAUSE / REVOCATION CHECKS PASS");
console.log("Scope: 15 repeated 5B/2 baselines + 8 P0-A extensions; test consumer, no network deployment or real-world event truth.");
