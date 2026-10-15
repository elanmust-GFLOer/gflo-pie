// GFLO Ignition v0.1 signed legacy EVM tx receipts — Termux EthereumJS v10.
// No external RPC; only deterministic, synthetic test keys.
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
import {join} from "node:path";
import {homedir} from "node:os";
import {createVM,runTx} from "@ethereumjs/vm";
import {createLegacyTx} from "@ethereumjs/tx";
import {Common,Mainnet,Hardfork} from "@ethereumjs/common";
import {createAccount,createAddressFromPrivateKey,hexToBytes,bytesToHex} from "@ethereumjs/util";
const repo=join(homedir(),"gflo-pie"),req=createRequire(join(repo,"package.json"));
const solc=req("solc"),{Interface,getCreateAddress,keccak256,id}=req("ethers");
const entries={
 core:["PIECoreIgnitionV01.sol","PIECoreIgnitionV01"],
 xp:["XPPolicyV02.sol","XPPolicyV02"],
 registry:["TrustedXPSourceRegistryV02.sol","TrustedXPSourceRegistryV02"],
 token:["test/GFLOReceiptAttackTokenV01.sol","GFLOReceiptAttackTokenV01"],
 ignition:["GFLOIgnitionV01.sol","GFLOIgnitionV01"]
};
const sources=Object.fromEntries(Object.values(entries).map(([file])=>[file,{
 content:execFileSync("git",["show","origin/feature/pie-core-v0.2:contracts/"+file],{cwd:repo,encoding:"utf8"})}]));
const out=JSON.parse(solc.compile(JSON.stringify({language:"Solidity",sources,settings:{
 optimizer:{enabled:true,runs:200},evmVersion:"cancun",
 outputSelection:{"*":{"*":["abi","evm.bytecode.object"]}}}})));
