// GFLO PIE v0.2 — canonical XP integration regression (Termux / EthereumJS).
// Existing Solidity contracts are unchanged; this tests their combined view.
// Requirements: @ethereumjs/vm, @ethereumjs/common, @ethereumjs/util in cwd,
// solc and ethers accessible from ~/gflo-pie.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import { createVM } from "@ethereumjs/vm";
import { Common, Hardfork, Mainnet } from "@ethereumjs/common";
import { createAccount, createAddressFromString, hexToBytes, bytesToHex } from "@ethereumjs/util";

const repo = join(homedir(), "gflo-pie");
const gflo = createRequire(join(repo, "package.json"));
const solc = gflo("solc");
const { Interface, id } = gflo("ethers");
const src = {};
for (const filename of ["PIECoreV02.sol", "XPPolicyV02.sol"]) {
  src[filename] = { content: execFileSync("git",
    ["show", `origin/feature/pie-core-v0.2:contracts/${filename}`],
    { cwd: repo, encoding: "utf8" }) };
}
const result = JSON.parse(solc.compile(JSON.stringify({
  language: "Solidity", sources: src,
  settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun",
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } },
})));
for (const e of result.errors ?? []) if (e.severity === "error") throw new Error(e.formattedMessage);
const compiled = {
  pie: result.contracts["PIECoreV02.sol"].PIECoreV02,
  xp: result.contracts["XPPolicyV02.sol"].XPPolicyV02,
};
const abi = Object.fromEntries(Object.entries(compiled).map(([k,v])=>[k,new Interface(v.abi)]));
const vm = await createVM({common:new Common({chain:Mainnet,hardfork:Hardfork.Cancun})});
const addr = x => createAddressFromString("0x"+x.padStart(40,"0"));
const deployPie=addr("d1"), deployXP=addr("d2"), owner=addr("01"),
  standard=addr("f1"), elevated=addr("f2"), alice=addr("a1"), bob=addr("b1"),
  outsider=addr("ee"), ghost=addr("ab");
for(const a of [deployPie,deployXP,owner,standard,elevated,alice,bob,outsider,ghost]){
  await vm.stateManager.putAccount(a,createAccount({balance:10n**18n}));
}
async function deploy(kind,caller,args=[]){
  const bytes=hexToBytes("0x"+compiled[kind].evm.bytecode.object+abi[kind].encodeDeploy(args).slice(2));
  const out=await vm.evm.runCall({caller,data:bytes,gasLimit:10000000n});
  if(out.execResult.exceptionError) throw out.execResult.exceptionError;
  assert.ok(out.createdAddress);
  assert.ok((await vm.stateManager.getCode(out.createdAddress)).length>0);
  return out.createdAddress;
}
async function call(kind,to,method,args=[],caller=alice){
  const data=hexToBytes(abi[kind].encodeFunctionData(method,args));
  return (await vm.evm.runCall({to,caller,data,gasLimit:4000000n})).execResult;
}
async function good(kind,to,method,args=[],caller=alice){
  const r=await call(kind,to,method,args,caller);
  if(r.exceptionError) throw r.exceptionError;
  return r;
}
async function read(kind,to,method,args=[],caller=alice){
  const r=await good(kind,to,method,args,caller);
  return abi[kind].decodeFunctionResult(method,bytesToHex(r.returnValue));
}
async function fails(kind,to,method,args,why,caller=alice){
  const r=await call(kind,to,method,args,caller);
  assert.ok(r.exceptionError,`Expected ${why}`);
  assert.equal(abi[kind].parseError(bytesToHex(r.returnValue))?.name,why);
}
let n=0;
async function check(label,fn){await fn();console.log(`✅ ${++n}/12 ${label}`);}
const pie=await deploy("pie",deployPie);
const xp=await deploy("xp",deployXP,[pie.toString(),owner.toString()]);
const activity=id("GFLO_INTEGRATION_25"), merit=id("GFLO_INTEGRATION_500"),
  milestone=id("GFLO_INTEGRATION_1000");
