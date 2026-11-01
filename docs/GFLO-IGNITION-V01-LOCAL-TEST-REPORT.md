# GFLO Ignition MVP v0.1 — First Local Integration Report

**Date reported:** 2026-10-15
**Branch:** `feature/pie-core-v0.2`
**Runner:** `scripts/gflo-ignition-v01-atomic.mjs`
**Compiler:** `0.8.34+commit.80d5c536.Emscripten.clang`
**Environment:** Termux Android, EthereumJS in-memory EVM
**Status:** developer-reported 9/9 PASS, not independently reproduced or audited.

## Observed terminal output

```text
=== GFLO IGNITION MVP — ATOMIC EVM ===
solc: 0.8.34+commit.80d5c536.Emscripten.clang
✅ 1/9 Canonical Registry reports 25 Genesis XP
✅ 2/9 No tier mutation by outsider
✅ 3/9 Low XP blocks ignition without burning
✅ 4/9 Earned 1000 XP yields canonical 1025 XP
✅ 5/9 Ignition atomically burns 100 and advances to Tier 1
✅ 6/9 Repeat with XP below Praxis threshold cannot double-burn
✅ 7/9 Paused canonical Registry blocks future ignition
✅ 8/9 Ghost wallet cannot ignite or change tier
✅ 9/9 Core Genesis XP remains unchanged after ignition
✅ 9/9 GFLO IGNITION MVP ATOMIC SCENARIOS PASS
Scope: local VM pilot only; fees illustrative, Tier 2 success and real token not yet tested.
```

## Status checkpoint

Previous 111/111 latest-suite expected scenarios + 9/9 Ignition MVP = **120/120 locally reported scenarios**. Earlier suite counts include overlapping and intentionally reproduced vulnerabilities; not independent proofs of security.

## What is established
A user starts at 25 Genesis XP and Tier 0. A verifier awards 1000 additional XP using XPPolicyV02 for a canonical 1025 XP total. A registered XP source feeds the Registry. With a mock burnable GFLO token and 100 **raw base units** approved for spending, the local EVM ignition updates Tier 0→1 and reduces token balance and supply by exactly 100. The original Genesis XP remains unchanged.

## Important limitations / immediate next gate

- No full Tier 1→2 success test: 5000 XP requires multiple periods because wallet caps are 1500/day and 3000/7-day epoch.
- Failed real token burn and transactional rollback are not yet independently stress-tested. Use a token whose `burnFrom` reverts, whose supply or balances lie, and a reentrancy callback.
- The mock GFLO token exposes unrestricted `mint` for test purposes and must never be deployed as real GFLO.
- Fees of 100/200 are **raw base units**, not 100/200 GFLO tokens; tokenomics not frozen.
- Core v0.1 has a one-time privileged `bindIgnition` with bootstrap/governance trust; deployed v0.2 identities are not migrated.
- XPPolicy owner/verifier manipulation risk remains: release should gate on Safe ownership or equivalent audited administration.
- No signed transaction, fork, Sepolia or public deployment, fuzz/invariant testing or external audit.

## Next test
Controlled block-timestamp test for 5000+ cumulative canonical XP across multiple UTC seven-day epochs followed by 1→2 ignition; failed burn must leave wallet balance, total supply, allowances, Tier, and events unchanged. Extend to reentrancy and false-report token negative controls.

**No merge to main** without review and permission.
