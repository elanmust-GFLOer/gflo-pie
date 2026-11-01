// GFLO A-B-A: REAL Safe 1.5.0 singleton + factory proxy, 2-of-3, XP + Ignition.
// Experimental local EthereumJS v10. Only deterministic disposable keys.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
import {homedir} from "node:os";
import {createVM,runTx} from "@ethereumjs/vm";
import {createLegacyTx} from "@ethereumjs/tx";
import {Common,Mainnet,Hardfork} from "@ethereumjs/common";
import {createAccount,createAddressFromPrivateKey,createAddressFromString,hexToBytes,bytesToHex} from "@ethereumjs/util";

const repo=path.join(homedir(),"gflo-pie");
const deps=createRequire(path.join(repo,"package.json"));
const solc=deps("solc");
const {Interface,SigningKey,ZeroAddress,getCreateAddress,keccak256,id,parseUnits}=deps("ethers");
const safePkg="node_modules/@safe-global/safe-smart-account/build/artifacts/contracts/";
function safeArtifact(part){return JSON.parse(fs.readFileSync(path.join(safePkg,part),"utf8"));}
const safeArt=safeArtifact("Safe.sol/Safe.json");
const factoryArt=safeArtifact("proxies/SafeProxyFactory.sol/SafeProxyFactory.json");
const safeBytecode=safeArt.bytecode?.object ?? safeArt.bytecode;
const factoryBytecode=factoryArt.bytecode?.object ?? factoryArt.bytecode;
assert.ok(safeBytecode?.startsWith("0x") && factoryBytecode?.startsWith("0x"),"Safe artifact bytecode missing");
const sources={};
const entry={
 core:["PIECoreIgnitionV01.sol","PIECoreIgnitionV01"],
 xp:["XPPolicyV02.sol","XPPolicyV02"],
 registry:["TrustedXPSourceRegistryV02.sol","TrustedXPSourceRegistryV02"],
 token:["GFLOFixedSupplyV01.sol","GFLOFixedSupplyV01"],
 ignition:["GFLOIgnitionV01.sol","GFLOIgnitionV01"]
};
for(const [file] of Object.values(entry)){
 sources[file]={content:execFileSync("git",["show","origin/feature/pie-core-v0.2:contracts/"+file],
  {cwd:repo,encoding:"utf8"})};
}
const ozRoot=path.join(process.cwd(),"node_modules/@openzeppelin/contracts");
assert.ok(fs.existsSync(path.join(ozRoot,"package.json")),"Local OpenZeppelin missing");
const build=JSON.parse(solc.compile(JSON.stringify({
 language:"Solidity",sources,settings:{optimizer:{enabled:true,runs:200},evmVersion:"cancun",
 outputSelection:{"*":{"*":["abi","evm.bytecode.object"]}}}
}),{import:(name)=>{
 try{
  const prefix="@openzeppelin/contracts/";
  if(!name.startsWith(prefix))return{error:"Unsupported import "+name};
  const resolved=path.resolve(ozRoot,name.slice(prefix.length));
  if(!resolved.startsWith(ozRoot+path.sep))return{error:"Unsafe import"};
  return{contents:fs.readFileSync(resolved,"utf8")};
 }catch(e){return{error:String(e)};}
}}));
for(const e of build.errors??[])if(e.severity==="error")throw Error(e.formattedMessage);
const abi={safe:new Interface(safeArt.abi),factory:new Interface(factoryArt.abi)};
const creation={safe:safeBytecode,factory:factoryBytecode};
for(const [key,[file,contract]]of Object.entries(entry)){
 const a=build.contracts[file][contract];abi[key]=new Interface(a.abi);
 creation[key]=a.evm.bytecode.object;
}
const common=new Common({chain:Mainnet,hardfork:Hardfork.Cancun});
const vm=await createVM({common});
const secret=c=>hexToBytes("0x"+c.repeat(32));
const keys={deployer:secret("11"),relayer:secret("22"),alice:secret("33"),
 verifier:secret("44"),A:secret("55"),B:secret("66"),C:secret("77"),outsider:secret("88")};
