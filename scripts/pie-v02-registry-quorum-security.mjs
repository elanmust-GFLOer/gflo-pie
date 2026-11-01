import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
import {join} from "node:path";
import {homedir} from "node:os";
import {createVM} from "@ethereumjs/vm";
import {Common,Mainnet,Hardfork} from "@ethereumjs/common";
import {createAccount,createAddressFromString,hexToBytes,bytesToHex} from "@ethereumjs/util";
const repo=join(homedir(),"gflo-pie"),req=createRequire(join(repo,"package.json"));
const solc=req("solc"),{Interface,keccak256}=req("ethers");
const entries={core:"PIECoreV02",policy:"XPPolicyV02",registry:"TrustedXPSourceRegistryV02",quorum:"GFLORegistryQuorumV02"};
const src=Object.fromEntries(Object.values(entries).map(name=>[name+".sol",{content:execFileSync("git",["show","origin/feature/pie-core-v0.2:contracts/"+name+".sol"],{cwd:repo,encoding:"utf8"})}]));
const output=JSON.parse(solc.compile(JSON.stringify({language:"Solidity",sources:src,settings:{optimizer:{enabled:true,runs:200},evmVersion:"cancun",outputSelection:{"*":{"*":["abi","evm.bytecode.object"]}}}})));
for(const x of output.errors??[])if(x.severity==="error")throw Error(x.formattedMessage);
const abis={},bytecodes={};for(const [k,name]of Object.entries(entries)){const c=output.contracts[name+".sol"][name];abis[k]=new Interface(c.abi);bytecodes[k]=c.evm.bytecode.object;}
const vm=await createVM({common:new Common({chain:Mainnet,hardfork:Hardfork.Cancun})});
const addr=x=>createAddressFromString("0x"+x.padStart(40,"0"));
const d=addr("d1"),a=addr("a1"),b=addr("b1"),c=addr("c1"),outsider=addr("ee"),user=addr("99"),initial=addr("01");
for(const who of [d,a,b,c,outsider,user,initial])await vm.stateManager.putAccount(who,createAccount({balance:10n**18n}));
async function deploy(kind,args=[]){
 const data=hexToBytes("0x"+bytecodes[kind]+abis[kind].encodeDeploy(args).slice(2));
 const r=await vm.evm.runCall({caller:d,data,gasLimit:12000000n});
 if(r.execResult.exceptionError)throw Error(kind+" constructor: "+r.execResult.exceptionError.error);
 assert.ok(r.createdAddress);return r.createdAddress;
}
async function invoke(kind,to,fn,args=[],caller=user){
 return (await vm.evm.runCall({caller,to,data:hexToBytes(abis[kind].encodeFunctionData(fn,args)),gasLimit:5000000n})).execResult;
}
async function ok(kind,to,fn,args=[],caller=user){
 const r=await invoke(kind,to,fn,args,caller);if(r.exceptionError)throw Error(fn+": "+r.exceptionError.error);
 return abis[kind].decodeFunctionResult(fn,bytesToHex(r.returnValue));
}
async function denied(kind,to,fn,args,error,caller=user){
 const r=await invoke(kind,to,fn,args,caller);assert.ok(r.exceptionError,fn+" should revert");
 assert.equal(abis[kind].parseError(bytesToHex(r.returnValue))?.name,error);
}
let n=0;const N=10;
async function test(msg,fn){await fn();console.log("✅ "+(++n)+"/"+N+" "+msg);}
console.log("=== GFLO REGISTRY QUORUM 2-OF-3 — SECURITY ===");
console.log("solc:",solc.version());
const core=await deploy("core"),policy=await deploy("policy",[core.toString(),initial.toString()]);
const registry=await deploy("registry",[core.toString(),initial.toString()]);
const quorum=await deploy("quorum",[registry.toString(),[a.toString(),b.toString(),c.toString()]]);
const codehash=keccak256(bytesToHex(await vm.stateManager.getCode(policy)));
await ok("core",core,"createIdentity",[1],user);
await test("Three distinct members and threshold 2 initialized",async()=>{
 assert.equal((await ok("quorum",quorum,"THRESHOLD"))[0],2n);
 for(const s of [a,b,c])assert.equal((await ok("quorum",quorum,"isSigner",[s.toString()]))[0],true);
});
await test("Outsider cannot propose, approve or handoff",async()=>{
 await denied("quorum",quorum,"propose",["0x12345678"],"NotSigner",outsider);
 await denied("quorum",quorum,"acceptRegistryGovernance",[],"NotSigner",outsider);
});
await test("Governance transfer requires original nomination",async()=>{
 // Cross-contract revert payload may not be propagated by this direct VM harness.
 // Assert the call fails AND the Registry governance remains unchanged.
 const premature=await invoke("quorum",quorum,"acceptRegistryGovernance",[],a);
 assert.ok(premature.exceptionError,"Premature governance acceptance must revert");
 assert.equal((await ok("registry",registry,"governance"))[0].toLowerCase(),initial.toString().toLowerCase());
 await ok("registry",registry,"proposeGovernance",[quorum.toString()],initial);
 await ok("quorum",quorum,"acceptRegistryGovernance",[],a);
 assert.equal((await ok("registry",registry,"governance"))[0].toLowerCase(),quorum.toString().toLowerCase());
});
await test("Unknown selector blocked",async()=>{
 await denied("quorum",quorum,"propose",["0xdeadbeef"],"InvalidAction",a);
});
const propose=abis.registry.encodeFunctionData("proposePolicy",[policy.toString(),codehash,initial.toString()]);
await ok("quorum",quorum,"propose",[propose],a);
await test("Proposer auto-approved but one signer cannot execute",async()=>{
 await denied("quorum",quorum,"execute",[1],"NotEnoughApprovals",outsider);
 await denied("quorum",quorum,"approve",[1],"AlreadyApproved",a);
});
await test("Outsider approval rejected",async()=>{
 await denied("quorum",quorum,"approve",[1],"NotSigner",outsider);
});
await test("Second signer approves and any caller may execute",async()=>{
 await ok("quorum",quorum,"approve",[1],b);
 await ok("quorum",quorum,"execute",[1],outsider);
 assert.equal((await ok("registry",registry,"proposedSource"))[0].toLowerCase(),policy.toString().toLowerCase());
});
await test("Proposal cannot be replayed",async()=>{
 await denied("quorum",quorum,"execute",[1],"AlreadyExecuted",outsider);
 await denied("quorum",quorum,"approve",[1],"AlreadyExecuted",c);
});
const activate=abis.registry.encodeFunctionData("activatePolicy",[]);
await ok("quorum",quorum,"propose",[activate],a);
await ok("quorum",quorum,"approve",[2],c);
await ok("quorum",quorum,"execute",[2],user);
await test("Approved activation leaves XP reads paused",async()=>{
 await denied("registry",registry,"totalXP",[user.toString()],"RegistryInactive",user);
});
const unpause=abis.registry.encodeFunctionData("setPaused",[false]);
await ok("quorum",quorum,"propose",[unpause],b);
await ok("quorum",quorum,"approve",[3],c);
await ok("quorum",quorum,"execute",[3],user);
await test("Quorum unpauses and canonical Genesis 25 XP reads",async()=>{
 assert.equal((await ok("registry",registry,"totalXP",[user.toString()]))[0],25n);
});
assert.equal(n,N);
console.log("✅ 10/10 QUORUM INTEGRATION SCENARIOS COMPLETED");
console.log("Pilot: fixed signers, no passkey verification, no rotation/recovery, no independent code audit.");
