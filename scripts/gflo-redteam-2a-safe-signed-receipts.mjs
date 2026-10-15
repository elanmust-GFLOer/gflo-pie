// RED TEAM 2A: Official Safe 1.5.0 with genuinely signed outer Ethereum txs.
// Local EthereumJS VM only; all keys synthetic. Never use real wallet keys.
import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
import {join} from "node:path";
import {createVM,runTx} from "@ethereumjs/vm";
import {createLegacyTx} from "@ethereumjs/tx";
import {Common,Mainnet,Hardfork} from "@ethereumjs/common";
import {createAccount,createAddressFromPrivateKey,createAddressFromString,hexToBytes,bytesToHex} from "@ethereumjs/util";
const local=createRequire(import.meta.url);
const {Interface,Wallet,ZeroAddress,getCreateAddress,keccak256}=local("ethers");
const base=join(process.cwd(),"node_modules/@safe-global/safe-smart-account/build/artifacts/contracts");
const art=x=>JSON.parse(fs.readFileSync(join(base,x),"utf8"));
const raw={safe:art("Safe.sol/Safe.json"),factory:art("proxies/SafeProxyFactory.sol/SafeProxyFactory.json")};
const abi=Object.fromEntries(Object.entries(raw).map(([key,value])=>[key,new Interface(value.abi)]));
function bytecode(key){const b=raw[key].bytecode;return typeof b==="string"?b:b.object;}
const common=new Common({chain:Mainnet,hardfork:Hardfork.Cancun});
const vm=await createVM({common});
const key=x=>hexToBytes("0x"+x.repeat(32));
const senders={deployer:key("51"),relayer:key("52"),outsider:key("53")};
const accounts={};
for(const [n,k] of Object.entries(senders)){
 const address=createAddressFromPrivateKey(k);
 accounts[n]={address,key:k,nonce:0n};
 await vm.stateManager.putAccount(address,createAccount({balance:10n**23n}));
}
const owners=["11","22","33"].map(x=>new Wallet("0x"+x.repeat(32)));
const gasPrice=2000000000n;
async function send(name,to,data,status){
 const who=accounts[name];
 const tx=createLegacyTx({
  nonce:who.nonce,gasPrice,gasLimit:19000000n,
  ...(to?{to}:{}),data:hexToBytes(data)
 },{common}).sign(who.key);
 const result=await runTx(vm,{tx});who.nonce++;
 assert.equal(Number(result.receipt.status),status,`Unexpected receipt status ${name} nonce ${who.nonce-1n}`);
 assert.equal((await vm.stateManager.getAccount(who.address)).nonce,who.nonce,"Outer signer nonce drift");
 return result;
}
async function deploy(key){
 const who=accounts.deployer;
 const address=getCreateAddress({from:who.address.toString(),nonce:who.nonce});
 const result=await send("deployer",null,bytecode(key),1);
 assert.ok(result.receipt.logs.length>=0);
 assert.ok((await vm.stateManager.getCode(createAddressFromString(address))).length>0,"No deployed runtime");
 return address;
}
async function read(to,iface,fn,args=[]){
 const viewer=createAddressFromString("0x"+"fa".repeat(20));
 await vm.stateManager.checkpoint();
 try{
  const r=(await vm.evm.runCall({caller:viewer,to:createAddressFromString(to),gasLimit:4000000n,isStatic:true,
   data:hexToBytes(iface.encodeFunctionData(fn,args))})).execResult;
  if(r.exceptionError)throw Error("read failed "+fn+" "+r.exceptionError.error);
  return iface.decodeFunctionResult(fn,bytesToHex(r.returnValue))[0];
 }finally{await vm.stateManager.revert();}
}
async function codeHash(to){return keccak256(bytesToHex(await vm.stateManager.getCode(createAddressFromString(to))));}
const N=7;let passed=0;
async function check(label,fn){await fn();console.log(`✅ ${++passed}/${N} ${label}`);}
console.log("=== GFLO RED TEAM 2A — SIGNED OUTER SAFE TX ===");
const singleton=await deploy("safe");
const factory=await deploy("factory");
const init=abi.safe.encodeFunctionData("setup",[owners.map(o=>o.address),2,ZeroAddress,"0x",ZeroAddress,ZeroAddress,0,ZeroAddress]);
const salt=771104n;
const beforeDeployer=accounts.deployer.nonce;
const createReceipt=await send("deployer",factory,abi.factory.encodeFunctionData("createProxyWithNonce",[singleton,init,salt]),1);
assert.ok(createReceipt.receipt.logs.length>=1,"Factory creation log absent");
const proxyLog=createReceipt.receipt.logs.find(([address,topics])=>
 address.toString().toLowerCase()===factory.toLowerCase() &&
 bytesToHex(topics[0]).toLowerCase()===abi.factory.getEvent("ProxyCreation").topicHash.toLowerCase());
