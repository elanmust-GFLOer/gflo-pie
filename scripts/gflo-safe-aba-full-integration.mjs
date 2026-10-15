// GFLO real Safe 2/3 + canonical XP + OpenZeppelin GFLO burn, local EVM only.
// Synthetic keys, illustrative ONE GFLO Tier1 fee. Uses official Safe v1.5.0 bytecode.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
import {homedir} from "node:os";
import {join} from "node:path";
import {createVM} from "@ethereumjs/vm";
import {Common,Mainnet,Hardfork} from "@ethereumjs/common";
import {createAccount,createAddressFromString,hexToBytes,bytesToHex} from "@ethereumjs/util";
const repo=join(homedir(),"gflo-pie"),req=createRequire(join(repo,"package.json")),localRequire=createRequire(import.meta.url);
const solc=req("solc"),{Interface,Wallet,ZeroAddress,keccak256,parseUnits,id}=req("ethers");
const safeRoot=join(process.cwd(),"node_modules/@safe-global/safe-smart-account/build/artifacts/contracts");
const sf=f=>JSON.parse(fs.readFileSync(join(safeRoot,f),"utf8"));
const official={safe:sf("Safe.sol/Safe.json"),factory:sf("proxies/SafeProxyFactory.sol/SafeProxyFactory.json")};
const srcFiles={core:"PIECoreIgnitionV01.sol",xp:"XPPolicyV02.sol",registry:"TrustedXPSourceRegistryV02.sol",token:"GFLOFixedSupplyV01.sol",ignition:"GFLOIgnitionV01.sol"};
const sources=Object.fromEntries(Object.values(srcFiles).map(f=>[f,{content:execFileSync("git",["show","origin/feature/pie-core-v0.2:contracts/"+f],{cwd:repo,encoding:"utf8"})}]));
const ozRoot=path.dirname(localRequire.resolve("@openzeppelin/contracts/package.json"));
// RED TEAM: intentional in-memory source faults, never written to Solidity files.
const fault=process.env.GFLO_REDTEAM_FAULT;
if(fault){
 const mutations={
  xp_threshold:["GFLOIgnitionV01.sol","uint64 public constant REFORMER_XP = 1000;","uint64 public constant REFORMER_XP = 0;"],
  skip_burn:["GFLOIgnitionV01.sol","gflo.burnFrom(msg.sender, amount);","// RED TEAM: intentionally skip token burn"],
  bypass_tier_auth:["PIECoreIgnitionV01.sol","if (msg.sender != ignition || ignition == address(0)) revert NotIgnition();","// RED TEAM: intentionally bypass Tier authorization"]
 };
 const mutation=mutations[fault];
 if(!mutation)throw Error("Unknown redteam mutation: "+fault);
 const [filename,original,replacement]=mutation;
 const text=sources[filename].content;
 if(text.split(original).length!==2)throw Error("Redteam mutation target not uniquely found: "+fault);
 sources[filename].content=text.replace(original,replacement);
 console.log("REDTEAM_MUTATION="+fault);
}
const out=JSON.parse(solc.compile(JSON.stringify({language:"Solidity",sources,settings:{optimizer:{enabled:true,runs:200},evmVersion:"cancun",outputSelection:{"*":{"*":["abi","evm.bytecode.object"]}}}}),{import:(name)=>{
 try{
  if(!name.startsWith("@openzeppelin/contracts/"))return {error:"Unexpected Solidity import: "+name};
  const resolved=path.resolve(ozRoot,name.slice("@openzeppelin/contracts/".length));
  if(!resolved.startsWith(ozRoot+path.sep))return {error:"Unsafe import: "+name};
  return {contents:fs.readFileSync(resolved,"utf8")};
 }catch(e){return {error:String(e)};}
}}));
for(const e of out.errors??[])if(e.severity==="error")throw Error(e.formattedMessage);
const artifacts={...official};
for(const [k,f] of Object.entries(srcFiles)){
 const name={core:"PIECoreIgnitionV01",xp:"XPPolicyV02",registry:"TrustedXPSourceRegistryV02",token:"GFLOFixedSupplyV01",ignition:"GFLOIgnitionV01"}[k];
 artifacts[k]=out.contracts[f][name];
}
const abi=Object.fromEntries(Object.entries(artifacts).map(([k,v])=>[k,new Interface(v.abi)]));
const bc=k=>{const c=artifacts[k],s=typeof c.bytecode==="string"?c.bytecode:c.bytecode?.object??c.evm.bytecode.object;return s.startsWith("0x")?s:"0x"+s;};
const vm=await createVM({common:new Common({chain:Mainnet,hardfork:Hardfork.Cancun})});
const addr=x=>createAddressFromString(x);
const owners=["11","22","33"].map(n=>new Wallet("0x"+n.repeat(32)));
const creator=addr("0x"+"dd".repeat(20)),relayer=addr("0x"+"ee".repeat(20));
const alice=addr("0x"+"aa".repeat(20)),verifier=addr("0x"+"bb".repeat(20));
for(const a of [creator,relayer,alice,verifier,...owners.map(w=>addr(w.address))])
 await vm.stateManager.putAccount(a,createAccount({balance:10n**23n}));