const signers={};
for(const [name,privateKey]of Object.entries(keys)){
 const address=createAddressFromPrivateKey(privateKey);
 signers[name]={privateKey,address,nonce:0n};
 await vm.stateManager.putAccount(address,createAccount({balance:10n**22n}));
}
const adr=name=>signers[name].address.toString();
function hexData(h){return hexToBytes(h.startsWith("0x")?h:"0x"+h);}
async function send(name,to,data,expected=1){
 const s=signers[name];
 const tx=createLegacyTx({nonce:s.nonce,gasLimit:12000000n,gasPrice:2000000000n,
  ...(to?{to}:{}),data:hexData(data)},{common}).sign(s.privateKey);
 const r=await runTx(vm,{tx});s.nonce++;
 assert.equal(Number(r.receipt.status),expected,
  "Transaction status "+name+" #"+(s.nonce-1n)+": "+(r.execResult.exceptionError?.error??"no revert"));
 return r;
}
async function deploy(key,args=[]){
 const from=signers.deployer;
 const address=getCreateAddress({from:adr("deployer"),nonce:from.nonce});
 const init="0x"+creation[key].replace(/^0x/,"")+abi[key].encodeDeploy(args).slice(2);
 await send("deployer",null,init);
 assert.ok((await vm.stateManager.getCode(createAddressFromString(address))).length>0,
  "Deployed code missing for "+key);
 return address;
}
async function call(name,key,to,method,args=[],status=1){
 return send(name,to,abi[key].encodeFunctionData(method,args),status);
}
async function read(key,to,method,args=[]){
 const viewer=createAddressFromString("0x"+"ee".repeat(20));
 await vm.stateManager.checkpoint();
 try{
  const r=(await vm.evm.runCall({caller:viewer,to:createAddressFromString(to),
   isStatic:true,gasLimit:4000000n,data:hexData(abi[key].encodeFunctionData(method,args))})).execResult;
  if(r.exceptionError)throw Error("Read "+key+"."+method+": "+r.exceptionError.error);
  return abi[key].decodeFunctionResult(method,bytesToHex(r.returnValue))[0];
 }finally{await vm.stateManager.revert();}
}
const zero=ZeroAddress;
function getLog(log,iface){
 try{
  return iface.parseLog({topics:log[1].map(bytesToHex),data:bytesToHex(log[2])});
 }catch{return null;}
}
let score=0;const TOTAL=10;
async function test(label,cb){
 await cb();console.log("✅ "+(++score)+"/"+TOTAL+" "+label);
}
console.log("=== GFLO A-B-A — REAL SAFE 2-OF-3 + IGNITION ===");
console.log("solc:",solc.version());
console.log("Safe: official @safe-global/safe-smart-account 1.5.0 artifact");
const singleton=await deploy("safe");
const factory=await deploy("factory");
const owners=["A","B","C"].map(adr);
const setup=abi.safe.encodeFunctionData("setup",[
 owners,2,zero,"0x",zero,zero,0n,zero
]);
const created=await call("deployer","factory",factory,"createProxyWithNonce",[singleton,setup,12345n]);
const event=created.receipt.logs.map(log=>getLog(log,abi.factory))
 .find(e=>e?.name==="ProxyCreation");
assert.ok(event,"Official factory ProxyCreation receipt event missing");
const safe=event.args[0];
assert.ok((await vm.stateManager.getCode(createAddressFromString(safe))).length>0,"Safe proxy code missing");
const core=await deploy("core",[safe]);
const xp=await deploy("xp",[core,safe]);
const registry=await deploy("registry",[core,safe]);
const amount=parseUnits("1000",18);
const token=await deploy("token",[adr("alice"),amount]);
const ignition=await deploy("ignition",[core,registry,token,parseUnits("100",18),parseUnits("200",18)]);
await call("alice","core",core,"createIdentity",[3]);
await call("alice","token",token,"approve",[ignition,parseUnits("300",18)]);

