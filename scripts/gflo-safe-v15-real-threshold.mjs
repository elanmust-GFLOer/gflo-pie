// GFLO — actual official Safe v1.5.0 proxy 2-of-3 authorization (Termux / EthereumJS).
// Synthetic test keys only. No chain RPC, real funds, or production keys.
import assert from "node:assert/strict";
import fs from "node:fs";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
import {homedir} from "node:os";
import {join} from "node:path";
import {createVM} from "@ethereumjs/vm";
import {Common,Mainnet,Hardfork} from "@ethereumjs/common";
import {createAccount,createAddressFromString,hexToBytes,bytesToHex} from "@ethereumjs/util";

const home=homedir(),repo=join(home,"gflo-pie");
const req=createRequire(join(repo,"package.json"));
const {Interface,Wallet,keccak256,concat,ZeroAddress}=req("ethers");
const solc=req("solc");
const safeRoot=join(process.cwd(),"node_modules/@safe-global/safe-smart-account/build/artifacts/contracts");
const artifact=(path)=>JSON.parse(fs.readFileSync(join(safeRoot,path),"utf8"));
const safeArtifact=artifact("Safe.sol/Safe.json");
const factoryArtifact=artifact("proxies/SafeProxyFactory.sol/SafeProxyFactory.json");
function getBytecode(a){
 const b=typeof a.bytecode==="string"?a.bytecode:a.bytecode?.object;
 assert.ok(b?.startsWith("0x") && b.length>100,"Missing artifact bytecode");
 assert.ok(!b.includes("__"),"Unlinked Safe artifact");
 return b;
}
const safeAbi=new Interface(safeArtifact.abi);
const factoryAbi=new Interface(factoryArtifact.abi);
const sources={"XPPolicyV02.sol":{content:execFileSync("git",["show","origin/feature/pie-core-v0.2:contracts/XPPolicyV02.sol"],{cwd:repo,encoding:"utf8"})},
 "PIECoreIgnitionV01.sol":{content:execFileSync("git",["show","origin/feature/pie-core-v0.2:contracts/PIECoreIgnitionV01.sol"],{cwd:repo,encoding:"utf8"})}};
const output=JSON.parse(solc.compile(JSON.stringify({language:"Solidity",sources,settings:{optimizer:{enabled:true,runs:200},evmVersion:"cancun",outputSelection:{"*":{"*":["abi","evm.bytecode.object"]}}}})));
for(const e of output.errors??[])if(e.severity==="error")throw Error(e.formattedMessage);
const coreArtifact=output.contracts["PIECoreIgnitionV01.sol"].PIECoreIgnitionV01;
const xpArtifact=output.contracts["XPPolicyV02.sol"].XPPolicyV02;
const coreAbi=new Interface(coreArtifact.abi),xpAbi=new Interface(xpArtifact.abi);
const common=new Common({chain:Mainnet,hardfork:Hardfork.Cancun});
const vm=await createVM({common});
const addr=x=>createAddressFromString(x);
const ownerWallets=["11","22","33"].map(x=>new Wallet("0x"+x.repeat(32)));
const stranger=new Wallet("0x"+"44".repeat(32));
const creator=addr("0x"+"dd".repeat(20)),relayer=addr("0x"+"ee".repeat(20));
for(const address of [creator,relayer,...ownerWallets.map(x=>addr(x.address)),addr(stranger.address)])
 await vm.stateManager.putAccount(address,createAccount({balance:10n**22n}));
async function invoke(sender,to,data,gasLimit=18000000n){
 const res=await vm.evm.runCall({caller:sender,...(to?{to}:{}),data:hexToBytes(data),gasLimit});
 return res;
}
async function deploy(code){
 const res=await invoke(creator,null,code);
 if(res.execResult.exceptionError)throw Error("CREATE: "+res.execResult.exceptionError.error);
 assert.ok(res.createdAddress,"No createdAddress");
 return res.createdAddress;
}
async function execute(to,iface,name,args,from=relayer){
 const res=await invoke(from,to,iface.encodeFunctionData(name,args));
 return res.execResult;
}
async function success(to,iface,name,args,from=relayer){
 const e=await execute(to,iface,name,args,from);
 if(e.exceptionError)throw Error(name+" unexpectedly reverted: "+e.exceptionError.error+" "+bytesToHex(e.returnValue));
 return iface.decodeFunctionResult(name,bytesToHex(e.returnValue));
}
async function reject(to,iface,name,args,from=relayer){
 const e=await execute(to,iface,name,args,from);
 assert.ok(e.exceptionError,"Expected rejection for "+name);
}
async function view(to,iface,name,args=[]){
 await vm.stateManager.checkpoint();
 try{
  const e=await execute(to,iface,name,args);
  if(e.exceptionError)throw Error("view "+name+": "+e.exceptionError.error);
  return iface.decodeFunctionResult(name,bytesToHex(e.returnValue));
 }finally{await vm.stateManager.revert();}
}
let passed=0;const TOTAL=8;
async function check(label,fn){await fn();console.log("✅ "+(++passed)+"/"+TOTAL+" "+label);}
console.log("=== GFLO ACTUAL SAFE V1.5.0 — TWO OF THREE ===");
console.log("solc:",solc.version());
const singleton=await deploy(getBytecode(safeArtifact));
const factory=await deploy(getBytecode(factoryArtifact));
const ownerAddresses=ownerWallets.map(w=>w.address);
const initializer=safeAbi.encodeFunctionData("setup",[
 ownerAddresses,2,ZeroAddress,"0x",ZeroAddress,ZeroAddress,0,ZeroAddress]);
