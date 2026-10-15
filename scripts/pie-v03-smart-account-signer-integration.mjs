// Termux / EthereumJS: real contract-to-contract smart-account signer integration.
// The signer mock authenticates a controller EOA; this is NOT WebAuthn.
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
import {join} from "node:path";
import {homedir} from "node:os";
import {createVM} from "@ethereumjs/vm";
import {Common,Mainnet,Hardfork} from "@ethereumjs/common";
import {createAccount,createAddressFromString,hexToBytes,bytesToHex} from "@ethereumjs/util";
const repo=join(homedir(),"gflo-pie"),req=createRequire(join(repo,"package.json"));
const solc=req("solc"),{Interface}=req("ethers");
const entries={
 core:["PIECoreV02.sol","PIECoreV02"],
 registry:["TrustedXPSourceRegistryV02.sol","TrustedXPSourceRegistryV02"],
 quorum:["GFLORegistryQuorumV03.sol","GFLORegistryQuorumV03"],
 smart:["test/GFLOSmartAccountSignerMockV03.sol","GFLOSmartAccountSignerMockV03"]
};
const sources=Object.fromEntries(Object.values(entries).map(([path])=>[path,{content:execFileSync("git",["show","origin/feature/pie-core-v0.2:contracts/"+path],{cwd:repo,encoding:"utf8"})}]));
const out=JSON.parse(solc.compile(JSON.stringify({language:"Solidity",sources,settings:{optimizer:{enabled:true,runs:200},evmVersion:"cancun",outputSelection:{"*":{"*":["abi","evm.bytecode.object"]}}}})));
for(const e of out.errors??[])if(e.severity==="error")throw Error(e.formattedMessage);
const abi={},bytecode={};
for(const [k,[p,n]] of Object.entries(entries)){const v=out.contracts[p][n];abi[k]=new Interface(v.abi);bytecode[k]=v.evm.bytecode.object;}
const vm=await createVM({common:new Common({chain:Mainnet,hardfork:Hardfork.Cancun})});
const addr=x=>createAddressFromString("0x"+x.padStart(40,"0"));
const deployer=addr("d1"),a=addr("a1"),b=addr("b1"),c=addr("c1"),controller=addr("99"),outsider=addr("ee"),init=addr("01");
for(const who of [deployer,a,b,c,controller,outsider,init])await vm.stateManager.putAccount(who,createAccount({balance:10n**18n}));
async function deploy(k,args=[]){
 const r=await vm.evm.runCall({caller:deployer,data:hexToBytes("0x"+bytecode[k]+abi[k].encodeDeploy(args).slice(2)),gasLimit:12000000n});
 if(r.execResult.exceptionError)throw Error("CREATE "+k+" "+r.execResult.exceptionError.error);
 assert.ok(r.createdAddress);assert.ok((await vm.stateManager.getCode(r.createdAddress)).length>0);return r.createdAddress;
}
async function raw(k,to,fn,args=[],caller=controller){
 return (await vm.evm.runCall({caller,to,data:hexToBytes(abi[k].encodeFunctionData(fn,args)),gasLimit:5000000n})).execResult;
}
async function good(k,to,fn,args=[],caller=controller){
 const r=await raw(k,to,fn,args,caller);if(r.exceptionError)throw Error(fn+": "+r.exceptionError.error);
 return abi[k].decodeFunctionResult(fn,bytesToHex(r.returnValue));
}
async function rejected(k,to,fn,args,error,caller=controller){
 const r=await raw(k,to,fn,args,caller);
 assert.ok(r.exceptionError,fn+" unexpectedly succeeded");
 if(error)assert.equal(abi[k].parseError(bytesToHex(r.returnValue))?.name,error);
}
let n=0;const N=9;
async function check(label,fn){await fn();console.log("✅ "+(++n)+"/"+N+" "+label);}
console.log("=== GFLO SMART ACCOUNT SIGNER — V0.3 INTEGRATION ===");
console.log("solc:",solc.version());
const core=await deploy("core");
const registry=await deploy("registry",[core.toString(),init.toString()]);
const quorum=await deploy("quorum",[registry.toString(),[a.toString(),b.toString(),c.toString()]]);
const smart=await deploy("smart",[controller.toString(),quorum.toString()]);
// Registry must explicitly nominate Quorum before Quorum can call setPaused().
await good("registry",registry,"proposeGovernance",[quorum.toString()],init);
await good("quorum",quorum,"acceptRegistryGovernance",[],a);
assert.equal((await good("registry",registry,"governance"))[0].toLowerCase(),quorum.toString().toLowerCase());
await check("Smart-account signer has pinned controller and quorum",async()=>{
 assert.equal((await good("smart",smart,"owner"))[0].toLowerCase(),controller.toString().toLowerCase());
 assert.equal((await good("smart",smart,"quorum"))[0].toLowerCase(),quorum.toString().toLowerCase());
});
await check("Unauthorized caller cannot forward governance operations",async()=>{
 await rejected("smart",smart,"forward",[abi.quorum.encodeFunctionData("approve",[1])],"NotOwner",outsider);
});
await check("Unsupported target selector is rejected by smart account",async()=>{
 await rejected("smart",smart,"forward",["0xdeadbeef"],"UnsupportedCall",controller);
});
await good("quorum",quorum,"proposeSignerReplacement",[c.toString(),smart.toString()],a);
await check("Single signer cannot install contract-account signer",async()=>{
 await rejected("quorum",quorum,"execute",[1],"NotEnoughApprovals",outsider);
 assert.equal((await good("quorum",quorum,"isSigner",[smart.toString()]))[0],false);
});
await good("quorum",quorum,"approve",[1],b);
await good("quorum",quorum,"execute",[1],outsider);
await check("2-of-3 rotation installs smart account and removes C",async()=>{
 assert.equal((await good("quorum",quorum,"isSigner",[smart.toString()]))[0],true);
 assert.equal((await good("quorum",quorum,"isSigner",[c.toString()]))[0],false);
 assert.equal((await good("quorum",quorum,"epoch"))[0],2n);
});
const action=abi.registry.encodeFunctionData("setPaused",[false]);
await check("Controller uses actual smart contract to create Quorum proposal",async()=>{
 const calldata=abi.quorum.encodeFunctionData("proposeRegistryCall",[action]);
 await good("smart",smart,"forward",[calldata],controller);
 assert.equal((await good("quorum",quorum,"proposalCount"))[0],2n);
 assert.equal((await good("quorum",quorum,"approvedBy",[2,smart.toString()]))[0],true);
 assert.equal((await good("quorum",quorum,"approvedBy",[2,controller.toString()]))[0],false);
});
await check("Smart account counts only one signer vote",async()=>{
 await rejected("quorum",quorum,"execute",[2],"NotEnoughApprovals",outsider);
 await rejected("smart",smart,"forward",[abi.quorum.encodeFunctionData("approve",[2])], "ForwardFailed",controller);
});
await check("Second independent signer approves and proposal executes",async()=>{
 await good("quorum",quorum,"approve",[2],a);
 await good("quorum",quorum,"execute",[2],outsider);
 assert.equal((await good("registry",registry,"paused"))[0],false);
});
await good("quorum",quorum,"proposeSignerReplacement",[smart.toString(),c.toString()],a);
await good("quorum",quorum,"approve",[3],b);
await good("quorum",quorum,"execute",[3],outsider);
await check("Revoked smart account cannot create a new Quorum proposal",async()=>{
 assert.equal((await good("quorum",quorum,"isSigner",[smart.toString()]))[0],false);
 await rejected("smart",smart,"forward",[abi.quorum.encodeFunctionData("proposeRegistryCall",[action])],"ForwardFailed",controller);
 assert.equal((await good("quorum",quorum,"epoch"))[0],3n);
});
assert.equal(n,N);
console.log("✅ 9/9 SMART ACCOUNT SIGNER INTEGRATION CHECKS PASS");
console.log("Limit: controller-owned mock, NOT passkey/WebAuthn, ERC-1271, or account abstraction.");
