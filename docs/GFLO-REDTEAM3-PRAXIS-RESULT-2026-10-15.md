# GFLO RED TEAM 3 — Praxis Tier 2 signed XP-window result
Date: 2026-10-15
Repository branch: `feature/pie-core-v0.2`
Runner: `scripts/gflo-redteam3-praxis-windows.mjs`
Status: User-executed Termux test output: `14/14 RED TEAM 3 PRAXIS TIME-WINDOW CHECKS PASS`

## Reported environment and scope
- Node/Termux environment, Solidity compiler `0.8.34+commit.80d5c536.Emscripten.clang`.
- EthereumJS local `runTx` with signed test-only transactions, caller-controlled EVM block timestamps, official Safe v1.5.0 artifacts, OpenZeppelin ERC20Burnable 5.4.0 and GFLO contracts.
- All test keys are synthetic; no public testnet, mainnet deployment or independent audit.

## User-provided outcome
1. Signed Safe + Core + XP + Registry + Token + Ignition deployments — PASS
2. One Safe signer cannot bind ignition; signed failure preserves nonce — PASS
3. Two Safe signers bind ignition and activate canonical registry — PASS
4. 25 Genesis XP blocks signed ignition without allowance; token stays intact — PASS
5. Signed approval exists; low XP still reverts with identical state — PASS
6. Safe 2/3 approves XP verifier and reward rule; canonical XP 1025 — PASS
7. Insufficient allowance rejects signed ignition and preserves all state — PASS
8. Signed valid Ignition burns exactly 1 GFLO and advances only Tier 1 — PASS
9. Second signed ignition under Praxis XP threshold reverts atomically — PASS
10. Unknown verifier and recycled event/evidence rejected by signed receipts — PASS
11. Same-day second 1000 XP award exceeds 1500 daily cap and rolls back — PASS
12. Three separate days allow 3000 earned XP; fourth award fails weekly cap — PASS
13. Week 2 legitimate rewards raise canonical XP to 5025 — PASS
14. Signed Praxis ignition burns exactly 2 GFLO and reaches Tier 2 once — PASS

## What the 14 checks support
- In this local EVM fixture, 25 Genesis XP plus 5 separate 1000-XP awards, distributed over the allowed daily and weekly buckets, resulted in 5025 canonical XP and Tier 2.
- Both the first and second tier changes emitted expected events and consumed illustrative GFLO burn fees (1 GFLO and 2 GFLO respectively). Neither amount is approved tokenomics.
- Unauthorized verifier, duplicate event/evidence identifiers, same-day and same-week cap failures, insufficient allowance and XP resulted in expected rejected transactions and no observed application-state changes for the measured variables.
- The policy uses fixed Unix UTC epochs (`block.timestamp / 1 days` and `block.timestamp / 7 days`); 7-day epochs begin on Thursday 00:00 UTC. These are not rolling 24h / 168h windows and must be documented precisely to end users.
- The test artificially selects block timestamps. This validates local EVM time-window execution, not consensus timestamp control on a live chain.

## Critical limitations and next RED TEAM gate
- A privileged elevated verifier may submit invented events and arbitrary evidence hashes: uniqueness checks are NOT a demonstration of evidence authenticity, human uniqueness or Sybil resistance. The Safe 2-of-3 protects administrative rights but is not a substitute for verifier integrity.
- Need explicit tests for forged but unique evidence by compromised verifier; cross-wallet abuse; revocation and pause propagation; relative clock/epoch boundary exploitation; Safe modules/guards/fallback configuration policy; events and code provenance; third-party review.
- Canonical Registry one-time policy activation and PIE Core one-time Ignition binding create significant non-upgradability/operational risk. Test emergency pause and deployment rehearsals before public deployment.
- Prior 181 passing local scenarios plus 14 = 195 reported local passing scenarios. Suites overlap. RED TEAM Gate 1 mutation score 3/3 is separate; neither count represents broad assurance.
- No external audit, public testnet, dependency supply-chain closure, or final supply and distribution design.

## Suggested next action
RED TEAM 4 — XP evidence trust boundary: demonstrate that an elevated verifier can currently award XP based on fabricated but unique identifiers, then decide whether the threat is acceptable as a governance trust assumption or requires an off-chain attestation/evidence verification design. An intentionally successful abuse simulation should be recorded as a finding, not counted as a normal passing security guarantee.
