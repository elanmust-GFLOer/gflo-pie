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
| P0-A signed Tier-2 test consumer / pause-unpause ordering | **CI PASS in dedicated RED TEAM 5C fixture** — 8 added cases on top of 15 baseline, run 39494975013; production consumers and full receipt archival still OPEN |
| RT5-19 three targeted, compiling mutants | **CI 3 KILLED / 0 SURVIVED / 0 INVALID**, run 39496380124, artifact 12298845667; independent review and wider mutational coverage OPEN |
| P1-A ERC-1271 local contract signer matrix | **CI PASS**: six added cases, 5D 21/21 incl. 15 baseline, run 39498428774; independent evidence review OPEN |
| P1-B targeted transitive tmp/ws advisory remediation | **CI PASS** on clean locked npm; tmp 0.2.7, ws 8.21.0, run 39499577547 and Genesis 39499577548. Broader dependency audit and independent review still OPEN |
| Real-world OctoPush proof-source assurance | OPEN |
| Independent audit/release approval | OPEN |

**No public-network deployment, merge, or release authorization is granted by this file.**

## P0-A interim CI evidence (2026-10-20)

The immutable original RT5B/1 and RT5B/2 scripts have not been modified. A separate
`scripts/gflo-redteam5c-tier2-pause-consumer.mjs` extends the 15-case RT5B/2 fixture
with eight signed P0-A checks covering independent policy/Registry pauses,
both unpause orders, unauthorized unpause, unknown identity and active Tier-2
state-changing consumer authorization.

