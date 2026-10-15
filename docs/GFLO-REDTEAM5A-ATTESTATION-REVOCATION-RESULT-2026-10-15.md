# GFLO — RED TEAM 5A signed attestation + revocable XP result

Date: 2026-10-15
Branch: `feature/pie-core-v0.2`
Runner: `scripts/gflo-redteam5a-attestation-revocation-smoke.mjs`
Experimental implementations: `contracts/XPPolicyV03.sol`, `contracts/EffectiveTierGateV01.sol`
Status: **8/8 user-executed local EVM scenarios PASS** — NOT full RED TEAM 5, audit, objective evidence validation or production readiness.

## User-run terminal result
```text
=== GFLO RED TEAM 5A — ATTESTATION / REVOCATION / DYNAMIC TIER ===
Solc: 0.8.34+commit.80d5c536.Emscripten.clang
✅ 1/8 Safe 2/3 controls fresh XPPolicyV03 and Gate can read canonical XP
✅ 2/8 Verifier requires independently authorized signer; unsigned proof rejected
✅ 3/8 Invalid evidence signature rejected; correct independent EIP-712 signature accepted
✅ 4/8 Pending XP cannot unlock Tier 1 or increase canonical XP
✅ 5/8 Early finalize fails; expiry of attestation does not override 3-day finalization
✅ 6/8 Finalized claim permits real signed Tier 1 burn and effective tier 1
✅ 7/8 Safe 2/3 revokes valid grant: effective Tier falls, achieved Tier remains
✅ 8/8 Replay after revocation fails and paused Registry fails closed
✅ 8/8 RED TEAM 5A SIGNED ATTESTATION REVOCATION GATE CHECKS PASS
Scope: experimental local EVM; independent key signatures are NOT independent real-world truth; not full RT5 or audit.
```

## Interpreting the reported result

- A new policy `XPPolicyV03` uses an authorized rule-specific attestor signature (EIP-712 via OpenZeppelin), an authorized verifier, a PENDING stage, a provisional 3-day challenge period and exactly-once transition to VALID.
- PENDING awards do not count towards canonical XP and cannot unlock `GFLOIgnitionV01`.
- After finalization, canonical XP was 25 Genesis + 1000 earned = **1025**; signed Tier 1 Ignition burned illustrative 1 GFLO.
- Safe-authorized revocation reduced canonical XP to **25**, while the Core's historical tier stayed **1**; `EffectiveTierGateV01.effectiveTier` then returned **0** and an authorization call demanding Tier 1 was rejected. Previously burnt GFLO was not reminted.
- Reuse of revoked event/evidence data and an inactive Registry were rejected by their local receipt checks.

## Earlier test failures and corrections

- Initial runner compilation hit `Stack too deep` in `XPPolicyV03.submit()`; source refactored with private `_reserveQuota()`, leaving quotas and evidence signature checks intact.
- A subsequent runner reached 4/8 then stopped with JavaScript `ReferenceError: atDay is not defined`. Updated runner provided block timestamp fixtures and corrected remaining variable references; user independently reran it and reported 8/8.

This records the local correction sequence; the 8/8 result pertains to the updated code, not those failed versions.

## Red-team limitations and important untested claims

- **Independent cryptographic signer is not independently verified real-world proof**. Two colluding actors may sign fabricated evidence; the RED TEAM 4 trust finding remains unresolved at the organizational/evidence-review layer.
- No production economic consumer has yet been forced to use `EffectiveTierGateV01`. The legacy Core tier remains high after revocation; direct reads of `getIdentity().tier` could bypass dynamic entitlement enforcement.
- The 3-day challenge window is provisional, not a product/policy choice; the attestation expiry is checked at submission but a finalized award is permitted after signed proof expiry under current pilot semantics.
- The initial negative tests assert signed tx status and unchanged measured state; more granular expected revert selector and invariant checks are required for release-grade oracles.
- `XPPolicyV03` signature binding across recipient, event, rule, proof nonce, chain and verifying policy is not exhaustively tamper-tested, particularly ERC-1271 contract signer behavior and collusion.
- No positive signed full Tier 2→effectiveTier 1 downgrade fixture with 2000 XP revocation yet.
- No multi-claim quota/revocation abuse, proof replay across wallets/chains, unauthorized revocation, governance censorship and dispute fairness tests yet.
- Current `TrustedXPSourceRegistryV02` policy activation and Core Ignition binding are one-time; use fresh deployment only; code changes do not modify an existing deployed policy.
- No public testnet, third-party security audit or finalized tokenomics. Reported cumulative *overlapping local scenario count* is 195 + 8 = **203**. RED TEAM 4 intentionally successful attack reproduction (13/13) and Gate 1 killed mutations (3/3) are separate metrics, NOT added to 203.

## Next target: RED TEAM 5B

Prioritize security-negative cases from `docs/GFLO-REDTEAM5-PROOF-INTEGRITY-ACCEPTANCE-SPEC.md`:
1. Exact domain/recipient/rule/event/evidence/nonce tampering and signer misuse, replay with unexpired proofs (RT5-01..06).
2. Unauthorized/premature/double finalize or revoke, daily/weekly cap preservation after revocation (RT5-09..12,16).
3. Positive Praxis 5025→3025 XP through revoking two final grants; achieved tier 2 unchanged, effective tier 1, paid burn stays burned, Tier 2 consumer rejects access (RT5-13..15).
4. Mutation testing bypassing attestor check / XP subtraction / EffectiveTierGate must fail via matching security oracles (RT5-19).
5. ERC-1271 fixture and off-chain evidence review process (RT5-18,20) tracked separately.

Keep all original GFLO contracts and baseline regression tests intact until the safety gates pass.
