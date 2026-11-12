// GFLO SEC-01 / SEC-02 regression candidate (ISOLATED, NOT EXECUTED HERE).
// Place this file at tests-redteam5b/pilot/sec01-sec02-regression.mjs in a
// pinned, isolated checkout of gflo-pie at 18b1ef168cae9eded38e8fa5998f1308627ab5ed.
// Uses the repository's existing EthereumJS / Safe fixture; no RPC or real keys.
// Baseline is expected to exhibit SEC-01. The candidate must reject SEC-01.
// Both baseline and SEC-01-only candidate retain SEC-02 exposure; this is an
// intentional, mandatory residual-risk test and NOT a secure outcome.
import assert from 'node:assert/strict';
import { id } from 'ethers';
import { createFixture } from './evm-fixture.mjs';

const mode = process.env.GFLO_TEST_MODE;
assert.ok(['baseline','sec01-candidate'].includes(mode),
  'Set GFLO_TEST_MODE=baseline or GFLO_TEST_MODE=sec01-candidate');
const patched = mode === 'sec01-candidate';
const checks = [];
// An oracle can correctly reproduce a vulnerability without passing the security gate.
// Exit 0: all oracles matched and no modeled security exposure remains.
// Exit 2: all oracles matched but a security exposure was reproduced (expected here).
// Exit 1: harness/assertion/runtime failure (standard unhandled error behavior).
const securityFindings = [];

async function initialize(ruleName = 'GFLO_SEC01_RULE') {
  const f = await createFixture();
  const rule = id(ruleName);
  await f.admin('core', f.core, 'bindIgnition', [f.ignition]);
  await f.admin('registry', f.registry, 'proposePolicy', [f.xp, await f.codeHash(f.xp), f.proxy]);
  await f.admin('registry', f.registry, 'activatePolicy');
  await f.admin('registry', f.registry, 'setPaused', [false]);
  await f.admin('xp', f.xp, 'registerRule', [rule, 100, 10]);
  await f.admin('xp', f.xp, 'setVerifierRole', [f.verifierAddress, 2]);
  await f.admin('xp', f.xp, 'setAttestor', [rule, f.attestor, true]);
  await f.send('alice', 'core', f.core, 'createIdentity', [2]);
  assert.equal(await f.read('registry', f.registry, 'totalXP', [f.account]), 25n);
  return { f, rule };
}

function makeProof(f, rule, label) {
  // issuedAt=0, validUntil=10 days. This is a synthetic fixture time window.
  return [f.account, rule, id(`${label}:event`), id(`${label}:evidence`), BigInt([...label].reduce((v, ch) => v * 131 + ch.charCodeAt(0), 0)), 0n, 864000n];
}

async function submit(f, proof) {
  const sig = await f.signProof(proof);
  const tx = await f.send('verifier', 'xp', f.xp, 'submit', [proof, f.attestor, sig]);
  return { claim: f.claimFromReceipt(tx), sig };
}

async function verifyNoXP(f) {
  assert.equal(await f.read('xp', f.xp, 'validEarnedXP', [f.account]), 0n);
  assert.equal(await f.read('registry', f.registry, 'totalXP', [f.account]), 25n);
  assert.equal(await f.read('gate', f.gate, 'effectiveTier', [f.account]), 0n);
}

async function check(name, fn) {
  await fn();
  checks.push(name);
  console.log('ORACLE_MATCH (' + mode + '): ' + name);
}

await check('B01 submitted PENDING -> remove attestor -> mature', async () => {
  const { f, rule } = await initialize('SEC01_B01');
  const { claim } = await submit(f, makeProof(f,rule,'B01'));
  await f.admin('xp',f.xp,'setAttestor',[rule,f.attestor,false]);
  f.atDay(3);
  if (patched) {
    await f.rejects('xp',f.xp,'finalize',[claim],'outsider','AttestorAuthorizationInvalidated');
    await verifyNoXP(f);
  } else {
    await f.send('outsider','xp',f.xp,'finalize',[claim]);
    assert.equal(await f.read('registry',f.registry,'totalXP',[f.account]),125n);
    securityFindings.push('SEC-01:B01:revoked-attestor-finalized');
    console.log('VULNERABILITY_REPRODUCED: B01 finalized after removal');
  }
});

await check('B02 submitted PENDING -> remove -> re-add -> mature', async () => {
  const { f, rule } = await initialize('SEC01_B02');
  const { claim } = await submit(f, makeProof(f,rule,'B02'));
  await f.admin('xp',f.xp,'setAttestor',[rule,f.attestor,false]);
  await f.admin('xp',f.xp,'setAttestor',[rule,f.attestor,true]);
  f.atDay(3);
  if (patched) {
    await f.rejects('xp',f.xp,'finalize',[claim],'outsider','AttestorAuthorizationInvalidated');
    await verifyNoXP(f);
  } else {
    await f.send('outsider','xp',f.xp,'finalize',[claim]);
    assert.equal(await f.read('registry',f.registry,'totalXP',[f.account]),125n);
    securityFindings.push('SEC-01:B02:removed-readmitted-attestor-finalized');
    console.log('VULNERABILITY_REPRODUCED: B02 finalized after remove/re-add');
  }
});