- GitHub Actions PR run: [39494975013](https://github.com/elanmust-GFLOer/gflo-pie/actions/runs/39494975013), job 118877567656: **SUCCESS**.
- RED TEAM 5B/1: 15/15; RED TEAM 5B/2: 15/15; new 5C: 23/23 (15 duplicated existing + 8 new).
- Evidence artifact ID: `12297511738`. A verified original artifact ZIP hash and independent replay are **not yet part of this interim result**.
- This is **fixture-specific** evidence, not production access-control deployment, full consumer enumeration, all raw receipt traces or protocol audit.
- Next: independently review the new assertions and exact CI artifact, inventory all Tier consumers, then implement RT5-19 three-target mutation kill gate.

The final Verified Contribution Core security gate remains **OPEN** pending RT5-19, ERC-1271, dependency risk disposition, source-event truth, and independent review.

## P0-B interim RT5-19 execution (2026-10-20)

- GitHub Actions: [39496380124](https://github.com/elanmust-GFLOer/gflo-pie/actions/runs/39496380124), job `118882388118`, completed **SUCCESS**, pinned `npm ci` environment.
- Mutation gate: `tests-redteam5b/rt519-mutation-gate.cjs`. Injects exact one-source edits into the in-memory Solidity compiler input of disposable generated runners only; reviewed `contracts/` and original `scripts/` remain untouched. A compiler marker and a selected oracle-stage marker are mandatory for `KILLED`, and the expected assertion must fail.
- M1 authorized attestor, preexisting eligible recipient and valid time/rule, deliberately invalid EOA signature → compiled mutated policy accepts invalid signature; original signed-transaction rejection oracle fails: **KILLED**.
- M2 bypasses subtraction on the Praxis rule for two revoked finalized grants; original full-path canonical XP 5025→3025 assertion instead reads **5025**, so the state oracle fails: **KILLED**.
- M3 skips dynamic Gate enforcement after the first legitimate consumer use; policy-only pause must deny a previously used state-changing Tier-2 consumer; receipt status oracle detects unauthorized success: **KILLED**.
- The initial mutation-gate run `39496112995` yielded **2 KILLED / 1 misclassified SURVIVED / 0 INVALID** because the M2 log matcher incorrectly expected an XP value of 4025. Its detailed assertion actually reported `5025n !== 3025n`. The harness regex was corrected without changing the mutation or underlying security test, and the final run returned **3 KILLED / 0 SURVIVED / 0 INVALID**.
- Evidence ZIP artifact ID: `12298845667`; GitHub-reported ZIP SHA-256: `9e3994cfabe272f38ab268cb4181ac88737b5e9d007c31eee13402b96311da92`. Independently rehash and inspect the **final** ZIP before external audit or merge.
- The 5B/1, 5B/2 and 5C regressions also ran before the mutation gate on this same job. These are duplicated fixtures and are not independent properties. Mutation score 3/3 applies **only** to three explicitly seeded mutants; independently verify that an alternate mutant or unexpected earlier failure would not satisfy the matcher.
- Remaining gates: adversarial ERC-1271 fixture, dependency advisories/remediation, source-event authenticity, broader consumer inventory, complete receipt archival, independent audit and release approval.

**This is P0-B fixture-level CI evidence, not comprehensive security certification.**

## P1-A ERC-1271 signed local EVM evidence (2026-10-20)

- Exact test code commit: `5ac91b07b91ce288cb3ced0618a9bb4e1bf98df6`.
- [GitHub Actions 39498428774](https://github.com/elanmust-GFLOer/gflo-pie/actions/runs/39498428774), signed-evidence job `118889422909`: **SUCCESS**.
- New test-only mock: `contracts/test/GFLOERC1271AdversarialMock.sol`. Five selectable signer responses: valid magic, wrong magic, short ABI return, explicit revert, high gas consumption (bounded transaction).
- Separate signed runner: `scripts/gflo-redteam5d-erc1271-signers.mjs`, using unchanged 5B/1 fixture setup and six additional scenarios. CI result **21/21**, of which 15 are repeated baseline and six are P1-A checks.
- Invalid cases: each denied with a failed signed transaction; no receipt logs, no earned XP or canonical total increase, no quota/nullifier changes and no token supply change. The attempted gas-heavy case consumed 985243 gas of the configured 1000000 limit; this demonstrates bounded rejection, not general resistance to signer-driven availability denial.
- Positive case: rule-authorized **contract** attestor different from the verifier returns the ERC-1271 magic, one claim PENDING with no immediate XP credit; duplicate rejected; a separate valid claim finalizes after the configured 3-day delay exactly once.
- Immutable `XPPolicyV03`, Trusted Registry, EffectiveTierGate, core and original RED TEAM 5B scripts were not modified.
- RED TEAM 5B/1, 5B/2 and 5C prerequisites plus RT5-19 3/3 mutations remained successful. The separate Genesis/Path workflow also succeeded.
- CI artifact ID: `12299081466`; GitHub-reported ZIP SHA-256: `ca50db6d4d3c804f418b883e80df5d23d110540c98cbf418ebd55793b6bc7cc1`. A later independent read-only auditor must download, rehash, inspect detailed assertions and verify the exact reviewed source tree.
- Limits: the signer mock deliberately has a fixture controller and is **not** a deployed smart wallet, passkey verifier or organizationally independent evidence source. Contract signer success verifies the return value, not real-world activity. High gas spend may deny an individual claim. No public network transaction or new authentication product is proven.

Remaining security gates: pinned transitive dependency advisories, real-world OctoPush evidence-source assurance, exhaustive economic consumer inventory, independent Codex review and explicit merge/release authorization.

## P1-B — targeted dependency remediation evidence (2026-10-20)

Root cause paths from the *previous* committed isolated lockfile:

- `solc@0.8.34 → tmp@0.0.33` (known symlink/path handling advisories).
- `ethers@6.15.0 → ws@8.17.1` (published memory-handling / denial-of-service advisories).

Remediation retained the existing exact top-level Solidity, EthereumJS, ethers, OpenZeppelin and Safe fixture versions. It inserted npm overrides for `tmp@0.2.7` and `ws@8.21.0`, generated a reviewed candidate lockfile in separate **non-acceptance** bootstrap workflow [39499454807](https://github.com/elanmust-GFLOer/gflo-pie/actions/runs/39499454807), and committed the candidate package JSON + complete npm lockfile.

- Updated isolated package: `tests-redteam5b/package.json`; `overrides = {"tmp":"0.2.7","ws":"8.21.0"}`.
- Updated lock: `tests-redteam5b/package-lock.json`; resolved `tmp@0.2.7`, `ws@8.21.0`, SHA-512 integrity metadata, 37 package entries.
- Main CI [39499577547](https://github.com/elanmust-GFLOer/gflo-pie/actions/runs/39499577547): **SUCCESS** using committed `npm ci --ignore-scripts --no-audit --no-fund`; 5B/1=15/15, 5B/2=15/15, 5C=23/23, RT5-19=3 KILLED/0 SURVIVED/0 INVALID, ERC-1271 5D=21/21. GitHub artifact ID `12299476261`, GitHub-reported ZIP SHA-256 `beba831891107089443142bbcf89ad37cb0660c4f177f1d2f4231bfffeb23e38`.
- Separate [Genesis/Path CI 39499577548](https://github.com/elanmust-GFLOer/gflo-pie/actions/runs/39499577548): **SUCCESS**, 15/15; artifact ID `12299102756`, GitHub-reported ZIP SHA-256 `7486ca4c7537029b52181954427e95dd3adc925e8ec824b696d39a5662f0a6ff`.
- The one-time non-acceptance bootstrap workflow was removed after both strict CI jobs completed.

Limitations: the updated lockfile and regression CI show that the targeted updates install and run successfully; they are **not** a full vulnerability scan, supply-chain attestation or claim that all transient advisories were removed. A PR review must independently verify exact final-head checkout, package-lock hash, dependency resolution, current advisories, ABI/bytecode test coverage and ZIP digests. The subsequent cleanup/documentation commits require fresh exact-head checks before the full gate receives signoff.

**P1-B scope: targeted patches + regression evidence PASS. Full GFLO Verified Contribution Core release-security gate remains OPEN.**
