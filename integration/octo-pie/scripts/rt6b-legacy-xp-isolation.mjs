// RED TEAM 6B: signed local EVM legacy GasFeeLoop -> fresh PIECore isolation.
// This is an executable regression reproducer, NOT a deployed/audited bridge.
// Run from ~/gflo-v02-evm (which supplies @ethereumjs packages and OZ):
// GFLO_LEGACY_DIR=~/GasFeeLoop- GFLO_PIE_DIR=~/gflo-pie-rt6a node ./rt6b-legacy-xp-isolation.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { createVM, runTx } from "@ethereumjs/vm";
import { createLegacyTx } from "@ethereumjs/tx";
import { createBlock } from "@ethereumjs/block";
import { Common, Mainnet, Hardfork } from "@ethereumjs/common";
import { createAccount, createAddressFromPrivateKey, createAddressFromString, hexToBytes, bytesToHex } from "@ethereumjs/util";

const home=homedir();
const legacyRoot=resolve(process.env.GFLO_LEGACY_DIR?.replace(/^~/,home) || resolve(home,"GasFeeLoop-"));
const pieRoot=resolve(process.env.GFLO_PIE_DIR?.replace(/^~/,home) || resolve(home,"gflo-pie-rt6a"));
const req=createRequire(resolve(home,"gflo-pie/package.json"));
const solc=req("solc");
const {Interface,getCreateAddress}=req("ethers");
const sources={
  "GasFeeLoop.sol":{content:readFileSync(resolve(legacyRoot,"contracts/GasFeeLoop.sol"),"utf8")},
  "PIECoreIgnitionV01.sol":{content:readFileSync(resolve(pieRoot,"contracts/PIECoreIgnitionV01.sol"),"utf8")},
  "TestERC20.sol":{content:`pragma solidity ^0.8.20;
  contract TestERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address=>uint256)) public allowance;
    constructor(address user) { balanceOf[user] = 1000 ether; }
    function approve(address spender,uint256 value) external returns(bool) { allowance[msg.sender][spender]=value; return true; }
    function transferFrom(address from,address to,uint256 value) external returns(bool) {
      require(allowance[from][msg.sender]>=value && balanceOf[from]>=value,"insufficient");
      allowance[from][msg.sender]-=value; balanceOf[from]-=value; balanceOf[to]+=value; return true;
    }
    function transfer(address to,uint256 value) external returns(bool) {
      require(balanceOf[msg.sender]>=value,"insufficient");
      balanceOf[msg.sender]-=value; balanceOf[to]+=value; return true;
    }
  }`}
};
const compiled=JSON.parse(solc.compile(JSON.stringify({
 language:"Solidity",sources,settings:{optimizer:{enabled:true,runs:200},evmVersion:"cancun",
 outputSelection:{"*":{"*":["abi","evm.bytecode.object"]}}}
})));
const errors=(compiled.errors||[]).filter(x=>x.severity==="error");
assert.equal(errors.length,0,errors.map(x=>x.formattedMessage).join("\n"));
const contracts={
 gas:compiled.contracts["GasFeeLoop.sol"].GasFeeLoop,
 core:compiled.contracts["PIECoreIgnitionV01.sol"].PIECoreIgnitionV01,
 token:compiled.contracts["TestERC20.sol"].TestERC20
};
const abi=Object.fromEntries(Object.entries(contracts).map(([k,v])=>[k,new Interface(v.abi)]));
const code=k=>"0x"+contracts[k].evm.bytecode.object;
const common=new Common({chain:Mainnet,hardfork:Hardfork.Cancun});
const vm=await createVM({common});
const privateKeys={deployer:hexToBytes("0x"+"a1".repeat(32)),alice:hexToBytes("0x"+"a4".repeat(32)),outsider:hexToBytes("0x"+"a3".repeat(32))};
const senders={};
for(const [name,key] of Object.entries(privateKeys)){
 const address=createAddressFromPrivateKey(key);
 senders[name]={key,address,nonce:0n};
 await vm.stateManager.putAccount(address,createAccount({balance:10n**22n}));
}
async function tx(who,to,data,expected){
 const s=senders[who],nonce=s.nonce;
 const signed=createLegacyTx({nonce,gasLimit:12_000_000n,gasPrice:2_000_000_000n,
  ...(to?{to}:{ }),data:hexToBytes(data)},{common}).sign(s.key);
 const block=createBlock({header:{timestamp:10000n,gasLimit:20_000_000n}},{common});
 const outcome=await runTx(vm,{tx:signed,block});
 assert.equal(Number(outcome.receipt.status),expected,who+" tx status");
 assert.ok(outcome.totalGasSpent>21_000n);
 s.nonce+=1n;
 return outcome;
}
async function deploy(who,k,args=[]){
 const s=senders[who];
 const address=getCreateAddress({from:s.address.toString(),nonce:s.nonce});
 await tx(who,null,code(k)+abi[k].encodeDeploy(args).slice(2),1);
 assert.ok((await vm.stateManager.getCode(createAddressFromString(address))).length>0);
 return address;
}
const send=(who,k,address,fn,args=[],expected=1)=>
 tx(who,address,abi[k].encodeFunctionData(fn,args),expected);
