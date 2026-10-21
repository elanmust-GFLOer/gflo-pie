"use strict";
const assert = require("node:assert/strict");
const {evaluate} = require("./rt519-oracle.cjs");
const ids=["M1_NO_ATTESTOR_SIGNATURE","M2_SKIP_VALID_XP_SUBTRACTION","M3_BYPASS_EFFECTIVE_TIER"];
const valid=[
 {code:"ERR_ASSERTION",operator:"strictEqual",actual:"1",expected:"0",message:"tx receipt status for verifier nonce 14"},
 {code:"ERR_ASSERTION",operator:"strictEqual",actual:"5025",expected:"3025",message:"Expected values to be strictly equal:"},
 {code:"ERR_ASSERTION",operator:"strictEqual",actual:"1",expected:"0",message:"tx receipt status for alice nonce 23"}
];
function sample(id,event,overrides={}) {
  const lines=["RT519_MUTATED_SOURCE="+id,"RT519_COMPILED_OK="+id,"RT519_TARGET_REACHED="+id];
  if(event)lines.push("RT519_ORACLE_EVENT="+JSON.stringify({...event,id}));
  return {stdout:lines.join("\n"),stderr:"",status:event?97:0,signal:null,error:null,...overrides};
}
let n=0;
function test(name,fn){fn();n++;console.log("✅ RT519_SELFTEST "+n+" "+name)}
for(let i=0;i<ids.length;i++){
 const id=ids[i],event=valid[i];
 test(id+" genuine wrong-direction security failure KILLED",()=>{
  assert.equal(evaluate(id,sample(id,event)).status,"KILLED");
 });
 test(id+" reverse assertion direction INVALID",()=>{
  assert.equal(evaluate(id,sample(id,{...event,actual:event.expected,expected:event.actual})).status,"INVALID");
 });
 test(id+" unrelated message INVALID",()=>{
  assert.equal(evaluate(id,sample(id,{...event,message:"Unexpected error after target: another transaction"})).status,"INVALID");
 });
 test(id+" generic TypeError INVALID",()=>{
  assert.equal(evaluate(id,sample(id,{...event,code:"TYPE_ERROR",message:"Cannot read property"})).status,"INVALID");
 });
 test(id+" compilation error INVALID",()=>{
  assert.equal(evaluate(id,sample(id,event,{stdout:"RT519_MUTATED_SOURCE="+id+"\nRT519_TARGET_REACHED="+id,status:97})).status,"INVALID");
 });
 test(id+" missing target marker INVALID",()=>{
  assert.equal(evaluate(id,sample(id,event,{stdout:"RT519_MUTATED_SOURCE="+id+"\nRT519_COMPILED_OK="+id+"\nRT519_ORACLE_EVENT="+JSON.stringify({...event,id}),status:97})).status,"INVALID");
 });
 test(id+" timeout INVALID",()=>{
  assert.equal(evaluate(id,sample(id,event,{error:new Error("ETIMEDOUT"),signal:"SIGTERM"})).status,"INVALID");
 });
 test(id+" clean completed mutant SURVIVED",()=>{
  assert.equal(evaluate(id,sample(id,null)).status,"SURVIVED");
 });
 test(id+" unexpected late assertion exit INVALID",()=>{
  assert.equal(evaluate(id,sample(id,null,{status:1,stderr:"AssertionError: unrelated after target"})).status,"INVALID");
 });
 test(id+" forged event wrong exit INVALID",()=>{
  assert.equal(evaluate(id,sample(id,event,{status:1})).status,"INVALID");
 });
 test(id+" wrong mutant identity INVALID",()=>{
  const r=sample(id,event);r.stdout=r.stdout.replace('"id":"'+id+'"','"id":"OTHER"');
  assert.equal(evaluate(id,r).status,"INVALID");
 });
}
for(let i=0;i<ids.length;i++){
 const id=ids[i],event=valid[i],e="RT519_ORACLE_EVENT="+JSON.stringify({...event,id});
 const src="RT519_MUTATED_SOURCE="+id,comp="RT519_COMPILED_OK="+id,target="RT519_TARGET_REACHED="+id;
 test(id+" fabricated event before markers INVALID",()=>{
  assert.equal(evaluate(id,sample(id,event,{stdout:[e,src,comp,target].join("\n")})).status,"INVALID");
 });
 test(id+" target before compile INVALID",()=>{
  assert.equal(evaluate(id,sample(id,event,{stdout:[src,target,comp,e].join("\n")})).status,"INVALID");
 });
 test(id+" event before target INVALID",()=>{
  assert.equal(evaluate(id,sample(id,event,{stdout:[src,comp,e,target].join("\n")})).status,"INVALID");
 });
 test(id+" event only stderr INVALID",()=>{
  assert.equal(evaluate(id,sample(id,event,{stdout:[src,comp,target].join("\n"),stderr:e})).status,"INVALID");
 });
 test(id+" matching event plus stderr TypeError INVALID",()=>{
  assert.equal(evaluate(id,sample(id,event,{stderr:"TypeError: unrelated failure"})).status,"INVALID");
 });
 test(id+" matching event followed by stdout TypeError INVALID",()=>{
  assert.equal(evaluate(id,sample(id,event,{stdout:[src,comp,target,e,"TypeError: post-oracle failure"].join("\n")})).status,"INVALID");
 });
 test(id+" unexpected stdout after target INVALID",()=>{
  assert.equal(evaluate(id,sample(id,event,{stdout:[src,comp,target,"Unrelated assertion",e].join("\n")})).status,"INVALID");
 });
 test(id+" duplicate marker INVALID",()=>{
  assert.equal(evaluate(id,sample(id,event,{stdout:[src,comp,comp,target,e].join("\n")})).status,"INVALID");
 });
 test(id+" foreign mutation marker INVALID",()=>{
  assert.equal(evaluate(id,sample(id,event,{stdout:[src,comp,target,"RT519_COMPILED_OK=FOREIGN",e].join("\n")})).status,"INVALID");
 });
 test(id+" missing source marker INVALID",()=>{
  assert.equal(evaluate(id,sample(id,event,{stdout:[comp,target,e].join("\n")})).status,"INVALID");
 });
}
assert.equal(n,63);
console.log("✅ 63/63 RT5-19 classifier self-tests PASS");