await check('B03 unaffected valid PENDING finalizes once at deadline', async () => {
  const {f,rule}=await initialize('SEC01_B03');
  const {claim}=await submit(f,makeProof(f,rule,'B03'));
  await f.rejects('xp',f.xp,'finalize',[claim],'outsider','TooEarly');
  f.atDay(3);
  await f.send('outsider','xp',f.xp,'finalize',[claim]);
  assert.equal(await f.read('registry',f.registry,'totalXP',[f.account]),125n);
  await f.rejects('xp',f.xp,'finalize',[claim],'outsider','BadGrantStatus');
});

await check('B05 same attestor, independent rules: revoke A does not block B', async () => {
  const {f,rule}=await initialize('SEC01_B05_A');
  const secondRule=id('SEC01_B05_B');
  await f.admin('xp',f.xp,'registerRule',[secondRule,100,10]);
  await f.admin('xp',f.xp,'setAttestor',[secondRule,f.attestor,true]);
  const a=(await submit(f,makeProof(f,rule,'B05_A'))).claim;
  const b=(await submit(f,makeProof(f,secondRule,'B05_B'))).claim;
  await f.admin('xp',f.xp,'setAttestor',[rule,f.attestor,false]);
  f.atDay(3);
  if (patched) {
    await f.rejects('xp',f.xp,'finalize',[a],'outsider','AttestorAuthorizationInvalidated');
  } else {
    await f.send('outsider','xp',f.xp,'finalize',[a]);
  }
  await f.send('outsider','xp',f.xp,'finalize',[b]);
  assert.equal(await f.read('registry',f.registry,'totalXP',[f.account]),patched?125n:225n);
});

await check('B06 repeated true -> true remains idempotent', async () => {
  const {f,rule}=await initialize('SEC01_B06');
  const {claim}=await submit(f,makeProof(f,rule,'B06'));
  let prior;
  if (patched) prior=await f.read('xp',f.xp,'attestorGeneration',[rule,f.attestor]);
  await f.admin('xp',f.xp,'setAttestor',[rule,f.attestor,true]);
  if (patched) assert.equal(await f.read('xp',f.xp,'attestorGeneration',[rule,f.attestor]),prior);
  f.atDay(3);
  await f.send('outsider','xp',f.xp,'finalize',[claim]);
  assert.equal(await f.read('registry',f.registry,'totalXP',[f.account]),125n);
});

await check('B12 spent event/evidence/nonce cannot be reused', async () => {
  const {f,rule}=await initialize('SEC01_B12');
  const proof=makeProof(f,rule,'B12');
  await submit(f,proof);
  await f.rejects('xp',f.xp,'submit',[proof,f.attestor,await f.signProof(proof)],'verifier','Replay');
  await verifyNoXP(f);
});

await check('B11 old UNSUBMITTED signature survives remove/re-add (SEC-02 RESIDUAL)', async () => {
  const {f,rule}=await initialize('SEC02_B11');
  const proof=makeProof(f,rule,'B11');
  const oldSignature=await f.signProof(proof);
  await f.admin('xp',f.xp,'setAttestor',[rule,f.attestor,false]);
  await f.admin('xp',f.xp,'setAttestor',[rule,f.attestor,true]);
  const accepted=await f.send('verifier','xp',f.xp,'submit',[proof,f.attestor,oldSignature]);
  const claim=f.claimFromReceipt(accepted);
  f.atDay(3);
  await f.send('outsider','xp',f.xp,'finalize',[claim]);
  assert.equal(await f.read('registry',f.registry,'totalXP',[f.account]),125n);
  securityFindings.push('SEC-02:B11:old-unsubmitted-signature-accepted');
  console.log('VULNERABILITY_REPRODUCED: SEC-02 old unsubmitted signature accepted.');
});

const result = {
  suite: 'GFLO-SEC01-SEC02',
  mode,
  oracleMatches: checks.length,
  implementedCases: ['B01','B02','B03','B05','B06','B11','B12'],
  securityGate: securityFindings.length ? 'BLOCKED' : 'NO_KNOWN_FINDINGS_IN_THIS_RUN',
  securityFindings,
  exitCode: securityFindings.length ? 2 : 0,
  scope: 'LOCAL_EVM_ONLY; no deployment approval; full B01-B15 matrix not implemented'
};
console.log('GFLO_SECURITY_RESULT=' + JSON.stringify(result));
process.exitCode = result.exitCode;
