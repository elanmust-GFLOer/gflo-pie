// RED TEAM 6A: static interface/semantic compatibility regression checks.
// Run from this repo: GFLO_LEGACY_DIR=../GasFeeLoop- GFLO_PIE_DIR=../gflo-pie node --test tests/rt6a-compat.test.mjs
// Checks repository source; NOT signed EVM execution, proof authenticity or deployment safety.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const legacyDir = process.env.GFLO_LEGACY_DIR;
const pieDir = process.env.GFLO_PIE_DIR;
if (!legacyDir || !pieDir) {
  throw new Error('Set GFLO_LEGACY_DIR and GFLO_PIE_DIR to checked-out source repositories (PIE feature/pie-core-v0.2).');
}
const read = (dir, name) => readFileSync(resolve(dir, name), 'utf8');
const gas = read(legacyDir, 'contracts/GasFeeLoop.sol');
const core = read(pieDir, 'contracts/PIECoreIgnitionV01.sol');
const policy = read(pieDir, 'contracts/XPPolicyV03.sol');
const gate = read(pieDir, 'contracts/EffectiveTierGateV01.sol');

test('RT6A-01 legacy assumes addXP; fresh PIECore does not implement it', () => {
  assert.match(gas, /function\s+addXP\s*\(\s*address\s+user\s*,\s*uint256\s+amount\s*\)\s*external/);
  assert.match(gas, /pieCore\.addXP\s*\(/);
  assert.doesNotMatch(core, /function\s+addXP\s*\(/);
});
test('RT6A-02 stake-dependent canonical XP is forbidden by ADR-0001', () => {
  assert.match(gas, /function\s+_calculateMultiplier\s*\(/);
  // Legacy commits use either stakeAmount or the scaled s local; both derive from actual stake.
  assert.match(gas, /(?:stakeAmount\s*=\s*stakes\[user\]\.amount|uint256\s+s\s*=\s*stakes\[user\]\.amount\s*\/\s*PRECISION)/);
  // Historical revision omits parentheses around the baseAmount * multiplier product.
  assert.match(gas, /rawXP\s*=\s*(?:\(\s*)?baseAmount\s*\*\s*multiplier/);
  // Variable name changed from capped to cappedXP, but both pass computed XP into PIE.
  assert.match(gas, /pieCore\.addXP\(user,\s*(?:capped|cappedXP)\s*\)/);
});
test('RT6A-03 legacy 18-decimal XP differs from PIE integer award types', () => {
  assert.match(gas, /EPOCH_XP_CAP\s*=\s*1000\s*\*\s*10\s*\*\s*\*\s*18/);
  assert.match(policy, /struct\s+Rule\s*\{\s*uint16\s+amount/);
  assert.match(policy, /mapping\(address\s*=>\s*uint64\)\s+public\s+validEarnedXP/);
});
test('RT6A-04 proof writer must require source signature and verifier', () => {
  assert.match(policy, /verifierRoles\[msg\.sender\]/);
  assert.match(policy, /ruleAttestors\[proof\.ruleId\]\[attestor\]/);
  assert.match(policy, /SignatureChecker\.isValidSignatureNow\s*\(/);
  assert.match(policy, /attestor\s*==\s*msg\.sender/);
});
test('RT6A-05 pending claims excluded from canonical totalXP', () => {
  assert.match(policy, /enum\s+Status\s*\{\s*NONE\s*,\s*PENDING\s*,\s*VALID\s*,\s*REVOKED/);
  assert.match(policy, /function\s+finalize\s*\(/);
  assert.match(policy, /validEarnedXP\[grant\.recipient\]\s*\+=\s*grant\.amount/);
  assert.match(policy, /return\s+identity\.xp\s*\+\s*validEarnedXP\[wallet\]/);
});
test('RT6A-06 future rights depend on dynamic canonical XP, not achieved tier alone', () => {
  assert.match(gate, /registry\.totalXP\(wallet\)/);
  assert.match(gate, /person\.tier\s*<\s*cap\s*\?\s*person\.tier\s*:\s*cap/);
  assert.match(gate, /function\s+requireEffectiveTier\s*\(/);
});