const result=await success(factory,factoryAbi,"createProxyWithNonce",[singleton.toString(),initializer,1405]);
const safe=addr(result[0]);
const core=await deploy("0x"+coreArtifact.evm.bytecode.object+coreAbi.encodeDeploy([safe.toString()]).slice(2));
const xp=await deploy("0x"+xpArtifact.evm.bytecode.object+xpAbi.encodeDeploy([core.toString(),safe.toString()]).slice(2));
await check("Official singleton and initialized Safe proxy deploy successfully",async()=>{
 assert.ok((await vm.stateManager.getCode(safe)).length>0);
 assert.equal((await view(safe,safeAbi,"VERSION"))[0],"1.5.0");
});
await check("Real Safe owner list has three distinct accounts and threshold two",async()=>{
 const owners=await view(safe,safeAbi,"getOwners");
 assert.equal(owners[0].length,3);
 assert.equal(new Set(owners[0].map(a=>a.toLowerCase())).size,3);
 assert.equal((await view(safe,safeAbi,"getThreshold"))[0],2n);
});
await check("XP Policy owner is Safe; direct signer or relayer cannot set verifier",async()=>{
 assert.equal((await view(xp,xpAbi,"owner"))[0].toLowerCase(),safe.toString().toLowerCase());
 await reject(xp,xpAbi,"setVerifierRole",[stranger.address,2],addr(ownerWallets[0].address));
 await reject(xp,xpAbi,"setVerifierRole",[stranger.address,2],relayer);
});
const txData=xpAbi.encodeFunctionData("setVerifierRole",[stranger.address,2]);
const zero=ZeroAddress;
async function safeTxHash(data=txData){
 const nonce=(await view(safe,safeAbi,"nonce"))[0];
 return (await view(safe,safeAbi,"getTransactionHash",[
 xp.toString(),0,data,0,0,0,0,zero,zero,nonce]))[0];
}
function signHash(hash,signers){
 return "0x"+signers.map(w=>({address:w.address.toLowerCase(),signature:w.signingKey.sign(hash).serialized.slice(2)}))
 .sort((a,b)=>a.address.localeCompare(b.address)).map(x=>x.signature).join("");
}
async function execSafe(signatures,data=txData){
 const e=await execute(safe,safeAbi,"execTransaction",[
 xp.toString(),0,data,0,0,0,0,zero,zero,signatures
 ]);
 return e;
}
await check("One valid owner signature cannot satisfy Safe threshold",async()=>{
 const hash=await safeTxHash();
 const e=await execSafe(signHash(hash,[ownerWallets[0]]));
 assert.ok(e.exceptionError,"1-of-3 unexpectedly passed");
 assert.equal((await view(safe,safeAbi,"nonce"))[0],0n);
 assert.equal((await view(xp,xpAbi,"verifierRoles",[stranger.address]))[0],0n);
});
await check("One owner plus non-owner cannot satisfy Safe threshold",async()=>{
 const hash=await safeTxHash();
 const e=await execSafe(signHash(hash,[ownerWallets[0],stranger]));
 assert.ok(e.exceptionError,"Non-owner signature unexpectedly passed");
 assert.equal((await view(safe,safeAbi,"nonce"))[0],0n);
});
let savedSignatures;
await check("Two actual owners approve Safe execution of XP verifier role",async()=>{
 const hash=await safeTxHash();
 savedSignatures=signHash(hash,[ownerWallets[0],ownerWallets[1]]);
 const e=await execSafe(savedSignatures);
 if(e.exceptionError)throw Error("2-of-3 Safe tx reverted: "+e.exceptionError.error+" "+bytesToHex(e.returnValue));
 assert.equal(safeAbi.decodeFunctionResult("execTransaction",bytesToHex(e.returnValue))[0],true);
 assert.equal((await view(xp,xpAbi,"verifierRoles",[stranger.address]))[0],2n);
 assert.equal((await view(safe,safeAbi,"nonce"))[0],1n);
});
await check("Replay of old two-owner signatures fails after Safe nonce increments",async()=>{
 const e=await execSafe(savedSignatures);
 assert.ok(e.exceptionError,"Old signature replay unexpectedly passed");
 assert.equal((await view(safe,safeAbi,"nonce"))[0],1n);
 assert.equal((await view(xp,xpAbi,"verifierRoles",[stranger.address]))[0],2n);
});
await check("Two owners may also revoke verifier; one cannot",async()=>{
 const revoke=xpAbi.encodeFunctionData("setVerifierRole",[stranger.address,0]);
 const hash=await safeTxHash(revoke);
 await reject(safe,safeAbi,"execTransaction",[
 xp.toString(),0,revoke,0,0,0,0,zero,zero,signHash(hash,[ownerWallets[2]])]);
 const e=await execSafe(signHash(hash,[ownerWallets[1],ownerWallets[2]]),revoke);
 if(e.exceptionError)throw Error("revocation failed: "+e.exceptionError.error);
 assert.equal(safeAbi.decodeFunctionResult("execTransaction",bytesToHex(e.returnValue))[0],true);
 assert.equal((await view(xp,xpAbi,"verifierRoles",[stranger.address]))[0],0n);
 assert.equal((await view(safe,safeAbi,"nonce"))[0],2n);
});
assert.equal(passed,TOTAL);
console.log("✅ 8/8 ACTUAL SAFE 2-OF-3 AUTHORIZATION CHECKS PASS");
console.log("Scope: official Safe artifacts + local EthereumJS runCall; NOT outer signed tx, testnet, or audit.");
