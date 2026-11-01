# GFLO PIE v0.3 — Smart Account Signer Integration test report

**Date:** 2026-10-15
**Branch:** `feature/pie-core-v0.2`
**Runner:** `scripts/pie-v03-smart-account-signer-integration.mjs`
**Mock:** `contracts/test/GFLOSmartAccountSignerMockV03.sol`
**Quorum:** `contracts/GFLORegistryQuorumV03.sol`
**Solidity compiler:** `0.8.34+commit.80d5c536.Emscripten.clang`
**Environment:** Android Termux, in-memory EthereumJS VM
**Status:** user-reported local 9/9 pass; not independently reproduced, verified on a public chain, or audited.

## Terminal output supplied by developer

```text
=== GFLO SMART ACCOUNT SIGNER — V0.3 INTEGRATION ===
solc: 0.8.34+commit.80d5c536.Emscripten.clang
✅ 1/9 Smart-account signer has pinned controller and quorum
✅ 2/9 Unauthorized caller cannot forward governance operations
✅ 3/9 Unsupported target selector is rejected by smart account
✅ 4/9 Single signer cannot install contract-account signer
✅ 5/9 2-of-3 rotation installs smart account and removes C
✅ 6/9 Controller uses actual smart contract to create Quorum proposal
✅ 7/9 Smart account counts only one signer vote
✅ 8/9 Second independent signer approves and proposal executes
✅ 9/9 Revoked smart account cannot create a new Quorum proposal
✅ 9/9 SMART ACCOUNT SIGNER INTEGRATION CHECKS PASS
Limit: controller-owned mock, NOT passkey/WebAuthn, ERC-1271, or account abstraction.
```

The first attempt completed seven checks before failing at the eighth because the test did not transfer the Registry governance role to the Quorum prior to calling `setPaused(false)`. The runner was corrected to perform the explicit governance nomination/acceptance and verify the new Registry governance address. The user reran the fixed runner and received 9/9.

## Cumulative project checkpoint

Previous latest-suite scenario count: **102/102**. New suite: **9/9**. Total latest-suite local checks: **111/111**.

These counts include intentionally successful adversarial negative-control demonstrations and some overlapping assertions. **111/111 is not equivalent to 111 audited security guarantees.**

## What is and is not demonstrated

The mock is a controller-owned contract that forwards a limited function-selector set to the pinned Quorum. It proves contract-based `msg.sender` signer recognition, one Quorum approval per signer address, revocation after signer rotation and two-independent-address threshold handling.

It does **not** validate WebAuthn/passkey assertions, P-256/secp256r1 signatures, ERC-1271 signatures, ERC-4337 UserOperations, or any actual biometric factor. Controller authentication remains an EOA ownership check.

## Next engineering milestone

**Passkey signer compatibility and threat model**:
1. Choose a reviewed smart-account/WebAuthn implementation and document its supported EVM chains and deployed signature validation path.
2. Validate registration/recovery trust boundary (challenge, origin, RP ID, user verification, credential counter behavior, and application domain).
3. Test contract-account interactions using the chosen implementation, including correct `msg.sender`, replay and revoked-credential behavior; do not treat the controller-owned mock as a passkey test.
4. Check ERC-1271 or ERC-4337 integration only when needed by the wallet implementation, and verify P-256 precompile support/availability per target chain.
5. Maintain independently reviewed XP source-provenance approval, release manifest and compromised-majority governance controls; a passkey is not code authenticity.

No `main` merge, Sepolia deployment or GFLO Ignition is implied by this report.
