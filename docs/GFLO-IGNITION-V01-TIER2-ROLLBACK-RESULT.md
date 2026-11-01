# GFLO Ignition MVP v0.1 — Tier 2 & Atomic Rollback local checkpoint

**Date reported:** 2026-10-15
**Branch:** `feature/pie-core-v0.2`
**Test runner:** `scripts/gflo-ignition-v01-tier2-rollback.mjs`
**Fixture:** `contracts/test/GFLOFaultBurnTokenV01.sol`
**Status:** developer-reported local completion; not independent audit, signed-transaction execution, or public network deployment.

## User-provided terminal excerpt

```text
✅ 10/10 No further Tier or burn beyond Praxis
✅ 10/10 TIER 2 & ATOMIC ROLLBACK CHECKS PASS
Scope: EthereumJS in-memory VM and adversarial mock; no live token, signed tx, or security audit.
~/gflo-v02-evm $
```

Only the trailing lines are reproduced here; the full intermediate console output was not provided for this specific run. The test runner's planned assertions are available in the repository.

## Latest-suite count

Previous reported local expected scenarios: **120/120**.
New suite reports: **10/10**.
Current cumulative developer-reported local expected scenarios: **130/130**.

Some earlier scenarios intentionally reproduce attacks, and test suites overlap. This is not a count of independent security guarantees.

## What the new suite is designed to demonstrate

1. Reject skipping Tier 0 directly to Tier 2.
2. Earn 1000 additional XP to reach canonical 1025 and ignite Tier 1.
3. Earn four more 1000 XP awards across day and seven-day UTC boundaries without violating per-wallet limits, reaching canonical 5025.
4. Refuse unauthorized or repeated Ignition rebinding.
5. Failed `burnFrom` reverts without changing observed balance, supply, allowance or Tier.
6. No-op and partial burn attempts fail the exact-balance/supply-delta checks.
7. A token callback attempts to reenter Ignition; the callback fails while the outer Tier 2 upgrade succeeds.
8. User ends at Praxis / Tier 2; no further ignition or burn is allowed.

## Critical validation gap

The current callback fixture records only `callbackSucceeded == false`. It does **not** verify that the nested `ignite()` call specifically reverted with `Busy()`; a failure for any other reason would also satisfy that assertion. Strengthen the test to capture or propagate the precise nested revert selector, and verify expected guard behavior. This is an accuracy gap in the test, not proof of a contract vulnerability.

The tests invoke EthereumJS EVM `runCall`. For release-confidence testing, use signed transactions with proper transaction receipts, snapshots/log checks, contract deployment bytecode and gas accounting. A reverting external call should be verified to revert token state, tier changes and emitted events atomically.

## Priority after successful functional MVP

1. **Focused test-harness hardening**: prove inner revert reason (`Busy`), failed-burn receipt logs and state rollback; independent transaction-level run.
2. **Token integration choice**: lock the real GFLO burn interface and approve/deploy only verified token bytecode; test malicious token behavior and token transfer quirks.
3. **Governance / verifier authority**: ensure XP Policy owner and Registry governance are coherently controlled (e.g., vetted Safe multisig) before external deployments. XP evidence authenticity is still unresolved.
4. **Migration and deployment design**: the new PIE Core is fresh, not a migration of `PIECoreV02`; define migration/replay rules.
5. Keep tier burn fees explicitly provisional: the test's `100` and `200` represent raw token base units, not finalized GFLO tokenomics.

No merge to `main`, Sepolia/public deployment, or audit status is claimed.
