// GFLO fixed-supply OpenZeppelin ERC20Burnable — 7 tests, native Termux.
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
import {homedir} from "node:os";
import {join} from "node:path";
import {createVM} from "@ethereumjs/vm";
import {Common,Mainnet,Hardfork} from "@ethereumjs/common";
import {createAccount,createAddressFromString,hexToBytes,bytesToHex} from "@ethereumjs/util";

const repo=join(homedir(),"gflo-pie");
const req=createRequire(join(repo,"package.json"));
const vmReq=createRequire(import.meta.url);
const solc=req("solc"),{Interface,parseUnits}=req("ethers");
let oz;
try { oz=vmReq.resolve("@openzeppelin/contracts/package.json"); }
catch {throw Error("Missing OpenZeppelin. Run: cd ~/gflo-v02-evm && npm install --save-exact @openzeppelin/contracts@5.4.0");}
const fs=await import("node:fs");
const path=await import("node:path");
const ozRoot=path.dirname(oz);
const file="GFLOFixedSupplyV01.sol";
const input=JSON.stringify({language:"Solidity",
 sources:{[file]:{content:execFileSync("git",["show","origin/feature/pie-core-v0.2:contracts/"+file],{cwd:repo,encoding:"utf8"})}},
 settings:{optimizer:{enabled:true,runs:200},evmVersion:"cancun",outputSelection:{"*":{"*":["abi","evm.bytecode.object"]}}}});
const compiled=JSON.parse(solc.compile(input,{import:(name)=>{
 try {
  const prefix="@openzeppelin/contracts/";
  if(!name.startsWith(prefix))return{error:"unexpected import "+name};
  const resolved=path.resolve(ozRoot,name.slice(prefix.length));
  if(!resolved.startsWith(ozRoot+path.sep))return{error:"unsafe import"};
  return{contents:fs.readFileSync(resolved,"utf8")};
 } catch(e){return{error:String(e)};}
}}));
for(const e of compiled.errors??[])if(e.severity==="error")throw Error(e.formattedMessage);
const artifact=compiled.contracts[file].GFLOFixedSupplyV01;
const abi=new Interface(artifact.abi);
const common=new Common({chain:Mainnet,hardfork:Hardfork.Cancun});
const vm=await createVM({common});
const addr=x=>createAddressFromString("0x"+x.padStart(40,"0"));
const deployer=addr("d1"),alice=addr("a1"),spender=addr("c1");
for(const a of [deployer,alice,spender])await vm.stateManager.putAccount(a,createAccount({balance:10n**18n}));
async function create(recipient,amount){
 const r=await vm.evm.runCall({caller:deployer,gasLimit:10000000n,data:hexToBytes("0x"+artifact.evm.bytecode.object+abi.encodeDeploy([recipient.toString(),amount]).slice(2))});
 return r;
}
async function invoke(contract,fn,args=[],from=alice){
 return (await vm.evm.runCall({caller:from,to:contract,gasLimit:3000000n,data:hexToBytes(abi.encodeFunctionData(fn,args))})).execResult;
}
async function ok(contract,fn,args=[],from=alice){
 const r=await invoke(contract,fn,args,from);if(r.exceptionError)throw Error(fn+" : "+r.exceptionError.error);
 return abi.decodeFunctionResult(fn,bytesToHex(r.returnValue));
}
async function fails(contract,fn,args=[],from=alice){assert.ok((await invoke(contract,fn,args,from)).exceptionError);}
let n=0;const TOTAL=7;
async function check(label,fn){await fn();console.log("✅ "+(++n)+"/"+TOTAL+" "+label);}
console.log("=== GFLO ERC20 BURNABLE — A–B–A TOKEN CHECK ===");
console.log("solc:",solc.version());
const units=parseUnits("1000",18);
const deployed=await create(alice,units);
if(deployed.execResult.exceptionError)throw Error("Deploy: "+deployed.execResult.exceptionError.error);
const token=deployed.createdAddress;
await check("OpenZeppelin token deployed and decimal precision 18",async()=>{
 assert.equal((await ok(token,"decimals"))[0],18n);
 assert.equal((await ok(token,"symbol"))[0],"GFLO");
});
await check("Single constructor allocation equals total supply",async()=>{
 assert.equal((await ok(token,"balanceOf",[alice.toString()]))[0],units);
 assert.equal((await ok(token,"totalSupply"))[0],units);
});
await check("No public mint function exists",async()=>{
 assert.equal(abi.fragments.some(x=>x.type==="function"&&x.name==="mint"),false);
});
await check("Insufficient allowance rejects burn with no supply delta",async()=>{
 await fails(token,"burnFrom",[alice.toString(),parseUnits("5",18)],spender);
 assert.equal((await ok(token,"totalSupply"))[0],units);
});
await check("Approval allocates exactly 5 GFLO to spender",async()=>{
 await ok(token,"approve",[spender.toString(),parseUnits("5",18)],alice);
 assert.equal((await ok(token,"allowance",[alice.toString(),spender.toString()]))[0],parseUnits("5",18));
});
await check("BurnFrom destroys 5 tokens and consumes allowance",async()=>{
 await ok(token,"burnFrom",[alice.toString(),parseUnits("5",18)],spender);
 assert.equal((await ok(token,"allowance",[alice.toString(),spender.toString()]))[0],0n);
 assert.equal((await ok(token,"totalSupply"))[0],parseUnits("995",18));
 assert.equal((await ok(token,"balanceOf",[alice.toString()]))[0],parseUnits("995",18));
});
await check("Zero-recipient and zero-supply constructors are rejected",async()=>{
 assert.ok((await create(addr("0"),100n)).execResult.exceptionError);
 assert.ok((await create(alice,0n)).execResult.exceptionError);
});
assert.equal(n,TOTAL);
console.log("✅ 7/7 GFLO ERC20 BURNABLE LOCAL CHECKS PASS");
console.log("Scope: OpenZeppelin dependency/local EVM token checks; not yet real Safe or Ignition integration.");
