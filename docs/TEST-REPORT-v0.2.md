# PIE Core v0.2 — Phase 1 test record

**Status:** user-reported successful local test, **not** GitHub Actions CI / independent reproduction.
**Date:** 2026-10-14
**Branch:** `feature/pie-core-v0.2`
**Contract:** `contracts/PIECoreV02.sol`
**Runner:** `scripts/pie-v02-ethereumjs-11.mjs`
**Execution:** Android Termux, Node.js 25.8.0, EthereumJS VM 10, solc 0.8.34; runtime bytecode injected directly into the in-memory EVM.

## Reported output
```text
=== GFLO PIE v0.2 - 11 contract tests ===
solc: 0.8.34+commit.80d5c536.Emscripten.clang
✅ 1/11 Unregistered wallet: no identity or active Path
✅ 2/11 Genesis: Praxis target still grants only Sovereign / 25 XP
✅ 3/11 Genesis cannot be claimed a second time
✅ 4/11 Invalid Genesis target None is rejected
✅ 5/11 Wallet without identity cannot change target
✅ 6/11 Changing target leaves XP and Tier unchanged
✅ 7/11 None cannot be selected as an updated target
✅ 8/11 Distinct wallets have independent Genesis states
✅ 9/11 Only consecutive upward transitions are valid
✅ 10/11 nextTier stops at Praxis
✅ 11/11 No XP award or Tier upgrade entrypoint exists in Phase 1
✅ 11/11 PASS - PIECoreV02 Phase 1 stateful EVM checks.
Scope: injected runtime bytecode, not constructor/deployment or XP/Ignition audit.
```

## Interpretation and limitations
- The above console output was supplied by the developer running Termux; the assistant did not independently run or verify the execution.
- This is a focused Phase 1 runtime-state test, not a deployment test, chain transaction simulation, security audit, fuzz test, or GFLO token/XP Policy integration test.
- GitHub Actions is blocked by an account billing restriction; the earlier workflow failure occurred before tests began.
- For independent reproducibility, a clean environment should pin tool versions and record the exact source commit and dependency lockfiles.
- No Genesis identity per-human Sybil protection, recovery, or cross-chain identity uniqueness is established.

## Next milestone
Specify and implement `XP Policy v0.2` with award evidence, replay protection, authorization and explicit caps, then add tests before token ignition integration.
