# RED TEAM 6A — static compatibility gate

This suite is designed to **detect and document** incompatibility and relevant invariants; a passing suite does **not** prove the legacy protocol is safe. In particular, the first three tests intentionally assert that the **legacy bugs/incompatibilities exist**. They are not tests of corrected deployed behavior.

## Local requirements

Node.js >=20, a local checkout of `elanmust-GFLOer/GasFeeLoop-` (main) and `elanmust-GFLOer/gflo-pie` (`feature/pie-core-v0.2`). No external package needed.

```sh
cd GFLO.Octo_PIE-cookR
GFLO_LEGACY_DIR=../GasFeeLoop- GFLO_PIE_DIR=../gflo-pie node --test tests/rt6a-compat.test.mjs
```

If using local clones, verify their git commits before running: `git -C ../GasFeeLoop- rev-parse HEAD` and `git -C ../gflo-pie rev-parse HEAD`. The source pattern assertions are intentionally strict and should be updated only following an explicit reviewed migration. A breaking pattern match is a review prompt, **not** permission to dilute assertions.

## Required next tests (NOT implemented here)

- Deploy legacy GasFeeLoop against fresh PIECore and reproduce ABI/runtime incompatibility with signed local EVM transaction.
- Show nonzero stake cannot cause XPPolicyV03 canonical XP gain without valid attestation.
- Negative cases for non-authorized verifier, fake event, 18-decimal XP misuse and cross-source duplicate.
- Verify accepted grant, expiry/challenge, revoke, then dynamic EffectiveTierGate consumer denial.
- Validate fail-closed when registry paused or chain/RPC unavailable.
- Run mutation probes and independent review before any testnet proposal.

No Solidity modified. No mainnet/testnet deployment. No signed EVM test results yet.