const baseArgs=(to,data)=>[to,0n,data,0,0n,0n,0n,zero,zero];
const payload=(to,data,signatures)=>abi.safe.encodeFunctionData("execTransaction",[
 ...baseArgs(to,data),signatures
]);
async function safeHash(to,data){
 const nonce=await read("safe",safe,"nonce");
 return read("safe",safe,"getTransactionHash",[...baseArgs(to,data),nonce]);
}
function signHash(hash,names){
 return "0x"+names.map(n=>{
  const signature=new SigningKey(signers[n].privateKey).sign(hash);
  const v=signature.v.toString(16).padStart(2,"0");
  return {address:adr(n).toLowerCase(),part:signature.r.slice(2)+signature.s.slice(2)+v};
 }).sort((a,b)=>a.address.localeCompare(b.address)).map(x=>x.part).join("");
}
async function viaSafe(to,data,names,expected=1){
 const hash=await safeHash(to,data);
 const r=await send("relayer",safe,payload(to,data,signHash(hash,names)),expected);
 if(expected===1){
  assert.ok(r.receipt.logs.map(l=>getLog(l,abi.safe)).some(e=>e?.name==="ExecutionSuccess"),
   "Safe outer receipt succeeded without ExecutionSuccess");
 }
 return {r,hash,signatures:signHash(hash,names)};
}
const changeRole=abi.xp.encodeFunctionData("setVerifierRole",[adr("verifier"),2]);
await test("Factory-created Safe proxy has three real owners and threshold 2",async()=>{
 const listed=await read("safe",safe,"getOwners");
 assert.equal(listed.length,3);
 assert.deepEqual([...listed].map(x=>x.toLowerCase()).sort(),
  [...owners].map(x=>x.toLowerCase()).sort());
 assert.equal(await read("safe",safe,"getThreshold"),2n);
 assert.equal(await read("safe",safe,"VERSION"),"1.5.0");
});
await test("Direct EOA cannot grant XP verifier role",async()=>{
 await call("A","xp",xp,"setVerifierRole",[adr("verifier"),2],0);
 assert.equal(await read("xp",xp,"verifierRoles",[adr("verifier")]),0n);
 assert.equal((await read("xp",xp,"owner")).toLowerCase(),safe.toLowerCase());
});
await test("Only one Safe signature fails and keeps Safe nonce 0",async()=>{
 await viaSafe(xp,changeRole,["A"],0);
 assert.equal(await read("safe",safe,"nonce"),0n);
 assert.equal(await read("xp",xp,"verifierRoles",[adr("verifier")]),0n);
});
await test("One signer plus unauthorized outsider still fails",async()=>{
 await viaSafe(xp,changeRole,["A","outsider"],0);
 assert.equal(await read("safe",safe,"nonce"),0n);
 assert.equal(await read("xp",xp,"verifierRoles",[adr("verifier")]),0n);
});
let completed;
await test("Two distinct signers grant elevated XP role via genuine Safe",async()=>{
 completed=await viaSafe(xp,changeRole,["A","B"]);
 assert.equal(await read("safe",safe,"nonce"),1n);
 assert.equal(await read("xp",xp,"verifierRoles",[adr("verifier")]),2n);
});
await test("Replay of exact signed Safe transaction is rejected",async()=>{
 await send("relayer",safe,payload(xp,changeRole,completed.signatures),0);
 assert.equal(await read("safe",safe,"nonce"),1n);
 assert.equal(await read("xp",xp,"verifierRoles",[adr("verifier")]),2n);
});
const rule=id("GFLO_ABA_SAFE_1000");
await test("Two signatures register XP rule, verifier awards 1000",async()=>{
 await viaSafe(xp,abi.xp.encodeFunctionData("registerRule",[rule,1000,10,0]),["B","C"]);
 await call("verifier","xp",xp,"awardXP",[
  adr("alice"),rule,id("SAFE_PROOF_EVENT_1"),id("SAFE_PROOF_EVIDENCE_1")
 ]);
 assert.equal(await read("xp",xp,"totalXP",[adr("alice")]),1025n);
});
await test("Safe alone controls the immutable Core Ignition binding",async()=>{
 await call("A","core",core,"bindIgnition",[ignition],0);
 await viaSafe(core,abi.core.encodeFunctionData("bindIgnition",[ignition]),["A","C"]);
 assert.equal((await read("core",core,"ignition")).toLowerCase(),ignition.toLowerCase());
});
await test("Safe proposes, activates and unpauses canonical XP Registry",async()=>{
 const policyCode=await vm.stateManager.getCode(createAddressFromString(xp));
 const expectedHash=keccak256(bytesToHex(policyCode));
 await viaSafe(registry,abi.registry.encodeFunctionData("proposePolicy",[xp,expectedHash,safe]),["A","B"]);
 await viaSafe(registry,abi.registry.encodeFunctionData("activatePolicy",[]),["B","C"]);
 await viaSafe(registry,abi.registry.encodeFunctionData("setPaused",[false]),["A","C"]);
 assert.equal((await read("registry",registry,"governance")).toLowerCase(),safe.toLowerCase());
 assert.equal(await read("registry",registry,"totalXP",[adr("alice")]),1025n);
});
await test("Canonical XP + fixed supply ERC20Burnable atomically upgrades Tier 1",async()=>{
 const before=await read("token",token,"totalSupply");
 const receipt=await call("alice","ignition",ignition,"ignite");
 assert.equal(Number(receipt.receipt.status),1);
 const identity=await read("core",core,"getIdentity",[adr("alice")]);
 assert.equal(identity.tier,1n);
 assert.equal(await read("token",token,"totalSupply"),before-parseUnits("100",18));
 assert.equal(await read("token",token,"balanceOf",[adr("alice")]),parseUnits("900",18));
 const burned=receipt.receipt.logs.map(l=>getLog(l,abi.token))
  .some(e=>e?.name==="Transfer" && e.args.to.toLowerCase()===zero.toLowerCase()
   && e.args.value===parseUnits("100",18));
 assert.ok(burned,"ERC20 Transfer-to-zero burn event missing");
});
assert.equal(score,TOTAL);
console.log("✅ 10/10 REAL SAFE 2-OF-3 + GFLO IGNITION CHECKS PASS");
console.log("Scope: signed legacy tx in local EthereumJS VM; Safe 1.5.0 official artifacts, no public chain/audit.");