for(const e of out.errors??[])if(e.severity==="error")throw Error(e.formattedMessage);
const abi={},bytecode={};
for(const [key,[file,name]] of Object.entries(entries)){
 const c=out.contracts[file][name];abi[key]=new Interface(c.abi);bytecode[key]=c.evm.bytecode.object;
}
const common=new Common({chain:Mainnet,hardfork:Hardfork.Cancun});
const vm=await createVM({common});
const key=(hex)=>hexToBytes("0x"+hex.repeat(32));
const accounts={deployer:key("11"),admin:key("22"),alice:key("33"),verifier:key("44")};
const senders={};
for(const [name,secret] of Object.entries(accounts)){
 const address=createAddressFromPrivateKey(secret);
 senders[name]={secret,address,nonce:0n};
 await vm.stateManager.putAccount(address,createAccount({balance:10n**21n}));
}
const GAS_PRICE=2000000000n;
async function transact(name,to,data,expectedStatus=1){
 const s=senders[name];
 const tx=createLegacyTx({
   nonce:s.nonce,gasLimit:8000000n,gasPrice:GAS_PRICE,
   ...(to?{to:to.toString()}:{}),
   data:hexToBytes(data)
 },{common}).sign(s.secret);
 const res=await runTx(vm,{tx});
 s.nonce++;
 const status=Number(res.receipt.status);
 assert.equal(status,expectedStatus,"transaction status for "+name+" nonce "+(s.nonce-1n));
 assert.ok(res.totalGasSpent>21000n,"gas usage recorded");
 return res;
}
async function deploy(name,key,args=[]){
 const sender=senders[name];
 const address=getCreateAddress({from:sender.address.toString(),nonce:sender.nonce});
 const init="0x"+bytecode[key]+abi[key].encodeDeploy(args).slice(2);
 const r=await transact(name,null,init);
 const {createAddressFromString}=await import("@ethereumjs/util");
 assert.ok((await vm.stateManager.getCode(createAddressFromString(address))).length>0,"deployed runtime missing");
 return {address,result:r};
}
async function call(name,key,address,method,args=[],status=1){
 return transact(name,address,abi[key].encodeFunctionData(method,args),status);
}
async function read(key,address,method,args=[]){
 const {createAddressFromString}=await import("@ethereumjs/util");
 const sender=senders.alice.address;
 const dest=createAddressFromString(address);
 const r=(await vm.evm.runCall({caller:sender,to:dest,gasLimit:2000000n,
 data:hexToBytes(abi[key].encodeFunctionData(method,args))})).execResult;
 if(r.exceptionError)throw Error("view failed "+method);
 return abi[key].decodeFunctionResult(method,bytesToHex(r.returnValue))[0];
}
const addr=name=>senders[name].address.toString();
let n=0;const N=8;
async function check(label,fn){await fn();console.log("✅ "+(++n)+"/"+N+" "+label);}
console.log("=== GFLO IGNITION — SIGNED TX RECEIPTS & ROLLBACK ===");
console.log("Compiler:",solc.version());
const core=(await deploy("deployer","core",[addr("admin")])).address;
const xp=(await deploy("deployer","xp",[core,addr("admin")])).address;
const registry=(await deploy("deployer","registry",[core,addr("admin")])).address;
const token=(await deploy("deployer","token")).address;
const ignition=(await deploy("deployer","ignition",[core,registry,token,100n,200n])).address;
const {createAddressFromString}=await import("@ethereumjs/util");
const xpCode=await vm.stateManager.getCode(createAddressFromString(xp));
await call("admin","core",core,"bindIgnition",[ignition]);
await call("admin","registry",registry,"proposePolicy",[xp,keccak256(bytesToHex(xpCode)),addr("admin")]);
await call("admin","registry",registry,"activatePolicy");
await call("admin","registry",registry,"setPaused",[false]);
await call("alice","core",core,"createIdentity",[3]);
await call("admin","token",token,"mint",[addr("alice"),1000n]);
await call("alice","token",token,"approve",[ignition,1000n]);
await call("admin","xp",xp,"setVerifierRole",[addr("verifier"),2]);
const rule=id("GFLO_SIGNED_TX_1000");
await call("admin","xp",xp,"registerRule",[rule,1000,8,0]);
await call("verifier","xp",xp,"awardXP",[addr("alice"),rule,id("tx-event-1"),id("tx-proof-1")]);
await check("Signed deployments, nonce and receipts initialize canonical XP",async()=>{
 assert.equal(await read("registry",registry,"totalXP",[addr("alice")]),1025n);
 assert.equal((await vm.stateManager.getAccount(senders.deployer.address)).nonce,5n);
});
await check("Failed signed burn has status 0, no emitted logs or state mutation",async()=>{
 await call("admin","token",token,"setMode",[1]);
 const prev=[await read("token",token,"balanceOf",[addr("alice")]),await read("token",token,"totalSupply"),await read("core",core,"getIdentity",[addr("alice")])];
 const failed=await call("alice","ignition",ignition,"ignite",[],0);
 assert.equal(failed.receipt.logs.length,0);
 assert.equal(await read("token",token,"balanceOf",[addr("alice")]),prev[0]);
 assert.equal(await read("token",token,"totalSupply"),prev[1]);
 assert.equal((await read("core",core,"getIdentity",[addr("alice")])).tier,prev[2].tier);
});
await check("Partial burn signed tx reverts both token and Tier; receipt empty",async()=>{
 await call("admin","token",token,"setMode",[2]);
 const before=await read("token",token,"allowance",[addr("alice"),ignition]);
 const failed=await call("alice","ignition",ignition,"ignite",[],0);
 assert.equal(failed.receipt.logs.length,0);
 assert.equal(await read("token",token,"allowance",[addr("alice"),ignition]),before);
 assert.equal((await read("core",core,"getIdentity",[addr("alice")])).tier,0n);
});
await check("Signed callback records exact Busy() custom-error selector",async()=>{
 await call("admin","token",token,"setMode",[3]);
 const r=await call("alice","ignition",ignition,"ignite");
 assert.ok(r.receipt.logs.length>=3);
 assert.equal(await read("token",token,"lastCallbackSucceeded"),false);
 assert.equal(await read("token",token,"lastCallbackSelector"),abi.ignition.getError("Busy").selector);
 assert.equal((await read("core",core,"getIdentity",[addr("alice")])).tier,1n);
});
await check("Signed successful burn emits transaction logs and exact supply delta",async()=>{
 assert.equal(await read("token",token,"balanceOf",[addr("alice")]),900n);
 assert.equal(await read("token",token,"totalSupply"),900n);
});
await check("Signed second ignition below Praxis XP threshold reverts without logs",async()=>{
 const r=await call("alice","ignition",ignition,"ignite",[],0);
 assert.equal(r.receipt.logs.length,0);
 assert.equal((await read("core",core,"getIdentity",[addr("alice")])).tier,1n);
});
await check("Signed tx gas, nonce and fee are measurable",async()=>{
 const nonce=(await vm.stateManager.getAccount(senders.alice.address)).nonce;
 assert.equal(nonce,6n); // identity + approve + two failed + success + threshold failure
});
await check("Registry remains canonical while Core genesis XP stays 25",async()=>{
 assert.equal((await read("core",core,"getIdentity",[addr("alice")])).xp,25n);
 assert.equal(await read("registry",registry,"totalXP",[addr("alice")]),1025n);
});
console.log("✅ 8/8 SIGNED TRANSACTION SECURITY CHECKS PASS");
