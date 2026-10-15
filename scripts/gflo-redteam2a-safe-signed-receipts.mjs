// GFLO RED TEAM 2A: REAL Safe v1.5 signed outer transactions + receipts.
// Local EthereumJS v10, synthetic private keys only. Not an external network/audit.
import assert from "node:assert/strict";
import fs from "node:fs";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
import {homedir} from "node:os";
import {join} from "node:path";
import {createVM,runTx} from "@ethereumjs/vm";
import {createLegacyTx} from "@ethereumjs/tx";
import {Common,Mainnet,Hardfork} from "@ethereumjs/common";
import {createAccount,createAddressFromPrivateKey,createAddressFromString,hexToBytes,bytesToHex} from "@ethereumjs/util";

const repo=join(homedir(),"gflo-pie"),req=createRequire(join(repo,"package.json"));
const solc=req("solc"),{Interface,Wallet,getCreateAddress,ZeroAddress}=req("ethers");
const root=join(process.cwd(),"node_modules/@safe-global/safe-smart-account/build/artifacts/contracts");
const artifacts={
 safe:JSON.parse(fs.readFileSync(join(root,"Safe.sol/Safe.json"),"utf8")),
 factory:JSON.parse(fs.readFileSync(join(root,"proxies/SafeProxyFactory.sol/SafeProxyFactory.json"),"utf8"))
};
const files={"XPPolicyV02.sol":"XPPolicyV02","PIECoreIgnitionV01.sol":"PIECoreIgnitionV01"};
const sources=Object.fromEntries(Object.keys(files).map(f=>[f,{content:execFileSync("git",["show","origin/feature/pie-core-v0.2:contracts/"+f],{cwd:repo,encoding:"utf8"})}]));
const compiled=JSON.parse(solc.compile(JSON.stringify({language:"Solidity",sources,settings:{optimizer:{enabled:true,runs:200},evmVersion:"cancun",outputSelection:{"*":{"*":["abi","evm.bytecode.object"]}}}})));
for(const e of compiled.errors??[])if(e.severity==="error")throw Error(e.formattedMessage);
for(const [f,n] of Object.entries(files))artifacts[n==="XPPolicyV02"?"xp":"core"]=compiled.contracts[f][n];
const abi=Object.fromEntries(Object.entries(artifacts).map(([k,v])=>[k,new Interface(v.abi)]));
const bytecode=k=>{const b=artifacts[k].bytecode?.object??artifacts[k].bytecode??artifacts[k].evm.bytecode.object;return b.startsWith("0x")?b:"0x"+b;};
const common=new Common({chain:Mainnet,hardfork:Hardfork.Cancun}),vm=await createVM({common});
const secret=c=>hexToBytes("0x"+c.repeat(32));
const keys={deployer:secret("a1"),relayer:secret("a2"),outsider:secret("a3")};
const senders={};
for(const [name,key] of Object.entries(keys)){
 const address=createAddressFromPrivateKey(key);
 senders[name]={key,address,nonce:0n};
 await vm.stateManager.putAccount(address,createAccount({balance:10n**23n}));
}
const owners=["11","22","33"].map(c=>new Wallet("0x"+c.repeat(32)));
const TEST_GAS=22000000n,GAS_PRICE=2000000000n;
async function tx(name,to,data,status=1){
 const s=senders[name],before=s.nonce;
 const signed=createLegacyTx({nonce:before,gasLimit:TEST_GAS,gasPrice:GAS_PRICE,
   ...(to?{to:to.toString()}:{}),data:hexToBytes(data)},{common}).sign(s.key);
 const out=await runTx(vm,{tx:signed});
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
let n=0;const N=8;
async function check(title,fn){await fn();console.log("✅ "+(++n)+"/"+N+" "+title);}
console.log("=== GFLO RED TEAM 2A — SIGNED SAFE RECEIPTS ===");
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
const account=senders.outsider.address.toString();
await check("Genuine outer signed deployments; Safe has 3 owners and threshold 2",async()=>{
 assert.equal(await read("safe",proxy,"VERSION"),"1.5.0");
 assert.equal((await read("safe",proxy,"getOwners")).length,3);
 assert.equal(await read("safe",proxy,"getThreshold"),2n);
 assert.equal(await read("xp",xp,"owner"),proxy);
});
await check("Signed direct unauthorized XP role transaction is reverted without logs",async()=>{
 await send("outsider","xp",xp,"setVerifierRole",[account,2],0);
 assert.equal(await read("xp",xp,"verifierRoles",[account]),0n);
});
async function currentHash(target,data){
 return read("safe",proxy,"getTransactionHash",[target,0,data,0,0,0,0,ZeroAddress,ZeroAddress,await read("safe",proxy,"nonce")]);
}
function signatures(hash,who){
 return "0x"+who.map(w=>({addr:w.address.toLowerCase(),sig:w.signingKey.sign(hash).serialized.slice(2)}))
 .sort((a,b)=>a.addr.localeCompare(b.addr)).map(x=>x.sig).join("");
}
async function safeSubmit(target,data,who,status=1){
 const h=await currentHash(target,data);
 return send("relayer","safe",proxy,"execTransaction",[target,0,data,0,0,0,0,ZeroAddress,ZeroAddress,signatures(h,who)],status);
}
const grant=abi.xp.encodeFunctionData("setVerifierRole",[account,2]);
await check("One owner signed Safe tx has status 0; no Safe nonce or role mutation",async()=>{
 const before=await read("safe",proxy,"nonce");
 await safeSubmit(xp,grant,[owners[0]],0);
 assert.equal(await read("safe",proxy,"nonce"),before);
 assert.equal(await read("xp",xp,"verifierRoles",[account]),0n);
});
await check("Non-owner plus one owner rejected, zero logs and unchanged nonce",async()=>{
 const stranger=new Wallet("0x"+"44".repeat(32));
 const before=await read("safe",proxy,"nonce");
 await safeSubmit(xp,grant,[owners[0],stranger],0);
 assert.equal(await read("safe",proxy,"nonce"),before);
 assert.equal(await read("xp",xp,"verifierRoles",[account]),0n);
});
let signedOnce;
await check("Two owner signatures execute Safe transaction and emit successful receipt",async()=>{
 const h=await currentHash(xp,grant);
 signedOnce=signatures(h,[owners[0],owners[1]]);
 const r=await send("relayer","safe",proxy,"execTransaction",[xp,0,grant,0,0,0,0,ZeroAddress,ZeroAddress,signedOnce]);
 assert.ok(r.receipt.logs.length>=2,"expected XP role-change and Safe success logs");
 const names=r.receipt.logs.flatMap(log=>{try{return [abi.safe.parseLog({topics:log[1].map(bytesToHex),data:bytesToHex(log[2])})?.name]}catch{return []}});
 assert.ok(names.includes("ExecutionSuccess"),"Safe ExecutionSuccess missing");
 assert.equal(await read("xp",xp,"verifierRoles",[account]),2n);
 assert.equal(await read("safe",proxy,"nonce"),1n);
});
await check("Replay previous Safe signatures fails receipt; Safe nonce stays one",async()=>{
 await send("relayer","safe",proxy,"execTransaction",[xp,0,grant,0,0,0,0,ZeroAddress,ZeroAddress,signedOnce],0);
 assert.equal(await read("safe",proxy,"nonce"),1n);
 assert.equal(await read("xp",xp,"verifierRoles",[account]),2n);
});
await check("Inner target revert is propagated, receipt has no logs or nonce mutation",async()=>{
 const bad=abi.xp.encodeFunctionData("setVerifierRole",[ZeroAddress,2]);
 await safeSubmit(xp,bad,[owners[1],owners[2]],0);
 assert.equal(await read("safe",proxy,"nonce"),1n);
 assert.equal(await read("xp",xp,"verifierRoles",[account]),2n);
});
await check("Two owners revoke XP authority with a successful signed receipt",async()=>{
 const revoke=abi.xp.encodeFunctionData("setVerifierRole",[account,0]);
 const r=await safeSubmit(xp,revoke,[owners[1],owners[2]]);
 assert.ok(r.receipt.logs.length>=2);
 assert.equal(await read("safe",proxy,"nonce"),2n);
 assert.equal(await read("xp",xp,"verifierRoles",[account]),0n);
});
assert.equal(n,N);
console.log("✅ 8/8 RED TEAM 2A SIGNED SAFE RECEIPT CHECKS PASS");
console.log("Scope: local EthereumJS runTx, official Safe proxy + XP Policy, not full token/Tier integration, testnet or audit.");