async function invoke(from,to,data){return (await vm.evm.runCall({caller:from,...(to?{to}:{}),data:hexToBytes(data),gasLimit:23000000n})).execResult;}
async function deploy(k,args=[]){
 const r=await vm.evm.runCall({caller:creator,data:hexToBytes(bc(k)+abi[k].encodeDeploy(args).slice(2)),gasLimit:23000000n});
 if(r.execResult.exceptionError)throw Error("Deploy "+k+": "+r.execResult.exceptionError.error+" "+bytesToHex(r.execResult.returnValue));
 assert.ok(r.createdAddress,"No address for "+k);
 return r.createdAddress;
}
async function call(k,to,fn,args=[],from=relayer){
 return invoke(from,to,abi[k].encodeFunctionData(fn,args));
}
async function ok(k,to,fn,args=[],from=relayer){
 const r=await call(k,to,fn,args,from);
 if(r.exceptionError)throw Error(k+"."+fn+" reverted: "+r.exceptionError.error+" "+bytesToHex(r.returnValue));
 return abi[k].decodeFunctionResult(fn,bytesToHex(r.returnValue));
}
async function fail(k,to,fn,args=[],from=relayer){
 const r=await call(k,to,fn,args,from);assert.ok(r.exceptionError,"Expected revert: "+k+"."+fn);
}
async function read(k,to,fn,args=[]){
 await vm.stateManager.checkpoint();
 try {return await ok(k,to,fn,args);}
 finally {await vm.stateManager.revert();}
}
let n=0;const N=11;
async function check(msg,fn){await fn();console.log("✅ "+(++n)+"/"+N+" "+msg);}
const singleton=await deploy("safe"),factory=await deploy("factory");
const init=abi.safe.encodeFunctionData("setup",[owners.map(x=>x.address),2,ZeroAddress,"0x",ZeroAddress,ZeroAddress,0,ZeroAddress]);
const created=await ok("factory",factory,"createProxyWithNonce",[singleton.toString(),init,20261015n]);
const safe=addr(created[0]);
const core=await deploy("core",[safe.toString()]);
const xp=await deploy("xp",[core.toString(),safe.toString()]);
const registry=await deploy("registry",[core.toString(),safe.toString()]);
const supply=parseUnits("1000",18),fee=parseUnits("1",18);
const token=await deploy("token",[alice.toString(),supply]);
const ignition=await deploy("ignition",[core.toString(),registry.toString(),token.toString(),fee,2n*fee]);
async function txHash(to,data){
 const nonce=(await read("safe",safe,"nonce"))[0];
 return (await read("safe",safe,"getTransactionHash",[to.toString(),0,data,0,0,0,0,ZeroAddress,ZeroAddress,nonce]))[0];
}
function signatures(hash,who){
 return "0x"+who.map(w=>({address:w.address.toLowerCase(),sig:w.signingKey.sign(hash).serialized.slice(2)}))
 .sort((a,b)=>a.address.localeCompare(b.address)).map(v=>v.sig).join("");
}
async function safeExec(k,to,fn,args=[],who=[owners[0],owners[1]]){
 const data=abi[k].encodeFunctionData(fn,args),hash=await txHash(to,data);
 const r=await call("safe",safe,"execTransaction",[to.toString(),0,data,0,0,0,0,ZeroAddress,ZeroAddress,signatures(hash,who)]);
 return r;
}
async function safeOk(k,to,fn,args=[]){
 const r=await safeExec(k,to,fn,args);
 if(r.exceptionError)throw Error("Safe "+k+"."+fn+" reverted: "+r.exceptionError.error+" "+bytesToHex(r.returnValue));
 assert.equal(abi.safe.decodeFunctionResult("execTransaction",bytesToHex(r.returnValue))[0],true,"Safe inner call failed");
}
async function safeFail(k,to,fn,args=[]){
 const prior=(await read("safe",safe,"nonce"))[0];
 const r=await safeExec(k,to,fn,args,[owners[0]]);
 assert.ok(r.exceptionError,"One owner unexpectedly passed "+fn);
 assert.equal((await read("safe",safe,"nonce"))[0],prior,"Reverted authorization consumed nonce");
}
console.log("=== GFLO SAFE 2/3 + OZ TOKEN + CANONICAL XP + IGNITION ===");
console.log("solc:",solc.version());
await check("Official Safe proxy initialized with three owners and threshold 2",async()=>{
 assert.equal((await read("safe",safe,"VERSION"))[0],"1.5.0");
 assert.equal((await read("safe",safe,"getOwners"))[0].length,3);
 assert.equal((await read("safe",safe,"getThreshold"))[0],2n);
});
await check("All three GFLO authorities point to same Safe",async()=>{
 assert.equal((await read("core",core,"bindingAuthority"))[0].toLowerCase(),safe.toString().toLowerCase());
 assert.equal((await read("xp",xp,"owner"))[0].toLowerCase(),safe.toString().toLowerCase());
 assert.equal((await read("registry",registry,"governance"))[0].toLowerCase(),safe.toString().toLowerCase());
});
await check("One owner cannot bind Ignition or propose canonical policy",async()=>{
 await fail("core",core,"bindIgnition",[ignition.toString()],addr(owners[0].address));
 await safeFail("core",core,"bindIgnition",[ignition.toString()]);
 await safeFail("registry",registry,"proposePolicy",[xp.toString(),keccak256(bytesToHex(await vm.stateManager.getCode(xp))),safe.toString()]);
 assert.equal((await read("core",core,"ignition"))[0],ZeroAddress);
});
await check("Two owners bind Ignition once; repeated binding is refused",async()=>{
 await safeOk("core",core,"bindIgnition",[ignition.toString()]);
 assert.equal((await read("core",core,"ignition"))[0].toLowerCase(),ignition.toString().toLowerCase());
 await fail("core",core,"bindIgnition",[ignition.toString()],relayer);
 const nonceBefore=(await read("safe",safe,"nonce"))[0];
 const r=await safeExec("core",core,"bindIgnition",[ignition.toString()]);
 // Official Safe v1.5.0 reverts the OUTER call on inner failure when
 // safeTxGas == 0 AND gasPrice == 0 (see Safe.sol execTransaction).
 assert.ok(r.exceptionError,"Safe must revert on target failure with zero gas settings");
 assert.equal((await read("safe",safe,"nonce"))[0],nonceBefore,"Safe nonce changed after reverted inner call");
 assert.equal((await read("core",core,"ignition"))[0].toLowerCase(),ignition.toString().toLowerCase());
});
await check("Two owners activate verified canonical policy and unpause Registry",async()=>{
 const codehash=keccak256(bytesToHex(await vm.stateManager.getCode(xp)));
 await safeOk("registry",registry,"proposePolicy",[xp.toString(),codehash,safe.toString()]);
 await safeOk("registry",registry,"activatePolicy");
 await safeOk("registry",registry,"setPaused",[false]);
 assert.equal((await read("registry",registry,"activeSource"))[0].toLowerCase(),xp.toString().toLowerCase());
});
await ok("core",core,"createIdentity",[3],alice);
await check("Genesis 25 XP and insufficient XP prohibit burn or Tier upgrade",async()=>{
 assert.equal((await read("registry",registry,"totalXP",[alice.toString()]))[0],25n);
 await ok("token",token,"approve",[ignition.toString(),fee],alice);
 await fail("ignition",ignition,"ignite",[],alice);
 assert.equal((await read("token",token,"totalSupply"))[0],supply);
 assert.equal((await read("core",core,"getIdentity",[alice.toString()]))[0].tier,0n);
});
await check("Only Safe 2/3 may appoint verifier and register 1000-XP rule",async()=>{
 await safeFail("xp",xp,"setVerifierRole",[verifier.toString(),2]);
 await safeOk("xp",xp,"setVerifierRole",[verifier.toString(),2]);
 await safeOk("xp",xp,"registerRule",[id("SAFE_INTEGRATED_1000"),1000,1,0]);
 assert.equal((await read("xp",xp,"verifierRoles",[verifier.toString()]))[0],2n);
});
await ok("xp",xp,"awardXP",[alice.toString(),id("SAFE_INTEGRATED_1000"),id("SAFE_EVIDENCE_EVENT_1"),id("SAFE_EVIDENCE_HASH_1")],verifier);
await check("Canonical XP becomes 1025 while original Core XP stays Genesis 25",async()=>{
 assert.equal((await read("registry",registry,"totalXP",[alice.toString()]))[0],1025n);
 assert.equal((await read("core",core,"getIdentity",[alice.toString()]))[0].xp,25n);
});
await check("Actual OpenZeppelin burnFrom destroys exactly one GFLO and advances Tier 1",async()=>{
 await ok("ignition",ignition,"ignite",[],alice);
 assert.equal((await read("token",token,"balanceOf",[alice.toString()]))[0],supply-fee);
 assert.equal((await read("token",token,"totalSupply"))[0],supply-fee);
 assert.equal((await read("token",token,"allowance",[alice.toString(),ignition.toString()]))[0],0n);
 assert.equal((await read("core",core,"getIdentity",[alice.toString()]))[0].tier,1n);
});
await check("Under 5000 XP, second ignition rolls back without new GFLO burn",async()=>{
 await fail("ignition",ignition,"ignite",[],alice);
 assert.equal((await read("token",token,"totalSupply"))[0],supply-fee);
 assert.equal((await read("core",core,"getIdentity",[alice.toString()]))[0].tier,1n);
});
await check("Paused canonical Registry rejects XP reads and preserves token/Tier state",async()=>{
 await safeOk("registry",registry,"setPaused",[true]);
 await fail("registry",registry,"totalXP",[alice.toString()]);
 await fail("ignition",ignition,"ignite",[],alice);
 assert.equal((await read("token",token,"totalSupply"))[0],supply-fee);
 assert.equal((await read("core",core,"getIdentity",[alice.toString()]))[0].tier,1n);
});
assert.equal(n,N);
console.log("✅ 11/11 SAFE + REGISTRY + OZ BURN + IGNITION INTEGRATION CHECKS PASS");
console.log("Scope: local EthereumJS runCall; synthetic signers; illustrative fee, NOT signed outer tx/testnet/audit.");
