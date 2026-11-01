# GFLO RED TEAM — Mutation Gate 1 result (2026-10-15)

**Reported result:** `{ killed: 3, survived: 0, invalid: 0 }`.

**Status:** User ran `node gflo-redteam.mjs` in Android Termux with the `feature/pie-core-v0.2` runner and provided its summary output. This document records that observation; no independent rerun on a separate EVM client is claimed.

## Scope and interpretation

The baseline is the 11/11 Safe 2-of-3 + Trusted Registry + XP Policy + OpenZeppelin ERC20Burnable + Ignition local EthereumJS `runCall` integration test. The mutation gate injects temporary Solidity source changes **in memory** before compilation. Production pilot contracts in `contracts/` are not edited.

Three injected mutants were detected:
1. `xp_threshold`: `REFORMER_XP = 1000` changed to `0`; checks expecting insufficient XP rejected the altered behavior.
2. `skip_burn`: `gflo.burnFrom(msg.sender, amount)` skipped; token burn / exactness expectations rejected the change.
3. `bypass_tier_auth`: `PIECoreIgnitionV01.upgradeTier` caller authorization disabled; the added unauthorized direct call asserted the exact `NotIgnition()` selector and unchanged Tier.

**Mutation score for these selected test mutants only:** 3 killed / 3 valid = 100%; 0 survivors; 0 invalid. Not a protocol security score.

The direct Core authorization negative test was introduced after the initial `bypass_tier_auth` mutant survived (prior red team result `{ killed: 2, survived: 1, invalid: 0 }`). The second run detected all three. This constitutes a useful test coverage improvement, not proof that every unauthorized call scenario is covered.

**Known methodological limitations:**
- These mutations and corresponding tests were authored by the same workflow; limited selection and test oracle bias remain possible.
- The `xp_threshold` and `skip_burn` scenarios require matching test failure markers but have less precise selectors than the `bypass_tier_auth` check.
- Regression baseline and mutations run on local EthereumJS `runCall`, not externally signed L1/L2 transactions or independent EVM clients.
- Full Tier 2 (Praxis) positive flow, receipt-level Safe approvals, chain-specific Safe module/guard restrictions, tokenomics, verifier evidence legitimacy, npm dependency advisories and external audit are not satisfied.
- Previously reported `164/164` counts overlapping test scenarios and should not be interpreted as independent security guarantees.

## Recommended next security gate

**RED TEAM Gate 2 — signed transaction and state oracle:** use actual EthereumJS `runTx` receipts to confirm authorization failure and rollback of GFLO balance, `totalSupply`, allowance, Tier and Safe nonce; assert exact revert selectors where available, actual logs/receipt status and no spoofed success. Then test a successful Tier 2 path with concrete cumulative XP and weekly cap respecting evidence replay protections. Keep the existing originals and mutated variants clearly separated.

Relevant test runners:
- `scripts/gflo-safe-aba-full-integration.mjs`
- `scripts/gflo-redteam-mutation-gate.mjs`
