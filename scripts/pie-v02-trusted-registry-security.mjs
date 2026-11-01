// GFLO Trusted XP Source Registry v0.2 — Termux EthereumJS security suite.
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
import {homedir} from "node:os";
import {join} from "node:path";
import {createVM} from "@ethereumjs/vm";
import {Common,Mainnet,Hardfork} from "@ethereumjs/common";
import {createAccount,createAddressFromString,hexToBytes,bytesToHex} from "@ethereumjs/util";
const repo=join(homedir(),"gflo-pie"),req=createRequire(join(repo,"package.json"));
const solc=req("solc"),{Interface,keccak256}=req("ethers");
const entries={
 core:["PIECoreV02.sol","PIECoreV02"],
 policy:["XPPolicyV02.sol","XPPolicyV02"],
 registry:["TrustedXPSourceRegistryV02.sol","TrustedXPSourceRegistryV02"],
 forged:["test/ForgedXPPolicyWithOwnerMock.sol","ForgedXPPolicyWithOwnerMock"]
};
const sources=Object.fromEntries(Object.values(entries).map(([file])=>[file,{
 content:execFileSync("git",["show","origin/feature/pie-core-v0.2:contracts/"+file],{cwd:repo,encoding:"utf8"})}]));
const out=JSON.parse(solc.compile(JSON.stringify({language:"Solidity",sources,settings:{
 optimizer:{enabled:true,runs:200},evmVersion:"cancun",
 outputSelection:{"*":{"*":["abi","evm.bytecode.object"]}}}})));
for(const e of out.errors??[])if(e.severity==="error")throw Error(e.formattedMessage);
const contract={},iface={};
for(const [k,[file,name]] of Object.entries(entries)){
 contract[k]=out.contracts[file][name];iface[k]=new Interface(contract[k].abi);
}
const vm=await createVM({common:new Common({chain:Mainnet,hardfork:Hardfork.Cancun})});
const a=x=>createAddressFromString("0x"+x.padStart(40,"0"));
const deployer=a("d1"),admin=a("01"),nextAdmin=a("02"),intruder=a("03"),alice=a("a1");
for(const p of [deployer,admin,nextAdmin,intruder,alice])
 await vm.stateManager.putAccount(p,createAccount({balance:10n**18n}));
