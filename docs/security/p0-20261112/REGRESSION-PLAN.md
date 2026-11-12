# GFLO PIE SEC-01 — isolated candidate and regression plan

Date: 2026-11-12. Status: LOCAL CANDIDATE ONLY / NOT RELEASE-READY.

## Verified reference

- Repository: `elanmust-GFLOer/gflo-pie`
- Pinned commit: `18b1ef168cae9eded38e8fa5998f1308627ab5ed`
- Pinned tree per agent reports: `7743149659bd371905bc9d5365a040be0ea621a4` (not independently reconstructed in this workspace)
- `contracts/XPPolicyV03.sol` baseline Git blob: `b974067cd588c938c1a5be3e1e1cb4803ae5f323`
- Baseline file SHA-256: `3f4148381122a1117629c937402c10a41507e2c814605ccc5d36de3793798ddb`
- Exact baseline source reconstructed locally and both hashes verified.
- Candidate lives only in this isolated `/mnt/data` work area, not in the project repository.

## Scope of the candidate patch

The patch prevents **already-submitted PENDING grants** from being finalized if their attestor was revoked for the relevant rule at any time since submission. It uses an epoch per `(ruleId, attestor)` pair, snapshots the epoch at submission, and checks both epoch and current authorization at finalization.

An unchanged permission call is a no-op for the epoch; first authorization starts at generation zero; an actual `true -> false` change increments once. Revocation is O(1) and cannot roll back the epoch. The 7-field `Grant` getter, `Proof`, typehash, existing events, and existing consumer-facing functions remain textually untouched; two public getters and one custom error are added.

It does NOT protect old **unsubmitted** signed proofs after same-address reauthorization. It also does not change verifier-role revocation semantics, deactivate rules, validate a multisig threshold, or create an attestor compromise recovery mechanism. A compromised address must not be reauthorized: rotate keys, update allowlists, and use separate governance review. Compromised ERC-1271 control must be handled inside its signer contract.

No release/deployment may occur based on this patch alone.

## Execution plan — exact EVM test oracles (NOT EXECUTED)

Each scenario starts from its own clean fixture. Assert the specific custom error/revert, `grants`, `validEarnedXP`, `totalXP`, Registry/Gate reads, nullifier and quota state, and event logs. Do not count a revert caused by another guard as a successful test. On a reverted signed transaction, transaction nonce and gas are external side effects that must be distinguished from contract state rollback.

| ID | Scenario | Expected after patch | Expected baseline |
|---|---|---|---|
| B01 | Valid pending, then remove attestor, mature, finalize | `AttestorAuthorizationInvalidated` and no XP | Finalizes: documented bug |
| B02 | Valid pending, remove -> re-add, mature, finalize | Same invalidation | Finalizes: documented bug |
| B03 | Valid pending, no removal, mature exactly at deadline | Success once | Success |
| B04 | Finalize one second early | `TooEarly` | `TooEarly` |
| B05 | Same attestor authorized for rules A and B, revoke only A | A invalid; B succeeds | Both finalize |
| B06 | Repeat `setAttestor(true)` while pending | Generation unchanged, succeeds | Succeeds |
| B07 | Attestor A revoked but B is authorized under same rule | A invalid; B succeeds | Both finalize |
| B08 | After revoke/re-add, fresh proof using new `eventId/evidenceDigest/nonce` | New grant succeeds after challenge | Succeeds |
| B09 | Old PENDING grant revoked by owner while policy paused | `revoke` succeeds, no XP change | Same |
| B10 | VALID grant before attestor removal, then explicit revoke | Removal does not cascade; revoke subtracts XP once | Same |
| B11 | Old **unsubmitted** signature submitted after revoke/re-add | Still accepted if unexpired, documenting residual SEC-02 | Same |
| B12 | Reuse event/evidence/nonce from submitted grant | `Replay`, no quota refund | Same |
| B13 | `grants(claimId)` getter and Registry's required selectors | 7 fields, selectors remain; new codehash | Baseline |
| B14 | Pause during finalization, then unpause, revoked attestor | `Paused` then `AttestorAuthorizationInvalidated` | `Paused` then success |
| B15 | Validate submitted proof expiring after submission but before challenge | Still finalize, if attestor unaffected | Same |

Mutation gates: skip generation check (B02 must fail); remove rule scoping (B05 must fail); omit current allowlist check (B01 must fail). A harness/compiler error is not a mutation kill.

## Required before any merge or pilot

1. Separate authorization to edit repo files, install locked dependencies and run local EVM tests.
2. Pin a clean worktree to exact commit; independently verify the original blob and reject if different.
3. First run B01/B02 against unmodified baseline and save expected-failure evidence.
4. Apply patch and run full negative/regression/mutation tests under both isolated toolchains (Solc 0.8.28 and 0.8.34); preserve exact errors and timestamps.
5. Select and pin one authoritative deployment compiler configuration. Archive standard JSON input/output, ABI, full storage layout, runtime bytecode, build provenance, lockfile hashes and commit SHA.
6. Perform fresh migration/dependency mapping for Core/Registry/Gate/Ignition/token; verify the actual on-chain binding state. Existing identities do not migrate automatically.
7. Resolve the unsubmitted-proof SEC-02 design (signed epoch + versioned EIP-712; or explicitly accept residual risk only in an isolated, no-value lab). Do NOT reauthorize compromised addresses.
8. Independent review and explicit separate authorization before any Base Sepolia or production action.

**Current release decision:** Base Sepolia BLOCK; Production BLOCK / NO-GO.

## Codex handoff clarification — test runner status convention (2026-11-12)

The attached `sec01-sec02-regression.mjs` implements exactly **seven**
EVM cases: B01, B02, B03, B05, B06, B11, B12. The table above specifies all
B01–B15, but the remaining eight cases are **not implemented** by this runner.
No Solidity or EVM execution occurred in the packaging environment.

A successful oracle only means the predicted behavior was observed; it does
**not** mean the security gate passed. The runner prints `ORACLE_MATCH` per
scenario, and one final `GFLO_SECURITY_RESULT` JSON line.

- **exit 0**: all implemented oracles match and none reproduces a modeled
  vulnerability. This state is *not expected* for either supplied mode.
- **exit 2**: oracles match, but a vulnerability was reproduced;
  `securityGate=BLOCKED`. Expected baseline: SEC-01 B01/B02 and SEC-02 B11.
  Expected SEC-01 candidate: only SEC-02 B11.
- **exit 1** (or another unexpected code): assertion, harness, compiler, or
  runtime failure. Never reclassify it as an expected security result.

The complete release decision remains **BLOCKED** independently of runner
status; full B01–B15 EVM regression, mutation tests, CI and reviewed SEC-02
remediation are separate gates.
