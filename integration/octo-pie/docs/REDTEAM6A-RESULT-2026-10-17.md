# RED TEAM 6A — Termux-confirmed source compatibility results

Date: 2026-10-17
Executor: project owner, Android Termux
Source: screenshot and command output provided in project conversation

Command:
```sh
cd ~/GFLO.Octo_PIE-cookR
GFLO_LEGACY_DIR=../GasFeeLoop- GFLO_PIE_DIR=../gflo-pie-rt6a node --test tests/rt6a-compat.test.mjs
```

## Observed result

- tests: 6
- pass: 6
- fail: 0
- cancelled: 0
- skipped: 0
- duration_ms: 530.437846 (as displayed in Termux screenshot)
- tests: RT6A-01 to RT6A-06 all PASS.
- The successful Termux run followed a `git pull --ff-only` from cookR and was run against the separate PIE worktree `gflo-pie-rt6a`.

## Interpretation and limitations

These are **source-level compatibility assertions**, not EVM transaction tests or security proof. Three of the tests assert the **presence** of legacy incompatibilities: missing PIECore `addXP` implementation, stake-multiplied XP flow, and 18-decimal versus integer XP mismatch.

Previous runs failed due to test matcher assumptions about Solidity syntax, not evidence of smart-contract security failure; the matchers were fixed without modifying legacy GasFeeLoop or PIE Solidity code.

The exact legacy and PIE worktree commit SHAs were not included in screenshot and must be recorded before using this as a reproducible release-gate result.

## Next gate

RED TEAM 6B must execute signed local EVM transactions to show that:
1. A legacy GasFeeLoop stake/reward path cannot grant canonical XP through fresh PIECore.
2. Failed legacy calls revert and cannot silently mutate balances, stake or canonical XP.
3. Unauthorized XP submissions cannot bypass the separate XPPolicyV03 attestor/verifier model.

Passing RT6A does not authorize deployment, migration or treasury payments.
