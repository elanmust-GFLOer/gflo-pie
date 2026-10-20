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
const files={"XPPolicyV03.sol":"XPPolicyV03","PIECoreIgnitionV01.sol":"PIECoreIgnitionV01","TrustedXPSourceRegistryV02.sol":"TrustedXPSourceRegistryV02","GFLOIgnitionV01.sol":"GFLOIgnitionV01","GFLOFixedSupplyV01.sol":"GFLOFixedSupplyV01","EffectiveTierGateV01.sol":"EffectiveTierGateV01"};
const sources=Object.fromEntries(Object.keys(files).map(f=>[f,{content:execFileSync("git",["show","origin/feature/pie-core-v0.2:contracts/"+f],{cwd:repo,encoding:"utf8"})}]));
sources["GFLOERC1271AdversarialMock.sol"]={content:fs.readFileSync(path.join(repo,"contracts/test/GFLOERC1271AdversarialMock.sol"),"utf8")};
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
for(const [f,n] of Object.entries(files))artifacts[({XPPolicyV03:"xp",EffectiveTierGateV01:"gate",PIECoreIgnitionV01:"core",TrustedXPSourceRegistryV02:"registry",GFLOIgnitionV01:"ignition",GFLOFixedSupplyV01:"token"})[n]]=compiled.contracts[f][n];
artifacts.signer=compiled.contracts["GFLOERC1271AdversarialMock.sol"].GFLOERC1271AdversarialMock;
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
let n=0;const N=21;
async function check(title,fn){await fn();console.log("✅ "+(++n)+"/"+N+" "+title);}
console.log("=== GFLO RED TEAM 5B/1 — PROOF TAMPER / REVOCATION NEGATIVE GATES ===");
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

// 5A intentionally leaves Registry paused. Re-enable it via genuine Safe 2/3 first.
await admin("registry",registry,"setPaused",[false]);
const freshRule=id("RT5B_FRESH_RULE");
await admin("xp",xp,"registerRule",[freshRule,1000,5]);
await admin("xp",xp,"setAttestor",[freshRule,attestor,true]);
const freshProof=[account,freshRule,id("RT5B_NEW_EVENT"),id("RT5B_NEW_EVIDENCE"),900n,
 BigInt(activeTimestamp),BigInt(activeTimestamp)+10n*86400n];
