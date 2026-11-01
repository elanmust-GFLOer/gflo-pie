# GFLO PIE v0.2 — PoVA release evidence and Sepolia source-verification baseline

**Status:** READ-ONLY AUDIT WORKING BASELINE — NOT RELEASED / NOT VERIFIED AS v0.2  
**Prepared:** 2026-11-01  
**Immutable candidate:** `feature/pie-core-v0.2` at `a4e11cb467c2eae6f6baf2419aaa38aa653fdf16`  
**Scope:** source review, Etherscan V2 query of chain ID 11155111, immutable deployment receipts; **no execution of verification submission, deployment, token operation or merge**. See [#17](https://github.com/elanmust-GFLOer/gflo-pie/issues/17) and [#18](https://github.com/elanmust-GFLOer/gflo-pie/issues/18).

## Current checkpoint — later 2026-11-01

PR #20–22 integrated the six-contract canonical line and local activity pilot into main at `18b1ef168cae9eded38e8fa5998f1308627ab5ed`. This is a repository merge, not a public-network release. The legacy source search and verification subsequently completed: all four legacy addresses have verified source/ABI, as recorded in [DECISION-001](DECISION-001-v3-retirement.md). The token is **MockGFLOToken**; verification does not repair its open faucet or the other legacy incompatibilities. The NO entries in the historical table below describe the earlier query, not current explorer status. No v0.2 deployment is established. Current CI/dependency disposition: [maintenance](MAIN-MAINTENANCE-2026-11-01.md).

## 1. Legacy Ethereum Sepolia contract manifest (NOT PIE v0.2)

| Contract | Address | Deployment tx | Receipt status | Public verified source? |
| --- | --- | --- | --- | --- |
| GFLOToken | `0x563b2e3b499818a2f84c472efb3169a2667807fe` | [tx](https://sepolia.etherscan.io/tx/0xf2cce54154bea5d4196a2886c68539e140b0d1077624c58e6ae6ede89a7a25fa) | `0x1` | NO |
| PIECore | `0x9CF55d0b9D61Dc28EF3cb10765CF4b861Cd0991e` | [tx](https://sepolia.etherscan.io/tx/0x6d9e3176ff02a6bd956f6ec269f5cd3285ed72e66181ea0c11cd48ab701830e9) | `0x1` | YES — **legacy, not v0.2** |
| GFLOIgnition | `0x414DEDcf9264614Fd087BDa58bE27a0B698CcC54` | [tx](https://sepolia.etherscan.io/tx/0xe8a8d509403932a2aab23f96b9acb417aae86989bcd2c9843a3e8643c90dacb3) | `0x1` | NO |
| GasFeeLoop | `0xd2C926F67080D6315b5dbBc7d621d729Cfe8A9C7` | [tx](https://sepolia.etherscan.io/tx/0x4e2f484d1ef06b6ac839a7cf12ae28286fea49652b14352d7d9fe3e63775a21c) | `0x1` | NO |

All four receipts: Sepolia (11155111), `from=0xf80a456710b7af746d88733dc456bc3190e6fa31`, contract creation address matches expectation. The verified legacy PIECore reports Solidity `v0.8.34+commit.80d5c536`, optimizer OFF, MIT and constructor token argument `0x563b2e3b499818a2f84c472efb3169a2667807fe`. These settings MUST NOT be assumed for the other three contracts.

**Critical legacy finding:** verified PIECore exposes permissionless `gainXP(uint256)` after path selection. It cannot support trustworthy PoVA awards and must not be represented as verified v0.2.

## 2. Required artifact per contract before Etherscan submission

Create immutable entries containing:
- origin repository, exact commit and source path; full dependency/source bundle, SPDX license;
- compiler full version, evmVersion, optimizer enabled/runs, viaIR, metadata.bytecodeHash and libraries;
- constructor arguments ABI-encoded, deployment tx and deployed runtime bytecode hash; compare reproducibly, not visually;
- verified source submission format (Solidity standard-json-input preferred), explorer verification status/result and explorer URL;
- original deployer/owners and trust boundaries; no private keys, wallet seed phrases or API tokens in tracked files.

**Gate:** mark `MATCH` only after exact reproducible creation/runtime bytecode comparison (accounting for metadata/immutables and constructor args). If unmatched, report `SOURCE_OR_BUILD_UNKNOWN` and STOP. Do NOT alter or redeploy legacy addresses to hide a mismatch.

## 3. PIE v0.2 reproducibility baseline

The current six-contract tested line is recorded in README. `PIECoreV02.sol` is the Genesis/Path reference, not the tier-bearing core. Historical candidate source list: `PIECoreV02.sol`, `XPPolicyV03.sol`, `TrustedXPSourceRegistryV02.sol`, `EffectiveTierGateV01.sol`, `GFLOIgnitionV01.sol`, `PIECoreIgnitionV01.sol`. Consult the full frozen contract tree, lockfiles, workflows and **exact candidate SHA**. Keep historical main/legacy contracts separate.

Mandatory proof bundle:
1. Pinned source revision + SHA-256 build manifest of sources, lockfiles, compiler and dependency graph.
2. Clean `npm ci`/deterministic compiler and bytecode reproduction; archive stdout, stderr, signed receipts, state assertions and artifact digest.
3. Tests for public self-XP rejection; EIP-712 signer/authz, domain, nonce, eventId/evidenceDigest nullifiers, expiry, cap boundaries.
4. `PENDING → VALID → REVOKED` and double revoke; pause and resumed checks; fail-closed state-changing Tier-2 consumer; ERC-1271 signer adversarial cases.
5. Negative test for dishonest authorized reviewer and forged real-world activity; attestor independence **is only a key separation**, not proof of honest real-world review.
6. Negative control: old deployed PIE self-award behavior; do not migrate trust status automatically.
7. Independent review of all results and explicit release gate closure.

Existing `docs/VERIFIED-CONTRIBUTION-SECURITY-GATE-V01.md` remains OPEN; its scoped green checks and developer-reported reports are not a global security clearance. No public-network deploy of the v0.2 branch has been established.

## 4. Deployment and verification decision boundary

- **Now:** read-only source verification research; report provenance and unknowns, prepare standard-json verification inputs.
- **Next:** reproduce exact builds and CI with logs attached to immutable revision; gather missing legacy source provenance.
- **Only after explicit deployment authorization and release review:** deploy separately versioned v0.2 contracts to selected testnet, then verify them independently and publish complete manifest.
- **Not in scope:** merge to main, deploy contracts, call verifier write endpoints, grant attestor/verifier privileges, bridge tokens, import legacy XP, use economically meaningful Tier privileges.
