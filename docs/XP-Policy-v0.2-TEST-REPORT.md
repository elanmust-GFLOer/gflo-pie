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
