# GFLO Ignition MVP — Tier 2 and Atomic Rollback Test Gate

**Status:** prepared but NOT YET RUN by developer; local EthereumJS security checks pending.
**Branch:** `feature/pie-core-v0.2`
**Runner:** `scripts/gflo-ignition-v01-tier2-rollback.mjs`
**Fixture:** `contracts/test/GFLOFaultBurnTokenV01.sol`

## Test plan

1. Reject skip-to-Tier-2 from a user without authorized ignition.
2. Earn 1000 XP and ignite successfully into Reformer.
3. Earn another 4000 across separate fixed UTC seven-day epochs; check total 5025 XP including genesis 25, day/week XP buckets.
4. Verify Ignition binding cannot be reset or changed by unauthorized caller.
5. Simulated `burnFrom` revert: check unchanged balance, supply, allowance and Tier.
6. Simulated no-op `burnFrom`: verify exact-delta guard reverts.
7. Simulated partial burn: verify all state changes roll back.
8. Simulated callback to `ignite()` from a malicious token: reentrant attempt fails; outer burn and upgrade may succeed.
9. Verify successful Tier 1 → Tier 2 / Praxis and canonical XP.
10. Prevent further ignition past Praxis.

## Critical scope limits

- Mock token includes unrestricted mint and mutable fault modes — it is **not production GFLO**.
- Fees `100` and `200` are raw base-unit demonstration amounts, not final token amounts/economics.
- The harness uses EthereumJS `runCall` in memory; the next serious gate must simulate signed transactions and examine gas, state snapshots and receipt logs to verify full rollback and event behavior.
- A malicious token may lie about `balanceOf` or `totalSupply`; exact-delta checks do not authenticate token code. Production token acceptance requires verified token address, code, interface and governance.
- Reentrancy simulation tests a callback that catches inner failure. Further malicious callback variants and token-induced revert after internal changes remain useful.
- Existing Core uses separate fresh identity storage and does not migrate prior PIE v0.2 identities.
- XP Policy verifier/admin risk remains and requires review even if Ignition passes.
- No Safe deployment, Sepolia, live GFLO, external audit or main merge.

## Acceptance

Developer runs the script in native Termux and shares full output. Only if 10/10 pass should the aggregate advance from the previously reported 120/120 to 130/130; if it fails, diagnose and correct the test or contract with clear attribution.