let seq=0;
function claim(user,rule){seq++;return [user.toString(),rule,id("integration-event-"+seq),id("integration-proof-"+seq)];}
const balance=async a=>(await read("xp",xp,"totalXP",[a.toString()]))[0];
const earned=async a=>(await read("xp",xp,"earnedXP",[a.toString()]))[0];
const identity=async a=>(await read("pie",pie,"getIdentity",[a.toString()]))[0];
console.log("=== GFLO PIE + XP POLICY — CANONICAL XP INTEGRATION ===");
console.log("Compiler:",solc.version());

await check("Contracts created and XP Policy points to PIE Core",async()=>{
  assert.equal((await read("xp",xp,"pie"))[0].toLowerCase(),pie.toString().toLowerCase());
});
await check("Before Genesis: canonical total XP is zero",async()=>{
  assert.equal(await balance(alice),0n);assert.equal(await balance(ghost),0n);
});
await good("pie",pie,"createIdentity",[3],alice);
await good("pie",pie,"createIdentity",[1],bob);
await check("Genesis: independent wallet totals equal 25",async()=>{
  assert.equal(await balance(alice),25n);assert.equal(await balance(bob),25n);
});
await good("xp",xp,"setVerifierRole",[standard.toString(),1],owner);
await good("xp",xp,"setVerifierRole",[elevated.toString(),2],owner);
await good("xp",xp,"registerRule",[activity,25,20,0],owner);
await good("xp",xp,"registerRule",[merit,500,20,0],owner);
await good("xp",xp,"registerRule",[milestone,1000,20,0],owner);
await check("Unauthorized XP cannot change canonical total",async()=>{
  await fails("xp",xp,"awardXP",claim(alice,activity),"NotAuthorizedVerifier",outsider);
  assert.equal(await balance(alice),25n);
});
const a1=claim(alice,merit);
await check("500 verified XP yields canonical total 525",async()=>{
  await good("xp",xp,"awardXP",a1,elevated);
  assert.equal(await earned(alice),500n);assert.equal(await balance(alice),525n);
});
await check("Replay attack cannot double-credit 500 XP",async()=>{
  await fails("xp",xp,"awardXP",a1,"DuplicateEvent",elevated);
  assert.equal(await balance(alice),525n);
});
await check("Other wallet's XP remains isolated",async()=>{
  assert.equal(await earned(bob),0n);assert.equal(await balance(bob),25n);
});
await check("Selected Path may change, earned XP stays unchanged",async()=>{
  await good("pie",pie,"setSelectedPath",[2],alice);
  assert.equal((await identity(alice))[2],2n);
  assert.equal(await balance(alice),525n);
});
await check("Reaching 1000+ XP does not automatically advance Tier",async()=>{
  await good("xp",xp,"awardXP",claim(alice,milestone),elevated);
  assert.equal(await balance(alice),1525n);
  assert.equal((await identity(alice))[3],0n);
  assert.equal((await read("pie",pie,"getCurrentPath",[alice.toString()]))[0],1n);
});
await check("Daily limit failure leaves balance, counter and evidence reusable",async()=>{
  const pending=claim(alice,activity);
  await fails("xp",xp,"awardXP",pending,"DailyLimitReached",standard);
  assert.equal(await balance(alice),1525n);
  assert.equal(await earned(alice),1500n);
  const hash = gflo("ethers").keccak256(
    gflo("ethers").AbiCoder.defaultAbiCoder().encode(
      ["uint256","address","bytes32"],[1n,xp.toString(),pending[2]]
    )
  );
  assert.equal((await read("xp",xp,"usedEventIds",[hash]))[0],false);
});
await check("Invalid identity cannot receive a positive XP award",async()=>{
  await fails("xp",xp,"awardXP",claim(ghost,activity),"IdentityRequired",standard);
  assert.equal(await balance(ghost),0n);
});
await check("Core Genesis XP stays 25 even when canonical XP is 1525",async()=>{
  assert.equal((await identity(alice))[1],25n);
  assert.equal((await identity(alice))[3],0n);
  assert.equal(await balance(alice),1525n);
});
assert.equal(n,12);
console.log("✅ 12/12 CANONICAL XP INTEGRATION CHECKS PASS");
console.log("Scope: current two-ledger aggregate; no Core storage migration or real-token Ignition.");
