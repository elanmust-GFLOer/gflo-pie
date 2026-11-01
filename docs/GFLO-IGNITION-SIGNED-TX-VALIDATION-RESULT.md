# GFLO Ignition MVP v0.1 — signed transaction security validation

**Recorded:** 2026-10-15  
**Branch:** `feature/pie-core-v0.2`  
**Runner:** `scripts/gflo-ignition-v01-signed-tx-security.mjs`  
**Adversarial test fixture:** `contracts/test/GFLOReceiptAttackTokenV01.sol`  
**Compiler:** `0.8.34+commit.80d5c536.Emscripten.clang`  
**Environment:** native Android Termux, EthereumJS VM; signed *legacy-format* test transactions, no network RPC.
**Evidence:** terminal output provided by developer; not independently reproduced, not audited.

## Developer-supplied terminal result

```text
=== GFLO IGNITION — SIGNED TX RECEIPTS & ROLLBACK ===
Compiler: 0.8.34+commit.80d5c536.Emscripten.clang
✅ 1/8 Signed deployments, nonce and receipts initialize canonical XP
✅ 2/8 Failed signed burn has status 0, no emitted logs or state mutation
✅ 3/8 Partial burn signed tx reverts both token and Tier; receipt empty
✅ 4/8 Signed callback records exact Busy() custom-error selector
✅ 5/8 Signed successful burn emits transaction logs and exact supply delta
✅ 6/8 Signed second ignition below Praxis XP threshold reverts without logs
✅ 7/8 Signed tx gas, nonce and fee are measurable
✅ 8/8 Registry remains canonical while Core genesis XP stays 25
✅ 8/8 SIGNED TRANSACTION SECURITY CHECKS PASS
```

## Cumulative local checkpoint

Previous developer-reported latest-suite scenarios: **130/130**.  
This signed-transaction test: **8/8**.  
**Aggregate: 138/138 expected local scenarios reported passing**.

Caution: suites overlap, and earlier intentionally successful attacker demonstrations are included. Aggregate count is NOT evidence of 138 independent protective guarantees.

## Notable diagnostic history

The first signed-transaction test run stopped after 1/8 due to a nonce mismatch (account nonce 6 vs transaction nonce 2). The test harness had used direct `vm.evm.runCall()` reads from the signing Alice account; they affected simulated EVM nonce state. The runner was changed to use a dedicated non-signing viewer, `isStatic: true`, and state checkpoints with revert. Developer retested and reported 8/8 passing. This was a *harness isolation issue*, not proven Solidity exploit.

## Verification scope and caveats

- EthereumJS `runTx` exercised signed transactions, execution receipt statuses, state transitions, nonce consumption and gas use in-memory.
- Failed transactions were asserted to leave no persisted receipt logs for burn failures and insufficient Praxis XP; the script compares selected storage state, not the entire state trie.
- The callback test verifies the precise `Busy()` error selector instead of treating any revert as sufficient.
- Gas was recorded/asserted as greater than intrinsic gas, but no benchmark numbers or gas-cost optimization report were supplied. Do NOT describe this as completed profiling.
- Receipt log counts were asserted, but complete topic/data decoding and event-order invariants remain future work.
- Synthetic test keys were used only. No public RPC, Safe deployment, real GFLO token, real-money transfer, or independent chain-client comparison occurred.
- `GFLOReceiptAttackTokenV01` is deliberately malicious/test-only, not a release token. Burn prices 100/200 are raw base units and illustrative.
- PIECoreIgnitionV01 is a separate fresh Core with no v0.2 identity migration. XP Policy verifier authority and governance code provenance must be addressed before users or value are involved.

## Recommended next focused release gate (not a new governance stack)

**GFLO Ignition MVP — interface and governance readiness:**
1. Freeze intended burn token interface/semantics; test with realistic standard-compliant implementation, decimals and approved fees.
2. Show how Safe 2-of-3 will own XPPolicyV02 and control TrustedXPSourceRegistryV02 and core Ignition binding; test correct deployment sequence, do not assert ownership has already been transferred.
3. Confirm canonical read `TrustedXPSourceRegistryV02.totalXP` and define XP evidence authority, current trust assumptions, and anti-Sybil limitations.
4. Explicitly choose new genesis deployment vs migration of v0.2 identities; test migration if required.
5. Expand testing across EIP-1559 signed transactions, event topic decoding, multiple accounts, gas profiling, invariants/fuzz, and a second EVM implementation or public testnet before any audit-ready claim.

**Current status: functional Ignition MVP with locally passing transaction-level regression tests, not production ready.**
