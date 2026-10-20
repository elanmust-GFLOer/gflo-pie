// RT5-19: compile VALID isolated Solidity mutants, then require a targeted oracle to kill each.
// Never edit checked-in contracts, assertions, or the unchanged 5B1/5B2 runners.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const {spawnSync} = require("node:child_process");
const {evaluate} = require("./rt519-oracle.cjs");
const root = path.resolve(__dirname, "..");
const gen = path.resolve(__dirname, ".generated");
const out = path.resolve(__dirname, "evidence", "rt519");
fs.mkdirSync(out, {recursive:true});
const sha256 = data => crypto.createHash("sha256").update(data).digest("hex");
const expectedCases = [
  {
    id: "M1_NO_ATTESTOR_SIGNATURE", runner:"rt5b1.mjs", target:"XPPolicyV03.sol",
    from:"if(!SignatureChecker.isValidSignatureNow(attestor,digest,signature)) revert InvalidProof();",
    to:"/* MUTATION M1: deliberately bypass evidence signature check */",
    stage:'await rejected("xp",xp,"submit",[proof,attestor,falseSig],"verifier");',
    expected:/tx receipt status for verifier nonce [0-9]+/,
    expectedSummary:"authorized attestor, valid recipient/rule/time; invalid signature must revert",
    expectedMutatedSourceEffect:"unauthorized evidence signature now creates a successful claim"
  },
  {
    id:"M2_SKIP_VALID_XP_SUBTRACTION",runner:"rt5c.mjs",target:"XPPolicyV03.sol",
    from:"if(grant.status==Status.VALID) validEarnedXP[grant.recipient]-=grant.amount;",
    // Fault injection is restricted to Praxis rewards, so earlier unrelated baseline
    // revocation remains healthy and the 5025 -> 3025 oracle is reached.
    to:'if(grant.status==Status.VALID && grant.ruleId != keccak256(bytes("RT5B2_PRAxis_1000"))) validEarnedXP[grant.recipient]-=grant.amount;',
    stage:'assert.equal(await read("registry",registry,"totalXP",[account]),3025n);',
    expected:/actual:\s*5025n,\s*expected:\s*3025n/i,
    expectedSummary:"two finalized Praxis claims revoked: canonical XP must fall 5025 to 3025",
    expectedMutatedSourceEffect:"revoking Praxis XP fails to deduct validEarnedXP"
  },
  {
    id:"M3_BYPASS_EFFECTIVE_TIER",runner:"rt5c.mjs",target:"RT5B2Consumer.sol",
    from:"gate.requireEffectiveTier(msg.sender,2);",
    // Privilege gate bypasses only repeat uses (the first legitimate Tier-2 access
    // warms the consumer); this reaches the policy-only pause oracle.
    to:"if (uses[msg.sender] == 0) gate.requireEffectiveTier(msg.sender,2);",
    stage:'await denyConsumer("policy stop",abi.xp.getError("Paused").selector);',
    expected:/tx receipt status for alice nonce [0-9]+/,
    expectedSummary:"previously successful Tier-2 consumer use cannot bypass a later policy pause",
    expectedMutatedSourceEffect:"warm consumer silently skips effectiveTier verification"
  }
];
const compiledNeedle='for(const e of compiled.errors??[])if(e.severity==="error")throw Error(e.formattedMessage);';
const injectionNeedle="const compiled=JSON.parse(solc.compile(";
const report = {gate:"RT5-19",method:"compile-valid-targeted-kill",baseline:"rt5b1 and rt5c must pass independently first", cases:[]};
let failure=false;
for(const tc of expectedCases){
  const runnerPath=path.join(gen,tc.runner);
  let originalRunner=fs.readFileSync(runnerPath,"utf8");
  let originalSol;
  if(tc.target==="RT5B2Consumer.sol"){
    const match=originalRunner.match(/sources\["RT5B2Consumer\.sol"\]=\{content:`([\s\S]*?)`\};/);
    if(!match)throw Error(tc.id+": missing inline consumer fixture (INVALID)");
    originalSol=match[1];
  }else originalSol=fs.readFileSync(path.join(root,"contracts",tc.target),"utf8");
  if(originalSol.split(tc.from).length!==2)throw Error(tc.id+": contract mutation anchor not unique (INVALID)");
  const mutatedSol=originalSol.replace(tc.from,tc.to);
  const mutationsPath=path.join(out,tc.id+".mutated.sol");
  fs.writeFileSync(mutationsPath,mutatedSol);
  if(originalRunner.split(injectionNeedle).length!==2 ||
     originalRunner.split(compiledNeedle).length!==2 ||
     originalRunner.split(tc.stage).length!==2)throw Error(tc.id+": runner oracle/compile anchors not unique (INVALID)");
  const injection=[
    "const __rt519_source=sources["+JSON.stringify(tc.target)+"].content;",
    "if(__rt519_source.split("+JSON.stringify(tc.from)+").length!==2)throw Error('RT519_INVALID_MUTATION_ANCHOR');",
    "sources["+JSON.stringify(tc.target)+"].content=__rt519_source.replace("+JSON.stringify(tc.from)+","+JSON.stringify(tc.to)+");",
    "console.log('RT519_MUTATED_SOURCE="+tc.id+"');"
  ].join("\n")+"\n";
  let mutantRunner=originalRunner.replace(injectionNeedle,injection+injectionNeedle);
  mutantRunner=mutantRunner.replace(compiledNeedle,compiledNeedle+"\nconsole.log('RT519_COMPILED_OK="+tc.id+"');");
  const wrappedStage=[
    "console.log('RT519_TARGET_REACHED="+tc.id+"');",
    "try { "+tc.stage+" } catch (__rt519_error) {",
    "const __rt519_event = {id:"+JSON.stringify(tc.id)+", code:__rt519_error.code, operator:__rt519_error.operator,",
    "actual:typeof __rt519_error.actual === 'bigint' ? __rt519_error.actual.toString() : String(__rt519_error.actual),",
    "expected:typeof __rt519_error.expected === 'bigint' ? __rt519_error.expected.toString() : String(__rt519_error.expected),",
    "message:__rt519_error.message};",
    "console.log('RT519_ORACLE_EVENT='+JSON.stringify(__rt519_event));",
    "process.exit(97);",
    "}"
  ].join("\n");
  mutantRunner=mutantRunner.replace(tc.stage,wrappedStage);
  const dst=path.join(gen,"rt519-"+tc.id+".mjs");
  fs.writeFileSync(dst,mutantRunner);
  const executed=spawnSync(process.execPath,[dst],{
    cwd:__dirname,encoding:"utf8",timeout:120000,maxBuffer:5*1024*1024,
    env:{...process.env,FORCE_COLOR:"0"}
  });
  const output=(executed.stdout||"")+"\n"+(executed.stderr||"");
  fs.writeFileSync(path.join(out,tc.id+".log"),output);
  const evaluated=evaluate(tc.id,{status:executed.status,signal:executed.signal,
    error:executed.error,stdout:executed.stdout,stderr:executed.stderr});
  const {status,compiled:compilerOK,reached:targetReached,matching:assertion}=evaluated;
  if(status!=="KILLED")console.log("RT519_DEBUG "+tc.id+" "+JSON.stringify({evaluated,oracleLines:output.split(/\\r?\\n/).filter(x=>x.includes("RT519_ORACLE_EVENT=")),tail:output.slice(-1100)}));
  const record={
    id:tc.id,status,exitCode:executed.status,compilerOK,targetReached,
    expectedOracleFailure:assertion,oracleEvidence:evaluated.oracle,expectedSummary:tc.expectedSummary,
    expectedMutatedSourceEffect:tc.expectedMutatedSourceEffect,
    originalSolSHA256:sha256(originalSol),mutatedSolSHA256:sha256(mutatedSol),
    originalRunnerSHA256:sha256(originalRunner),mutantRunnerSHA256:sha256(mutantRunner),
    originalRunner:tc.runner,mutatedSourceFile:tc.id+".mutated.sol",logFile:tc.id+".log",
    executionError:executed.error?String(executed.error):null
  };
  report.cases.push(record);
  console.log(status+" "+tc.id+" compiler="+compilerOK+" targeted_oracle="+targetReached+" assert="+assertion+" status="+executed.status);
  if(status!=="KILLED")failure=true;
}
report.summary={killed:report.cases.filter(x=>x.status==="KILLED").length,
 survived:report.cases.filter(x=>x.status==="SURVIVED").length,
 invalid:report.cases.filter(x=>x.status==="INVALID").length};
fs.writeFileSync(path.join(out,"report.json"),JSON.stringify(report,null,2)+"\n");
console.log("RT5-19 SUMMARY "+JSON.stringify(report.summary));
if(failure)process.exitCode=1;
