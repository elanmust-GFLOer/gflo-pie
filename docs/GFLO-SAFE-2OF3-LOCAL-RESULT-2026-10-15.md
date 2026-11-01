# GFLO — Safe 2-of-3 local authorization test report

Date: 2026-10-15
Branch: `feature/pie-core-v0.2`
Test runner: `scripts/gflo-safe-v15-real-threshold.mjs`
Environment: Android Termux; local EthereumJS VM; solc 0.8.34; Safe official npm `@safe-global/safe-smart-account@1.5.0` compiled ABI and bytecode.

## User-executed result

Reported terminal output (8/8 successful):
1. Official singleton and initialized Safe proxy deploy successfully.
2. Real Safe owner list has three distinct accounts and threshold two.
3. XP Policy owner is Safe; direct signer or relayer cannot set verifier.
4. One valid owner signature cannot satisfy Safe threshold.
5. One owner plus non-owner cannot satisfy Safe threshold.
6. Two actual owners approve Safe execution of XP verifier role.
7. Replay of old two-owner signatures fails after Safe nonce increments.
8. Two owners may also revoke verifier; one cannot.

Observed terminal summary: `8/8 ACTUAL SAFE 2-OF-3 AUTHORIZATION CHECKS PASS`.

Cumulative previously reported scenario count: 145 + 8 = 153 / 153 (some suites overlap).

## What was actually validated

- Official Safe v1.5.0 singleton and SafeProxyFactory EVM execution via local `runCall`.
- Real Safe owner signature checking and nonce use.
- GFLO XPPolicyV02 owner is proxy Safe account and `setVerifierRole` call is privileged.

## Outstanding caveats

- This suite uses EVM `runCall`; it does **not** submit outer cryptographically signed Ethereum transactions or validate outer receipts, gas, logs and fee accounting.
- Does not exercise Safe module, guard or fallback handler threat surfaces; setup currently passes zero addresses and empty setup data.
- A successful `execTransaction` return value must be checked; outer success does not inherently imply a successful inner target call.
- GFLO Registry, one-time Core Ignition binding, official fixed-supply token, and full atomic Tier transition are not yet tested in the same actual-Safe deployment.
- No public testnet, network-specific Safe deployment verification, external audit, final tokenomics or mainnet readiness.
- XP verifier attestations remain a separate trust/Sybil-control concern.

## Next gate

Actual Safe 2-of-3 authorization for `PIECoreIgnitionV01.bindIgnition` and `TrustedXPSourceRegistryV02.proposePolicy/activatePolicy/setPaused`, followed by OpenZeppelin GFLO burn and canonical XP Tier change in one integrated local EVM scenario.
