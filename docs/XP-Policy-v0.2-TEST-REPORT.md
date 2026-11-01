# GFLO XP Policy v0.2 — 10/10 initial local smoke-test result

**Date:** 2026-10-14
**Result:** developer-reported 10/10 PASS in Android Termux; **not independently replayed**.
**Reference branch:** `feature/pie-core-v0.2`
**Contract:** `contracts/XPPolicyV02.sol`
**Runner:** `scripts/xp-v02-ethereumjs-smoke.mjs`
**Compiler:** Solidity `0.8.34+commit.80d5c536`
**Execution:** EthereumJS VM v10 in memory with PIE and XP contract CREATE/constructors.

## Supplied terminal output

```text
=== GFLO XP Policy v0.2 — EVM CREATE + XP smoke tests ===
solc: 0.8.34+commit.80d5c536.Emscripten.clang
✅ 1/10 PIE + XP contracts deployed; constructors initialized
✅ 2/10 Only owner can administer verifiers and rules
✅ 3/10 Genesis creates 25 XP; policy-earned XP initially zero
✅ 4/10 Untrusted caller cannot award XP
✅ 5/10 Verified 25 XP awarded once; total becomes 50
✅ 6/10 Reused eventId rejected
✅ 7/10 Reused evidence hash rejected (even with a fresh eventId)
✅ 8/10 A nonexistent PIE identity cannot earn XP
✅ 9/10 1000 XP requires elevated verifier; then succeeds
✅ 10/10 XP does not modify earned Tier or allow duplicate claims
✅ 10/10 XP POLICY SMOKE PASS
Scope: EVM CREATE plus limited authorization/replay tests; not complete limit, cooldown or audit coverage.
```

## Not established by this smoke suite
- 1500 XP/day, 3000 XP/fixed seven-day epoch and cooldown boundaries.
- Replay semantics across reverts, evidence quality or resistance to colluding verifiers.
- Multisig verifier independence (the contract provides verifier roles, not cryptographic quorum).
- Signed-transaction fees, gas ceilings, real RPC deployment and security audit.
- Unified immutable XP ledger: Phase 1 core stores Genesis only; policy stores earned XP separately.
- Sybil-resistance and wallet/person uniqueness.

**Next:** independent boundary/adversarial runner with controlled block timestamps.


## Follow-up — 17/17 boundary and security checks (developer-reported)

**Date:** 2026-10-14
**Runner:** `scripts/xp-v02-ethereumjs-boundary.mjs`
**Version:** Solidity `0.8.34+commit.80d5c536`; EthereumJS in-memory EVM, explicit timestamp control.
**Result:** 17/17 PASS, based on developer's Termux terminal screenshot; not an independent CI run.

Verified scenarios reported: real CREATE initialization; rule bounds 25–1000; unauthorized admin denial and immutable rule IDs; 1000 XP elevated-verifier requirement; event and evidence replay rejection; identity/evidence validation; per-rule claim cap; cooldown boundary (3599/3600 seconds); exact daily cap 1500, failure at 1525; weekly cap 3000, failure at 3025; following fixed epoch reset; pause/unpause; rule deactivation/reactivation; verifier role revocation; two-step owner transfer; no direct change to PIE Core Genesis XP or Tier.

```text
✅ 17/17 BOUNDARY & SECURITY CHECKS PASSED
Note: preliminary stateful tests, not audit, actual chain transactions, or Sybil-proof verification.
```

**Aggregate Phase 1+XP pilot check counts:** PIE 11/11 + XP smoke 10/10 + XP boundary 17/17 = **38/38 reported passing checks across three distinct suites**. These checks overlap in scope and are not a measure of audit completeness.

**Critical remaining gaps:** proof authenticity and verifier collusion; wallet-level Sybil resistance; duration semantics (fixed UTC buckets, not rolling 24 h / 168 h); EIP-712 or other signed-claim design; gas/transaction testing; contract upgrade/migration and PIE Core's split XP ledger; real-token atomic ignition; independent review and reproducible CI.