assert.ok(proxyLog,"Factory ProxyCreation event missing");
const deployedLog=abi.factory.parseLog({topics:proxyLog[1].map(bytesToHex),data:bytesToHex(proxyLog[2])});
const safe=deployedLog.args.proxy;
const safeAddr=createAddressFromString(safe);
assert.ok((await vm.stateManager.getCode(safeAddr)).length>0);
await check("Official singleton, factory, and initialized proxy were deployed in signed outer txs",async()=>{
 assert.equal(accounts.deployer.nonce,beforeDeployer+1n);
 assert.equal(await read(safe,abi.safe,"VERSION"),"1.5.0");
 assert.equal(await read(safe,abi.safe,"getThreshold"),2n);
 assert.equal((await read(safe,abi.safe,"getOwners")).length,3);
});
await check("Safe proxy runtime and singleton are distinct deployed code",async()=>{
 assert.notEqual(await codeHash(safe),await codeHash(singleton));
});
const recipient=accounts.outsider.address.toString();
async function encodeSafeCall(to,data,signerList,nonceOverride=null){
 const current=nonceOverride??await read(safe,abi.safe,"nonce");
 const hash=await read(safe,abi.safe,"getTransactionHash",[to,0,data,0,0,0,0,ZeroAddress,ZeroAddress,current]);
 const signatures="0x"+signerList.map(w=>({addr:w.address.toLowerCase(),sig:w.signingKey.sign(hash).serialized.slice(2)}))
 .sort((a,b)=>a.addr.localeCompare(b.addr)).map(x=>x.sig).join("");
 return abi.safe.encodeFunctionData("execTransaction",[to,0,data,0,0,0,0,ZeroAddress,ZeroAddress,signatures]);
}
const setThresholdData=abi.safe.encodeFunctionData("changeThreshold",[3]);
const initialNonce=await read(safe,abi.safe,"nonce");
let rejectedReceipt;
await check("One owner signature yields failed outer receipt and zero Safe nonce mutation",async()=>{
 rejectedReceipt=await send("relayer",safe,await encodeSafeCall(safe,setThresholdData,[owners[0]]),0);
 assert.equal(rejectedReceipt.receipt.logs.length,0,"Reverted tx emitted logs");
 assert.equal(await read(safe,abi.safe,"nonce"),initialNonce);
 assert.equal(await read(safe,abi.safe,"getThreshold"),2n);
});
await check("Non-owner plus one owner yields status 0 without governance mutation",async()=>{
 const stranger=new Wallet("0x"+"44".repeat(32));
 const r=await send("outsider",safe,await encodeSafeCall(safe,setThresholdData,[owners[0],stranger]),0);
 assert.equal(r.receipt.logs.length,0);
 assert.equal(await read(safe,abi.safe,"getThreshold"),2n);
 assert.equal(await read(safe,abi.safe,"nonce"),initialNonce);
});
let successfulCall;
await check("Two owners authorize Safe self-call with signed outer receipt and event",async()=>{
 successfulCall=await encodeSafeCall(safe,setThresholdData,[owners[0],owners[1]]);
 const result=await send("relayer",safe,successfulCall,1);
 assert.equal(await read(safe,abi.safe,"getThreshold"),3n);
 assert.equal(await read(safe,abi.safe,"nonce"),initialNonce+1n);
 const eventTopic=abi.safe.getEvent("ExecutionSuccess").topicHash.toLowerCase();
 assert.ok(result.receipt.logs.some(([address,topics])=>address.toString().toLowerCase()===safe.toLowerCase() && bytesToHex(topics[0]).toLowerCase()===eventTopic),"ExecutionSuccess event absent");
});
await check("Replay of prior two-owner signature fails after nonce increment",async()=>{
 const old=await send("relayer",safe,successfulCall,0);
 assert.equal(old.receipt.logs.length,0);
 assert.equal(await read(safe,abi.safe,"nonce"),initialNonce+1n);
 assert.equal(await read(safe,abi.safe,"getThreshold"),3n);
});
await check("Rejected outer tx consumes signer nonce and gas, not Safe transaction nonce",async()=>{
 assert.ok(rejectedReceipt.totalGasSpent>21000n);
 assert.equal(accounts.relayer.nonce,3n);
 assert.equal((await vm.stateManager.getAccount(accounts.relayer.address)).nonce,3n);
 assert.equal(await read(safe,abi.safe,"nonce"),initialNonce+1n);
});
console.log("✅ 7/7 SIGNED OUTER SAFE RED TEAM 2A CHECKS PASS");
console.log("Scope: EthereumJS local signed outer transactions, official Safe 1.5; no GFLO burn in this phase, no testnet or audit.");