const freshSig=await proofSignature(freshProof);
async function guardRejected(p,sig=freshSig, signer=attestor){
 const before=await read("xp",xp,"validEarnedXP",[account]);
 const r=await send("verifier","xp",xp,"submit",[p,signer,sig],0);
 assert.equal(r.receipt.logs.length,0);
 assert.equal(await read("xp",xp,"validEarnedXP",[account]),before);
}
await check("Recipient, rule, event, evidence and nonce tampering each invalidate signature",async()=>{
 const edits=[
  [0,senders.outsider.address.toString()],
  [1,rule],
  [2,id("RT5B_ALTERED_EVENT")],
  [3,id("RT5B_ALTERED_EVIDENCE")],
  [4,901n]
 ];
 for(const [field,value] of edits){
  const tampered=[...freshProof];tampered[field]=value;
  await guardRejected(tampered);
 }
});
await check("Expired and future-issued attestations fail even with valid signatures",async()=>{
 const expired=[...freshProof];expired[5]=0n;expired[6]=BigInt(activeTimestamp)-1n;
 await guardRejected(expired,await proofSignature(expired));
 const future=[...freshProof];future[5]=BigInt(activeTimestamp)+100n;future[6]=BigInt(activeTimestamp)+86400n;
 await guardRejected(future,await proofSignature(future));
});
await check("Unauthorized attestor and verifier cannot submit valid signed evidence",async()=>{
 const originalRole=await read("xp",xp,"verifierRoles",[verifierAddress]);
 assert.equal(originalRole,2n);
 await send("outsider","xp",xp,"submit",[freshProof,attestor,freshSig],0);
 const attacker=new EthersWallet("0x"+"a7".repeat(32));
 const attackerSig=attacker.signingKey.sign(await read("xp",xp,"proofDigest",[freshProof])).serialized;
 await guardRejected(freshProof,attackerSig,attacker.address);
});
let freshClaimId;
// Public struct mapping getters return SEVEN ABI values, not one tuple.
// Read the named status field from the full decoded result.
async function readGrantStatus(claim){
 const viewer=createAddressFromString("0x"+"fe".repeat(20));
 await vm.stateManager.checkpoint();
 try{
  const res=(await vm.evm.runCall({
   caller:viewer,to:createAddressFromString(xp),isStatic:true,gasLimit:2000000n,
   data:hexToBytes(abi.xp.encodeFunctionData("grants",[claim]))
  })).execResult;
  if(res.exceptionError)throw Error("grants read failed: "+res.exceptionError.error);
  const decoded=abi.xp.decodeFunctionResult("grants",bytesToHex(res.returnValue));
  assert.equal(decoded.length,7,"Unexpected XPPolicyV03 Grant getter ABI");
  return decoded.status;
 }finally{await vm.stateManager.revert();}
}
await check("Valid fresh claim enters PENDING; duplicate evidence is rejected",async()=>{
 const before=await read("registry",registry,"totalXP",[account]);
 const r=await send("verifier","xp",xp,"submit",[freshProof,attestor,freshSig]);
 freshClaimId=await grantFromReceipt(r);
 assert.equal(await read("registry",registry,"totalXP",[account]),before);
 await guardRejected(freshProof);
 assert.equal(await readGrantStatus(freshClaimId),1n);
});
await check("Unauthorized revocation fails and keeps PENDING grant unchanged",async()=>{
 await send("outsider","xp",xp,"revoke",[freshClaimId,id("RT5B_FAKE_REASON")],0);
 assert.equal(await readGrantStatus(freshClaimId),1n);
 assert.equal(await read("xp",xp,"validEarnedXP",[account]),0n);
});
await check("Safe revokes PENDING grant without adding or subtracting XP",async()=>{
 await admin("xp",xp,"revoke",[freshClaimId,id("RT5B_CANCEL_PENDING")]);
 assert.equal(await readGrantStatus(freshClaimId),3n);
 assert.equal(await read("xp",xp,"validEarnedXP",[account]),0n);
 assert.equal(await read("registry",registry,"totalXP",[account]),25n);
});
await check("Double revoke/finalize fail and event/evidence remain permanently spent",async()=>{
 const oldNonce=await read("safe",proxy,"nonce");
 await safeSubmit(xp,abi.xp.encodeFunctionData("revoke",[freshClaimId,id("RT5B_AGAIN")]),[owners[0],owners[1]],0);
 assert.equal(await read("safe",proxy,"nonce"),oldNonce);
 await send("outsider","xp",xp,"finalize",[freshClaimId],0);
 const replay=[...freshProof];replay[4]=901n;
 await guardRejected(replay,await proofSignature(replay));
 assert.equal(await readGrantStatus(freshClaimId),3n);
});
// RT5-18: 1271 signer authorized for the same existing rule, never the verifier.
const signer=(await deploy("deployer","signer",[senders.deployer.address.toString()])).address;
const rule1271=id("RT518_CONTRACT_SIGNER_100"), account1271=account;
await admin("xp",xp,"registerRule",[rule1271,100,12]);
await admin("xp",xp,"setAttestor",[rule1271,signer,true]);
let serial=0;
async function proof1271() {
 serial++;
 const p=[account1271,rule1271,id("RT518_EVENT_"+serial),id("RT518_EVIDENCE_"+serial),
  BigInt(40000+serial),activeTimestamp,activeTimestamp+86400n];
 const digest=await read("xp",xp,"proofDigest",[p]);
 const signature="0x"+serial.toString(16).padStart(64,"0");
 await send("deployer","signer",signer,"configure",[digest,keccak256(signature)]);
 return {p,signature,digest};
}
async function snapshot1271(p) {
 return {
  xp:await read("xp",xp,"validEarnedXP",[account]),
  total:await read("registry",registry,"totalXP",[account]),
  count:await read("xp",xp,"claimsPerRule",[account,rule1271]),
  daily:await read("xp",xp,"dailyXP",[account,activeTimestamp/86400n]),
  weekly:await read("xp",xp,"weeklyXP",[account,activeTimestamp/(7n*86400n)]),
  event:await read("xp",xp,"usedEvents",[keccak256(p[2])]),
  evidence:await read("xp",xp,"usedEvidence",[keccak256(p[3])]),
  nonce:await read("xp",xp,"usedProofNonces",[keccak256(req("ethers").AbiCoder.defaultAbiCoder().encode(["address","uint256"],[signer,p[4]]))]),
  supply:await read("token",token,"totalSupply")
 };
}
async function reject1271(label,mode,gasLimit) {
 const {p,signature}=await proof1271();
 await send("deployer","signer",signer,"setMode",[mode]);
 const before=await snapshot1271(p);
 let r;
 if(gasLimit) {
   const s=senders.verifier;const signed=createLegacyTx({nonce:s.nonce,gasLimit,gasPrice:GAS_PRICE,
     to:xp,data:hexToBytes(abi.xp.encodeFunctionData("submit",[p,signer,signature]))},{common}).sign(s.key);
   const block=createBlock({header:{timestamp:activeTimestamp,gasLimit:30000000n}},{common});
   r=await runTx(vm,{tx:signed,block});
   assert.equal(Number(r.receipt.status),0,label+" signed gas-bounded tx status");
   s.nonce++;
   assert.equal((await vm.stateManager.getAccount(s.address)).nonce,s.nonce);
 } else r=await send("verifier","xp",xp,"submit",[p,signer,signature],0);
 assert.equal(r.receipt.logs.length,0,label+" unexpected logs");
 assert.deepEqual(await snapshot1271(p),before,label+" changed XP/caps/nullifiers or supply");
 console.log("RT518_REJECTED "+label+" gasSpent="+r.totalGasSpent.toString());
}
await check("RT5-18 wrong magic rejects authorized ERC-1271 signer",async()=>reject1271("WRONG_MAGIC",1));
await check("RT5-18 short return rejects authorized ERC-1271 signer",async()=>reject1271("SHORT_RETURN",2));
await check("RT5-18 reverting signer rejects authorized ERC-1271 signer",async()=>reject1271("REVERT",3));
await check("RT5-18 gas-heavy signer fails bounded signed submission",async()=>reject1271("GAS_EXHAUSTION",4,1000000n));
await check("RT5-18 valid contract signature creates PENDING then blocks replay",async()=>{
 const {p,signature}=await proof1271();
 await send("deployer","signer",signer,"setMode",[0]);
 const before=await read("registry",registry,"totalXP",[account]);
 const receipt=await send("verifier","xp",xp,"submit",[p,signer,signature]);
 const claim=await grantFromReceipt(receipt);
 assert.equal(await readGrantStatus(claim),1n);
 assert.equal(await read("registry",registry,"totalXP",[account]),before);
 await send("verifier","xp",xp,"submit",[p,signer,signature],0);
 assert.equal(await read("registry",registry,"totalXP",[account]),before);
});
await check("RT5-18 finalized contract-attested XP adds once after challenge",async()=>{
 const {p,signature}=await proof1271();
 const receipt=await send("verifier","xp",xp,"submit",[p,signer,signature]);
 const claim=await grantFromReceipt(receipt);
 await send("outsider","xp",xp,"finalize",[claim],0);
 const before=await read("xp",xp,"validEarnedXP",[account]);
 atDay(8);
 await send("outsider","xp",xp,"finalize",[claim]);
 assert.equal(await read("xp",xp,"validEarnedXP",[account]),before+100n);
 await send("outsider","xp",xp,"finalize",[claim],0);
});
assert.equal(n,N);
console.log("✅ 21/21 RED TEAM 5D ERC-1271 ADVERSARIAL SIGNER CHECKS PASS");
console.log("Scope: 15 repeated 5B1 checks + 6 ERC-1271 scenarios; local synthetic EVM only.");
