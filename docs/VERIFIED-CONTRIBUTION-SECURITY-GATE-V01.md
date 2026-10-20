# GFLO Verified Contribution Core — Security Gate v0.1

Date: 2026-10-20
Status: **OPEN / NOT ACCEPTED**. This document defines a testable release gate; it does **not** claim the required tests are implemented, passing, or independently audited.

## Scope and immutable review baseline

- Development base: `feature/pie-core-v0.2` at `013efa66021b3a4f05e73663ea07e836dcf1eea8`.
- Prior hardening candidate: PR #11 at `78c3fad7a076afa73a61b0ae3e3a940abf25d699`, independent read-only Codex result **PASS for restricted scope / CONDITIONAL for merge**.
- This security gate branches from that precise PR #11 head; PR #11 must remain unchanged/draft until separately approved.
- Solidity in scope: `XPPolicyV03`, `TrustedXPSourceRegistryV02`, `EffectiveTierGateV01`, `PIECoreIgnitionV01` and a **real state-changing privileged consumer fixture**, together with immutable current-redteam signed transactions.
- Never infer production security, real-world contribution truth, identity uniqueness, economic readiness, or deployment approval from green tests.

## P0-A — Live consumer fail-closed, RT5-15 closure

Provide a **state-changing** Tier-2 consumer operation guarded by `EffectiveTierGate.requireEffectiveTier(wallet,2)` and prove, by signed receipts and unchanged persistent state:

1. Legitimate 5025 canonical XP + achieved Tier 2: privileged Tier-2 operation succeeds exactly once.
2. With **only `XPPolicyV03` paused** and Registry active, same privilege operation reverts; no privilege counter/log mutation. After policy unpause, operation succeeds only if XP and achieved Tier are still valid.
3. With **only Registry paused** and policy active, operation reverts; independent registry unpause restores valid operation.
4. With both paused, every unpause ordering still denies access until **both** are live.
5. After revoking 2000 valid earned XP: canonical 5025→3025, achieved Tier stays 2, effective Tier drops to 1 and Tier-2 operation reverts.
6. Unknown account and Tier-0 requests do not turn unavailable Registry/policy into a permissive default.
7. Economic/integration consumers currently in the repo must be enumerated; flag every consumer that authorizes by direct Core `getIdentity().tier` rather than an effective entitlement gate.

Pass requires explicit expected revert selectors where available, signed transaction status, supply/balance/allowance invariants after failures, and no stale cached Tier.

## P0-B — RT5-19 adversarial mutation oracle (three required mutants)

For each mutant inject a **temporary, isolated, compilable** contract change without modifying reviewed production sources and run the exact matching positive/negative baseline on the mutated version:

- `M1_NO_ATTESTOR_SIGNATURE`: bypass `SignatureChecker.isValidSignatureNow`. Negative evidence cases must use **authorized attestor, eligible existing recipient, valid timestamps/rule/quota** and a deliberately invalid signature, so a rejection is impossible before signature validation.
- `M2_SKIP_VALID_XP_SUBTRACTION`: bypass `validEarnedXP -= grant.amount` on revocation of a truly finalized VALID grant. Assert exact 5025→3025 canonical XP, unchanged achieved Tier, lowered effective Tier and no economic privilege.
- `M3_BYPASS_EFFECTIVE_TIER`: bypass the effective Tier consumer check (not its test). After revoked XP or pause, forbidden state-changing consumer operation must be rejected.

Report each as `KILLED`, `SURVIVED`, or `INVALID`. Compiler or harness failure is **INVALID**, never a kill. Only three valid, KILLED mutants close RT5-19. Attach mutation patches/hashes and logs to CI evidence.

## P1-A — ERC-1271 contract signer adversarial matrix, RT5-18

Use a locally deployed signer implementing `isValidSignature(bytes32,bytes)` with selector `0x1626ba7e` and switchable valid, wrong-magic, short-return, reverting, and gas-exhaustion-like behaviors. Ensure the attestor is separately rule-authorized and verifier is distinct.

- Valid contract signer: signed claim accepted once, PENDING only, finalization respects delay.
- Wrong magic, short return, revert or gas failure: each transaction fails, zero grant/XP, replay nullifiers/quota untouched.
- EOA happy path remains unchanged.
- No fallback to EOA recovery for contract signers.
- If gas-heavy signer can deny an individual submission, document availability limit; do not claim universal liveness.

## P1-B — Dependency vulnerability disposition

Review pinned transitive `tmp@0.0.33` and `ws@8.17.1`, their precise parent dependencies and advisories. First seek compatible supported upgrades **without** breaking Safe/EthereumJS fixture or reproducible lockfile; otherwise document reachability, threat boundaries, compensating CI controls, exception owner and expiration/revisit trigger. `npm ci --ignore-scripts` and SHA-512 integrity are not vulnerability scans.

## P0/P1 CI evidence and independent review

- All tests must run using committed lockfiles and pinned GitHub Actions, read-only permissions and `persist-credentials:false`.
- Use checked-out repo contracts, not a remote base ref or a home-directory copy. Verify HEAD/merge tree and artifact manifest hashes for the **exact audited head**.
- Archive signed receipts and **meaningful state oracles**, not just PASS labels. Record test count, overlap, coverage limitations, compiler, chain/hardfork, package lock hash, Safe artifact provenance.
- Repeat all existing 11 Genesis/Path, 4 RT5-15 and 5B 15+15 tests; do not count duplicate smoke scenarios as distinct guarantees.
- Independent read-only Codex security review must inspect exact commits and artifact ZIP digests. No merge of this new PR without separate explicit authorization.

## P2 — Real-world OctoPush × OctoPass event-source truth

On-chain signatures only identify an authorized signer; they do not prove activity. Define **one** auditable OctoPush action with a stable source event ID, verifiable server-side audit trail, binding to a consented OctoPass wallet, canonical evidence digest, independent evidence reviewer, conflict-of-interest and appeal policy, durable revocation/retention and privacy controls. Integrate one mock-to-real verified roundtrip: event → attestation → claim PENDING → independently reviewed VALID → effective entitlement, plus fraud/dispute/revoke.

Do **not** attach substantive economic privileges or claim public-network security until real source truth, governance and privacy gates are independently accepted.

## Explicit acceptance status

| Gate | Current status |
| --- | --- |
| PR #11 RT5-15 regression and locked 5B evidence | PASS for reviewed narrow scope; conditional merge |
| Real Tier-2 privileged consumer and pause/unpause ordering | OPEN |
| RT5-19 three valid killed mutants | OPEN |
| ERC-1271 adversarial signer receipts | OPEN |
| Dependency review/remediation or signed bounded exception | OPEN |
| Real-world OctoPush proof-source assurance | OPEN |
| Independent audit/release approval | OPEN |

**No public-network deployment, merge, or release authorization is granted by this file.**
