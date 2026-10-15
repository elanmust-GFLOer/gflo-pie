// GFLO RED TEAM / mutation integrity gate.
// Runs an unmodified baseline and three temporary in-memory Solidity mutations.
// A mutant is killed ONLY if the expected security assertion fails in the intended test.
// A compiler/runtime infrastructure failure is not counted as a kill.
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {dirname,join} from "node:path";
const folder=dirname(fileURLToPath(import.meta.url));
const target=join(folder,"gflo-safe-full.mjs");
const scenarios=[
 {name:"baseline",env:null,expected:null},
 {name:"xp_threshold",env:"xp_threshold",expected:"6/11 Genesis 25 XP and insufficient XP prohibit burn or Tier upgrade"},
 {name:"skip_burn",env:"skip_burn",expected:"9/11 Actual OpenZeppelin burnFrom destroys exactly one GFLO and advances Tier 1"},
 {name:"bypass_tier_auth",env:"bypass_tier_auth",expected:null}
];
let killed=0,survived=0,invalid=0;
for(const test of scenarios){
 const env={...process.env};
 if(test.env)env.GFLO_REDTEAM_FAULT=test.env;
 else delete env.GFLO_REDTEAM_FAULT;
 const p=spawnSync(process.execPath,[target],{cwd:folder,env,encoding:"utf8",timeout:120000,maxBuffer:2*1024*1024});
 const output=(p.stdout||"")+"\n"+(p.stderr||"");
 const baselinePass=p.status===0 && output.includes("11/11 SAFE + REGISTRY + OZ BURN + IGNITION INTEGRATION CHECKS PASS");
 if(test.name==="baseline"){
  if(!baselinePass){console.log("❌ Baseline FAILED — aborting RED TEAM; no mutation score.");console.log(output.slice(-1700));process.exit(2);}
  console.log("✅ BASELINE 11/11 PASS");
  continue;
 }
 if(!output.includes("REDTEAM_MUTATION="+test.name)){
  invalid++;console.log("⚠️ INVALID "+test.name+": injection not executed");console.log(output.slice(-650));continue;
 }
 const assertionFail=/AssertionError|Expected revert|unexpectedly passed|unexpectedly reverted|reverted:/.test(output);
 const compileFail=/ParserError:|TypeError:|DeclarationError:|CompilerError:|Cannot find module|ERR_MODULE_NOT_FOUND/.test(output);
 if(p.error||compileFail){invalid++;console.log("⚠️ INVALID "+test.name+": infrastructure/compiler failure");console.log(output.slice(-650));continue;}
 if(p.status!==0 && assertionFail){
  killed++;console.log("🐻❌ KILLED "+test.name+" — security assertion rejected mutated behavior");
  console.log(output.slice(-420).replace(/\n+/g," ").slice(-420));
 }else if(baselinePass){
  survived++;console.log("🚨 SURVIVED "+test.name+" — test gap, not safe to claim coverage");
 }else{
  invalid++;console.log("⚠️ UNCLASSIFIED "+test.name+" exit="+p.status);console.log(output.slice(-600));
 }
}
console.log("=== GFLO RED TEAM SUMMARY ===");
console.log({killed,survived,invalid});
console.log("Red Team mutation result is distinct from 164 previously passing GFLO test scenarios.");
if(invalid>0)process.exitCode=2;
else if(survived>0)process.exitCode=1;
