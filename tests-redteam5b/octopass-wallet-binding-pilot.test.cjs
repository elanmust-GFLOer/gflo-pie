"use strict";
// Local red-team checks for PB01/PB02. No network, RPC, or production identity.
const assert=require("node:assert/strict");
const { Wallet }=require("ethers");
const { WalletBindingPilot }=require("./octopass-wallet-binding-pilot.cjs");
(async()=>{
let clock=1800000000000;
const wallet=Wallet.createRandom(), adversary=Wallet.createRandom();
const mk=(more={})=>new WalletBindingPilot({domain:"octopass.pilot.gflo",chainId:31337,now:()=>clock,...more});
let n=0;
async function check(name,fn){await fn();n++;console.log("PASS PB01/02 "+n+" "+name);}
const request=(v,who=wallet,profile="profile-A")=>v.issue({authenticatedProfile:profile,profileRef:profile,account:who.address,scopes:["pie:proof:submit"]});
const submit=async(v,challenge,signer=wallet,profile="profile-A")=>v.verify({authenticatedProfile:profile,nonce:challenge.nonce,signature:await signer.signMessage(challenge.message)});
await check("signed EOA consent binding succeeds only once",async()=>{
 const v=mk(),c=request(v),b=await submit(v,c);
 assert.equal(b.account,wallet.address); assert.equal(b.profileRef,"profile-A");
 assert.deepEqual(b.scopes,["pie:proof:submit"]);
 assert.equal(v.getActive({authenticatedProfile:"profile-A",chainId:31337}).id,b.id);
 assert.throws(()=>v.verify({authenticatedProfile:"profile-A",nonce:c.nonce,signature:"0x"}),/INVALID_OR_USED_NONCE/);
});
await check("untrusted client profile cannot request someone else's challenge",()=>{
 const v=mk();assert.throws(()=>v.issue({authenticatedProfile:"profile-B",profileRef:"profile-A",account:wallet.address,scopes:["pie:proof:submit"]}),/PROFILE_MISMATCH/);
});
await check("invalid wallet and scope are denied",()=>{
 const v=mk();assert.throws(()=>request(v,{address:"invalid"}),/INVALID_ACCOUNT/);
 assert.throws(()=>v.issue({authenticatedProfile:"profile-A",profileRef:"profile-A",account:wallet.address,scopes:["xp:mint"]}),/INVALID_SCOPES/);
});
await check("expired proof fails and cannot be reused",async()=>{
 const v=mk(),c=request(v);clock+=301000;
 await assert.rejects(submit(v,c),/CHALLENGE_EXPIRED/);
 clock-=301000;await assert.rejects(submit(v,c),/INVALID_OR_USED_NONCE/);
});
await check("wrong signer cannot bind wallet; nonce consumed",async()=>{
 const v=mk(),c=request(v);await assert.rejects(submit(v,c,adversary),/WRONG_WALLET/);
 await assert.rejects(submit(v,c,wallet),/INVALID_OR_USED_NONCE/);
});
await check("signature tamper fails without binding",async()=>{
 const v=mk(),c=request(v),s=await wallet.signMessage(c.message);
 assert.throws(()=>v.verify({authenticatedProfile:"profile-A",nonce:c.nonce,signature:s.slice(0,-2)+"zz"}),/INVALID_SIGNATURE/);
 assert.equal(v.getActive({authenticatedProfile:"profile-A",chainId:31337}),null);
});
await check("server domain mismatch denies copied signed message",async()=>{
 const a=mk(),b=mk({domain:"other.gflo"}),ca=request(a),cb=request(b);
 const s=await wallet.signMessage(ca.message);
 assert.throws(()=>b.verify({authenticatedProfile:"profile-A",nonce:cb.nonce,signature:s}),/WRONG_WALLET|INVALID_SIGNATURE/);
});
await check("chain mismatch denies a signature from other deployment",async()=>{
 const a=mk(),b=mk({chainId:1}),ca=request(a),cb=request(b);
 const s=await wallet.signMessage(ca.message);
 assert.throws(()=>b.verify({authenticatedProfile:"profile-A",nonce:cb.nonce,signature:s}),/WRONG_WALLET|INVALID_SIGNATURE/);
});
await check("different authenticated profile cannot redeem challenge",async()=>{
 const v=mk(),c=request(v);await assert.rejects(submit(v,c,wallet,"profile-B"),/PROFILE_MISMATCH/);
 assert.equal(v.getActive({authenticatedProfile:"profile-A",chainId:31337}),null);
});
await check("new proof cannot silently replace active binding",async()=>{
 const v=mk();await submit(v,request(v));
 await assert.rejects(submit(v,request(v,adversary),adversary),/ALREADY_BOUND/);
 assert.equal(v.getActive({authenticatedProfile:"profile-A",chainId:31337}).account,wallet.address);
});
await check("revocation is scoped to authenticated profile, permits fresh consent",async()=>{
 const v=mk();await submit(v,request(v));
 assert.throws(()=>v.revoke({authenticatedProfile:"profile-B",chainId:31337}),/NOT_ACTIVE/);
 assert.equal(v.revoke({authenticatedProfile:"profile-A",chainId:31337}),true);
 assert.equal(v.getActive({authenticatedProfile:"profile-A",chainId:31337}),null);
 assert.throws(()=>v.revoke({authenticatedProfile:"profile-A",chainId:31337}),/NOT_ACTIVE/);
 let b=await submit(v,request(v,adversary),adversary);assert.equal(b.account,adversary.address);
});
await check("nonce unique for independently issued challenges",()=>{
 const v=mk();assert.notEqual(request(v).nonce,request(v).nonce);
});
await check("wrong scope/profile typed challenge is not a grant",async()=>{
 const v=mk(),c=request(v);assert.match(c.message,/No XP or Tier is granted/);
 const b=await submit(v,c);assert.equal(Object.hasOwn(b,"canonicalXp"),false);
});
assert.equal(n,13);
console.log("✅ 13/13 OCTOPASS WALLET BINDING PILOT CHECKS PASS");
})().catch(e=>{console.error(e);process.exitCode=1});