async function deploy(k,args=[]){
 const data=hexToBytes("0x"+contract[k].evm.bytecode.object+iface[k].encodeDeploy(args).slice(2));
 const r=await vm.evm.runCall({caller:deployer,data,gasLimit:12000000n});
 return {address:r.createdAddress,exec:r.execResult};
}
async function invoke(k,address,fn,args=[],caller=alice){
 return (await vm.evm.runCall({caller,to:address,gasLimit:5000000n,
 data:hexToBytes(iface[k].encodeFunctionData(fn,args))})).execResult;
}
async function good(k,address,fn,args=[],caller=alice){
 const r=await invoke(k,address,fn,args,caller);
 if(r.exceptionError)throw Error(fn+": "+r.exceptionError.error);
 return iface[k].decodeFunctionResult(fn,bytesToHex(r.returnValue));
}
async function revert(k,address,fn,args,expected,caller=alice){
 const r=await invoke(k,address,fn,args,caller);
 assert.ok(r.exceptionError,fn+" did not revert");
 assert.equal(iface[k].parseError(bytesToHex(r.returnValue))?.name,expected,fn);
}
async function revertDeploy(k,args,expected){
 const r=await deploy(k,args);
 assert.ok(r.exec.exceptionError,"CREATE unexpectedly succeeded");
 assert.equal(iface[k].parseError(bytesToHex(r.exec.returnValue))?.name,expected);
}
async function deployed(k,args=[]){
 const r=await deploy(k,args);
 if(r.exec.exceptionError)throw Error(k+" constructor: "+r.exec.exceptionError.error);
 assert.ok(r.address);
 assert.ok((await vm.stateManager.getCode(r.address)).length>0);
 return r.address;
}
const hash=async x=>keccak256(bytesToHex(await vm.stateManager.getCode(x)));
let n=0;const TOTAL=12;
async function check(label,fn){await fn();console.log("✅ "+(++n)+"/"+TOTAL+" "+label);}
console.log("=== GFLO TRUSTED XP SOURCE REGISTRY — SECURITY ===");
console.log("solc:",solc.version());
const core=await deployed("core");
const other=await deployed("core");
const policy=await deployed("policy",[core.toString(),admin.toString()]);
const realHash=await hash(policy);
const forged=await deployed("forged",[core.toString(),admin.toString()]);
const forgedHash=await hash(forged);
const registry=await deployed("registry",[core.toString(),admin.toString()]);
await good("core",core,"createIdentity",[1],alice);
await check("Registry binds immutable PIE Core and governance",async()=>{
 assert.equal((await good("registry",registry,"pieCore"))[0].toLowerCase(),core.toString().toLowerCase());
 assert.equal((await good("registry",registry,"governance"))[0].toLowerCase(),admin.toString().toLowerCase());
});
await check("Initial reads fail closed while inactive",async()=>{
 await revert("registry",registry,"totalXP",[alice.toString()],"RegistryInactive");
});
await check("Registry constructor rejects missing Core and governance",async()=>{
 await revertDeploy("registry",["0x"+"00".repeat(20),admin.toString()],"InvalidContract");
 await revertDeploy("registry",[core.toString(),"0x"+"00".repeat(20)],"InvalidAddress");
});
await check("Unprivileged actor cannot propose policy",async()=>{
 await revert("registry",registry,"proposePolicy",[policy.toString(),realHash,admin.toString()],"NotGovernance",intruder);
});
await check("Incorrect hash rejected",async()=>{
 await revert("registry",registry,"proposePolicy",[policy.toString(),forgedHash,admin.toString()],"PolicyCodeHashMismatch",admin);
});
await check("Incorrect policy owner rejected",async()=>{
 await revert("registry",registry,"proposePolicy",[policy.toString(),realHash,intruder.toString()],"PolicyOwnerMismatch",admin);
});
await check("Incorrect Core linkage rejected",async()=>{
 const p=await deployed("policy",[other.toString(),admin.toString()]);
 await revert("registry",registry,"proposePolicy",[p.toString(),await hash(p),admin.toString()],"PolicyCoreMismatch",admin);
});
await check("Propose and activate cannot be performed by outsider",async()=>{
 await good("registry",registry,"proposePolicy",[policy.toString(),realHash,admin.toString()],admin);
 await revert("registry",registry,"activatePolicy",[],"NotGovernance",intruder);
 await good("registry",registry,"activatePolicy",[],admin);
});
await check("After activation, pause holds until governance unpauses",async()=>{
 await revert("registry",registry,"totalXP",[alice.toString()],"RegistryInactive");
 await revert("registry",registry,"setPaused",[false],"NotGovernance",intruder);
 await good("registry",registry,"setPaused",[false],admin);
 assert.equal((await good("registry",registry,"totalXP",[alice.toString()]))[0],25n);
});
await check("Active policy cannot be replaced",async()=>{
 await revert("registry",registry,"proposePolicy",[forged.toString(),forgedHash,admin.toString()],"PolicyAlreadyActivated",admin);
});
await check("Governance transfer requires nominated successor acceptance",async()=>{
 await good("registry",registry,"proposeGovernance",[nextAdmin.toString()],admin);
 await revert("registry",registry,"acceptGovernance",[],"NotPendingGovernance",intruder);
 await good("registry",registry,"acceptGovernance",[],nextAdmin);
 await revert("registry",registry,"setPaused",[true],"NotGovernance",admin);
 await good("registry",registry,"setPaused",[true],nextAdmin);
 await revert("registry",registry,"totalXP",[alice.toString()],"RegistryInactive");
});
await check("NEGATIVE CONTROL: malicious governance can approve forged code/hash",async()=>{
 const attackRegistry=await deployed("registry",[core.toString(),intruder.toString()]);
 await good("registry",attackRegistry,"proposePolicy",[forged.toString(),forgedHash,admin.toString()],intruder);
 await good("registry",attackRegistry,"activatePolicy",[],intruder);
 await good("registry",attackRegistry,"setPaused",[false],intruder);
 assert.equal((await good("registry",attackRegistry,"totalXP",[alice.toString()]))[0],65000n);
 console.log("⚠️ Malicious governance authorizes FORGED 65000 XP — approval trust root remains.");
});
assert.equal(n,TOTAL);
console.log("✅ 12/12 REGISTRY SECURITY SCENARIOS COMPLETED");
console.log("Limit: mock governance compromise works by design; no passkey, multisig, migration or audit.");