async function view(k,address,fn,args=[]){
 // Isolate read-only EVM calls from transaction account nonces and state.
 const viewer=createAddressFromString("0x"+"fe".repeat(20));
 await vm.stateManager.checkpoint();
 try {
  const result=(await vm.evm.runCall({
   caller:viewer,to:createAddressFromString(address),isStatic:true,
   gasLimit:1_000_000n,data:hexToBytes(abi[k].encodeFunctionData(fn,args))
  })).execResult;
  if(result.exceptionError)throw Error("view "+fn+" failed: "+result.exceptionError.error);
  return abi[k].decodeFunctionResult(fn,bytesToHex(result.returnValue))[0];
 } finally {
  await vm.stateManager.revert();
 }
}
const alice=senders.alice.address.toString();
const core=await deploy("deployer","core",[senders.deployer.address.toString()]);
const token=await deploy("deployer","token",[alice]);
const gas=await deploy("deployer","gas",[token,core]);
let n=0;
const check=(label)=>console.log("PASS "+(++n)+"/4 "+label);
await send("alice","core",core,"createIdentity",[1]);
assert.equal((await view("core",core,"getIdentity",[alice])).xp,25n);
check("PIE fresh identity starts with canonical 25 XP");
const amount=10n**18n;
await send("alice","token",token,"approve",[gas,amount]);
await send("alice","gas",gas,"stake",[amount]);
assert.equal(await view("gas",gas,"getStake",[alice]),amount);
check("legacy GFLO stake executes successfully");
const beforeXP=(await view("core",core,"getIdentity",[alice])).xp;
const beforeStake=await view("gas",gas,"getStake",[alice]);
// Snapshot only ABI-backed state present in the legacy variant actually compiled.
const beforeAccumulated=await view("gas",gas,"getAccumulatedXP",[alice]);
// Actual public Solidity mapping getter: epochXP(address,uint256). Timestamp is 10000 seconds, epoch=0.
const beforeEpoch=await view("gas",gas,"epochXP",[alice,10000n/604800n]);
const beforeAliceBalance=await view("token",token,"balanceOf",[alice]);
const beforePoolBalance=await view("token",token,"balanceOf",[gas]);
const rejectedOwner=await send("deployer","gas",gas,"rewardXP",[alice,amount],0);
assert.equal(rejectedOwner.receipt.logs.length,0,"reverted reward must emit no events");
assert.equal((await view("core",core,"getIdentity",[alice])).xp,beforeXP);
assert.equal(await view("gas",gas,"getStake",[alice]),beforeStake);
assert.equal(await view("gas",gas,"getAccumulatedXP",[alice]),beforeAccumulated);
assert.equal(await view("gas",gas,"epochXP",[alice,10000n/604800n]),beforeEpoch);
assert.equal(await view("token",token,"balanceOf",[alice]),beforeAliceBalance);
assert.equal(await view("token",token,"balanceOf",[gas]),beforePoolBalance);
check("legacy owner reward reverts against PIE without addXP and all state rolls back");
const rejectedOutsider=await send("outsider","gas",gas,"rewardXP",[alice,amount],0);
assert.equal(rejectedOutsider.receipt.logs.length,0);
assert.equal((await view("core",core,"getIdentity",[alice])).xp,25n);
assert.equal(await view("gas",gas,"getAccumulatedXP",[alice]),beforeAccumulated);
assert.equal(await view("gas",gas,"epochXP",[alice,10000n/604800n]),beforeEpoch);
check("unauthorized outsider cannot grant XP through legacy GasFeeLoop");
console.log("RED TEAM 6B: 4/4 signed local EVM checks. Legacy integration rejected; no external deployment.");
