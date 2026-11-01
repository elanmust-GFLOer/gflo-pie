// Local pilot fixture, adapted from the existing RED TEAM 5B signed EVM runner.
// Local EthereumJS v10, synthetic private keys only. Not an external network/audit.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";

import {join} from "node:path";
import {createVM,runTx} from "@ethereumjs/vm";
import {createLegacyTx} from "@ethereumjs/tx";
import {createBlock} from "@ethereumjs/block";
import {Common,Mainnet,Hardfork} from "@ethereumjs/common";
import {createAccount,createAddressFromPrivateKey,createAddressFromString,hexToBytes,bytesToHex} from "@ethereumjs/util";

const packageRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const repo=path.resolve(packageRoot,".."),req=createRequire(join(packageRoot,"package.json"));
const localReq=createRequire(import.meta.url);
const solc=req("solc"),{Interface,Wallet,getCreateAddress,ZeroAddress,parseUnits,id,keccak256}=req("ethers");
const root=join(packageRoot,"node_modules/@safe-global/safe-smart-account/build/artifacts/contracts");
const artifacts={
 safe:JSON.parse(fs.readFileSync(join(root,"Safe.sol/Safe.json"),"utf8")),
 factory:JSON.parse(fs.readFileSync(join(root,"proxies/SafeProxyFactory.sol/SafeProxyFactory.json"),"utf8"))
};
const files={"XPPolicyV03.sol":"XPPolicyV03","PIECoreIgnitionV01.sol":"PIECoreIgnitionV01","TrustedXPSourceRegistryV02.sol":"TrustedXPSourceRegistryV02","GFLOIgnitionV01.sol":"GFLOIgnitionV01","GFLOFixedSupplyV01.sol":"GFLOFixedSupplyV01","EffectiveTierGateV01.sol":"EffectiveTierGateV01"};
const sources=Object.fromEntries(Object.keys(files).map(f=>[f,{content:fs.readFileSync(join(repo,"contracts",f),"utf8")}]));
sources["PilotConsumer.sol"]={content:`// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
interface IPilotGate { function requireEffectiveTier(address wallet,uint8 minimum) external view; }
contract PilotConsumer {
 IPilotGate public immutable gate;
 mapping(address=>uint256) public uses;
 constructor(address g) { gate=IPilotGate(g); }
 function useFeature() external { gate.requireEffectiveTier(msg.sender,1); uses[msg.sender]++; }
}`};
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
artifacts.consumer=compiled.contracts["PilotConsumer.sol"].PilotConsumer;
const abi=Object.fromEntries(Object.entries(artifacts).map(([k,v])=>[k,new Interface(v.abi)]));
const bytecode=k=>{const b=artifacts[k].bytecode?.object??artifacts[k].bytecode??artifacts[k].evm.bytecode.object;return b.startsWith("0x")?b:"0x"+b;};
export async function createFixture() {
const receipts=[];
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
 receipts.push({hash:bytesToHex(signed.hash()),sender:name,to:to?.toString()??null,
  status:Number(out.receipt.status),gas:String(out.totalGasSpent),
  logs:out.receipt.logs.map(log=>({address:bytesToHex(log[0]),topics:log[1].map(bytesToHex),data:bytesToHex(log[2])}))});
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
const consumer=(await deploy("deployer","consumer",[gate])).address;
const attestorWallet=new Wallet("0x"+"a6".repeat(32));
const attestor=senders.attestor.address.toString();
async function signProof(proof) { return attestorWallet.signingKey.sign(await read("xp",xp,"proofDigest",[proof])).serialized; }
function claimFromReceipt(receipt) {
 for (const log of receipt.receipt.logs) {
  try { const e=abi.xp.parseLog({topics:log[1].map(bytesToHex),data:bytesToHex(log[2])});
   if(e?.name==="GrantPending")return e.args.claimId;
  } catch {}
 }
 throw Error("Missing GrantPending event");
}
async function rejects(k,target,fn,args,caller,errorName) {
 const out=await send(caller,k,target,fn,args,0);
 const data=bytesToHex(out.execResult.returnValue);
 assert.equal(data.slice(0,10),abi[k].getError(errorName).selector,"Expected exact revert: "+errorName);
 return out;
}
return {abi,read,send,admin,state,atDay,signProof,claimFromReceipt,rejects,
 account,attestor,verifierAddress,core,xp,registry,token,ignition,gate,consumer,
 proxy,tier1Fee,initialSupply,receipts,vm,sourceFiles:Object.keys(files),
 compiler:solc.version(),chainId:String(common.chainId()),
 codeHash:async address=>keccak256(bytesToHex(await vm.stateManager.getCode(createAddressFromString(address))))};
}
