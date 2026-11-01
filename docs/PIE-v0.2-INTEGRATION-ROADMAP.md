# GFLO PIE v0.2 — Integration & Security Hardening roadmap

**Status:** engineering plan / review required. Not an implementation, deployed contract, or audit.
**Baseline:** PIE 11/11 + XP smoke 10/10 + XP boundary 17/17, developer-reported Termux results.

## Verified implementation baseline
- `PIECoreV02` keeps wallet-linked identity, Genesis 25 XP, selected goal and earned Tier 0.
- `XPPolicyV02` stores earnedXP separately. `totalXP(account)` combines Core Genesis XP + earnedXP for reading.
- Both contracts have local in-memory EthereumJS smoke coverage; deployment or security audit is not established.
- XP Policy uses fixed UTC daily and seven-day epoch caps, not rolling limits.
- Current verifier role 2 is permission, not independently enforced multisignature quorum.

## P0 — Canonical XP accounting and state invariants (next)
1. Define ONE public, canonical `totalXP` API, with unambiguous Genesis 25 and earnedXP storage ownership.
2. Prefer separate accounting owned by XP Policy (Genesis anchored in Core, earned credits owned by XP Policy); future PIE Core integration must read the designated canonical source via immutable/explicitly governed policy interface. Never add an unrestricted XP mutator to Core.
3. Make explicit source-of-truth/versioning and how future ledger migration avoids double counting and preserving replay uniqueness. Existing deployment has no upgrade path.
4. Keep `tier` unchanged by XP awards and `selectedPath` aspirational.
5. Add integration tests with true contract creation, malformed and absent policy addresses, distinct identities, no double-counting, and failed claim atomicity.
6. Document gas costs and storage growth. Resolve whether `uint64` XP is adequate for lifetime awards (it is high capacity but migration needs type compatibility).

Acceptance: one canonical XP value used for UI and future ignition; previous 38 test checks still pass; new contract-level integration tests pass and are recorded.

## P1 — Verifier and evidence assurance
- Define challengeID, evidence origin, canonical task completion ID, and `eventId` to prohibit resubmission with different IDs.
- Limit verifier privileges per reward category and permissions; role 2 by itself does not require multiple signers.
- Evaluate EIP-712 typed-data attestation with chainId, verifyingContract, subject, ruleId, evidence commitment, nonce/unique event, deadline and schemaVersion.
- For high-impact rewards, consider on-chain threshold multisig/contract wallet, not an ordinary EOA masquerading as consensus.
- Test revoked verifier, expiry, signature reuse, wrong chain/domain and signer changes.
- Define sybil mitigation separately: signature proving wallet control is not one-human proof.

## P2 — Atomic GFLO ignition
- Select canonical threshold schedule (working values: 1000 XP for Reformer, 5000 XP for Praxis; review economics before freeze).
- Choose a single canonical GFLO ignition fee per tier; legacy pricing is inconsistent and MUST NOT be silently inherited.
- Enforce exactly Tier 0→1→2 with no bypass; verify required XP before ignition, require real GFLO burn and revert all on failure.
- Follow checks-effects-interactions and guard against untrusted token behavior; consider compatible burn method and governance safeguards.
- Test denial of skipping, downgrades, ghost users, no-token balance, insufficient XP, burn failure, fee inconsistencies, max Praxis, and reentrancy.

## P3 — Testing and compatibility
- Add fixed-version test harness, lockfiles and record exact contract source commit, compiler version, chainId, hardfork.
- Include real CREATE/deployment transactions, gas profiling, fuzz/invariant testing, cross-contract adversarial scenarios.
- Check Sepolia EVM opcode hardfork/compiler compatibility, verify chain-specific configs and deployed bytecode.
- Keep main branch unchanged until review, green local tests and explicit merge approval.

## Release gates
- No Sepolia deployment until P0/P1 accounting trust boundaries and P2 ignition logic tested as an integration.
- No main merge or production claim on smoke/boundary tests alone.
- Any claimed test success must be reproducible with command, output and commit reference.

## Immediate task
Prepare the **P0 canonical XP adapter/integration specification** and comprehensive tests, **without changing the proven PIECoreV02 or XPPolicyV02 runtime logic yet**.
