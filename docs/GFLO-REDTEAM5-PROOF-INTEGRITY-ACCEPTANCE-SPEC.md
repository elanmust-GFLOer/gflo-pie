# GFLO RED TEAM 5 — Proof Integrity, Revocable XP, and Effective Tier
Date: 2026-10-15
Branch: `feature/pie-core-v0.2`
Status: **SPECIFICATION ONLY / NOT IMPLEMENTED / NOT TESTED**
Decision: B+C with **A semantics** — historical `achievedTier` and current `effectiveTier`.

## 0. Security objective and non-goals

**Objective:** A verifier alone must not mint trusted XP out of opaque evidence hashes; grant issuance requires authorized independent attestation; invalid awards can be revoked exactly once; current economic/access entitlements automatically reflect valid canonical XP, even when already-achieved Tier and burns remain historical.

**Non-goals:** On-chain code cannot certify that a real-world event happened merely from signatures or hashes. This design does not guarantee Sybil resistance, independently controlled organisations, dispute fairness, refunds, or recovery of economic benefits already consumed. Pilot only: no deployment/security audit claim.

Existing RED TEAM 4 finding: `docs/GFLO-REDTEAM4-VERIFIER-TRUST-FINDING-2026-10-15.md`.
Decision draft: `docs/GFLO-BC-PROOF-INTEGRITY-REVOCABLE-XP-PROPOSAL.md`.

## 1. Compatibility boundary — existing GFLO contracts

- `PIECoreIgnitionV01.Identity.tier` is existing achieved Tier (0..2). It does not decrease. Do not rename/reinterpret existing ABI in place; call `achievedTier = getIdentity(wallet).tier`.
- `XPPolicyV02.earnedXP` is immediately credited and cannot be revoked. A new `XPPolicyV03` is required for B+C.
- `TrustedXPSourceRegistryV02` validates `pie()`, `owner()` and `totalXP()`; `XPPolicyV03` must preserve those three ABI methods if Registry V02 is reused in a **fresh deployment**.
- `GFLOIgnitionV01` only checks canonical XP at burn time. Economic/access control consumers MUST use an `EffectiveTierGate` instead of raw Core tier; `GFLOIgnitionV01` alone cannot revoke already granted rights.
- `TrustedXPSourceRegistryV02` pins its first active policy. `PIECoreIgnitionV01.bindIgnition` is one-time. No live migration or in-place upgrade is assumed.
- Safe v1.5.0 2-of-3 remains owner, Registry governance and Core binding authority; it authorises issuers and correction decisions but does not attest real-world truth by itself.

## 2. Proposed minimal contracts

### 2.1 `XPPolicyV03` (new)

Retain one `owner` controlled by the Safe, a rule table, verifier roles, caps and cooldowns; add approved independent attestor identities, signed evidence verification, per-grant state and valid XP aggregates.

```solidity
enum GrantStatus { NONE, PENDING, VALID, REVOKED }
struct Grant {
 address recipient;
 bytes32 ruleId;
 bytes32 eventId;
 bytes32 evidenceDigest;
 bytes32 evidenceId;
 address verifier;
 address attestor;
 uint16 amount;
 uint64 claimedAt;
 uint64 finalizesAt;
 GrantStatus status;
}
mapping(bytes32 => Grant) public grants;
mapping(address => uint64) public validEarnedXP;
mapping(bytes32 => bool) public usedEvent;
mapping(bytes32 => bool) public usedEvidence;
```

The schema is illustrative. Use collision-resistant `claimId` and typed-data hashing: source attestor's EIP-712 typed message commits to `chainId`, `verifyingContract`, `schemaVersion`, `recipient`, `ruleId`, `eventId`, `evidenceDigest`, unique nonce, issuance and expiration. Domain separation and explicit nullifiers are both required. Consider `ERC-1271` for contract signers and `ECDSA` for EOAs. Rule-scoped signer authorization is checked **at claim time**, not retroactively at `finalize`, unless explicit global invalidation/freeze is activated.

State machine:
- `NONE -> PENDING`: verifier submits with independently signed evidence, role and configured attestator (must differ from verifier), valid bounded timestamps, unconsumed event/evidence/nonce, eligible recipient, rule and quota.
- `PENDING -> VALID`: challenge delay elapsed, proof not expired as defined in policy, award not disputed/frozen, exactly-once finalization adds to `validEarnedXP`.
- `PENDING -> REVOKED`: previously uncounted claim remains uncounted.
- `VALID -> REVOKED`: Safe-governed reasoned correction subtracts exactly once from `validEarnedXP`; duplicate revocation fails. Re-issue requires a **new** claim and evidence under explicit appeals policy, not resurrection.
- `REVOKED -> VALID`: forbidden in pilot.

Use **O(1)** aggregate for `totalXP(wallet)`; do not iterate claims. Genesis XP remains untouched at 25 for a created identity. All claim epochs and rule caps are enforced *on claim creation*, not credited finalization. Revocation does **not** reset used nullifiers or daily/weekly cap consumption. Week = `block.timestamp / 7 days` (Thursday UTC epochs), not rolling 168h.

For the pilot the mandatory attestor is a distinctly authorized **key and evidence-review role** from the submitting verifier. Two addresses owned by one malicious operator can collude; threat remains an off-chain trust assumption. The schema must define one actual source-of-truth evidence class before production. Do not publish raw sensitive evidence on-chain.

### 2.2 `EffectiveTierGateV01` (new)

Read historical Core identity (exists, achieved `tier`) and **valid canonical** XP from a registry/policy whose identity, active status and expected binding are verified. In any read failure or pause, the *authorization* path MUST revert or explicitly deny; never grant Tier based on cached XP.

```text
xpTier = 0 if xp < 1000
       = 1 if 1000 <= xp < 5000
       = 2 if xp >= 5000
effectiveTier = min(achievedTier, xpTier)
```

The numeric Tier returned may be 0 for an existing identity with valid XP below 1000, but **an inactive Registry is NOT semantically equivalent to Tier 0**. Consumer authorization must reject when Registry is unavailable even for Tier-0-dependent special privileges. Prefer `requireEffectiveTier(wallet, minimumTier)` which fails closed, rather than an ambiguous default.

`achievedTier` remains historical, not an entitlement token. A past GFLO burn is irreversible. If a valid award is later revoked, no automatic GFLO mint, burn refund, or backward Core tier mutation occurs. Explicit funded compensation, if any, is outside this MVP.

### 2.3 No extra governance layer

The current Safe 2-of-3 authorizes attestor allowlisting, pause and revocation policy. No second multi-sig, no custom Quorum, no arbitrary oracle token. Include reason-code and event logs for every revocation plus appeal process. This role is high privilege and may be abused; ledger correctness cannot prove process fairness.

## 3. Mandatory RED TEAM 5 assertions

Severity levels: BLOCKER = must pass before limited public/economic privilege use; HIGH = before testnet release decision; DESIGN = documented product decision.

| ID | Severity | Adversarial case | Exact test oracle |
|---|---|---|---|
| RT5-01 | BLOCKER | Registered verifier submits no independent signed attestation | Signed TX status=0, exact error, zero grants, no XP |
| RT5-02 | BLOCKER | Attestor is not authorized for this `ruleId` | status=0, unchanged nullifiers/XP |
| RT5-03 | BLOCKER | Attestor is the verifier or shares the same forbidden on-chain role | status=0 for same-address / role check; **organizational independence is not provable on-chain** |
| RT5-04 | BLOCKER | Change recipient, rule, eventId, evidence digest or claim nonce after signature | each status=0; no event, XP or grant |
| RT5-05 | BLOCKER | Replay identical evidence by another wallet / verifier, policy or chain | status=0; correct domain, nullifier and target checks; deploy independent fixture for second chain/policy |
| RT5-06 | HIGH | Expired attestation and issued-in-future bounds | status=0; no XP |
| RT5-07 | BLOCKER | Proper attestation and honest verifier create claim | exactly one `PENDING`; valid XP unchanged |
| RT5-08 | BLOCKER | Ignite at threshold using only PENDING XP | status=0; GFLO `balanceOf`, `totalSupply`, allowance and Tier unchanged |
| RT5-09 | BLOCKER | Premature finalization, then valid finalization at configured boundary | before expiry status=0; after expiry exactly one add; second finalize status=0 |
| RT5-10 | BLOCKER | Revoke PENDING and revoke VALID, then double-revoke | valid XP changes 0 or -amount exactly once; invalid state transition status=0 |
| RT5-11 | BLOCKER | Reuse revoked `eventId`, evidence or nonce | status=0; original replay nullifiers remain spent |
| RT5-12 | HIGH | Daily 1500 / weekly 3000 caps with pending, finalization, revocation, fixed UTC boundaries | cap enforced when pending claim created; revoke does not free cap; no overflow or window escape |
| RT5-13 | BLOCKER | Earn 5025 valid XP, achieve Tier 2, then revoke 2000 earned XP | achieved Tier=2; valid canonical XP=3025; effective Tier=1; privileged Tier-2 call rejected |
| RT5-14 | BLOCKER | Reverse XP after successful token burn | `totalSupply` and user balance do not increase, no implicit refund/mint |
| RT5-15 | BLOCKER | Registry pause/invalid codehash/owner or attestation policy pause during entitlement read | privilege operation fails closed, no stale cached Tier fallback |
| RT5-16 | BLOCKER | Unauthorized verifier, attestor, revoker, non-Safe governance | exact custom error / status=0; unchanged persistent state |
| RT5-17 | HIGH | Honest non-revoked claim and rightful Tier still function | no false negative; valid signed receipts and expected events |
| RT5-18 | HIGH | Signature from authorized EOA vs allowed ERC-1271 smart account; invalid magic value and reverted signer | only valid signer paths work; no approval by fallback on call failure |
| RT5-19 | BLOCKER | Mutate away attestor verification, revocation subtraction, or effectiveTier enforcement | all three injected mutants KILLED by matching security oracle; compiler failure=INVALID, not KILLED |
| RT5-20 | DESIGN | Fraud dispute or collusion outside chain | explicitly flag as UNPROVEN: cryptographic signer check does not establish real-world truth or organizational independence |

Expected outcomes must be checked via actual `runTx` receipts (successful and failed statuses), expected custom error selector where extractable, logs and before/after state snapshots; compare *both* outer sender nonce (spent on failed signed transaction) and Safe nonce (rolled back if inner Safe call reverts). At least one full Tier 1→2→effectiveTier 1→privilege denied scenario is mandatory.

## 4. Test fixture and rollback invariants

Use official Safe v1.5.0 artifacts, OpenZeppelin 5.4.0 ERC20Burnable, synthetic distinct owners, attestor, verifier, user and adversary. Use EthereumJS 10.1.3 `runTx` with explicitly constructed block timestamp fixtures and deterministic EIP-712 digest signing. Pin the repo commit and compiler artifacts. Set `t0`, `t0+period-1`, `t0+period` for challenge deadline; establish precisely whether equality means allowed.

A negative TX proves rejection only when the expected *cause* is observed, not merely any revert: inject independent faults and verify test sensitivity. `status=0` + no logs is necessary but insufficient; assert failure selector where surfaced and unchanged grant/nullifiers/validEarnedXP/Core/Tier/supply/allowance.

Do not use mocks of Safe signatures for the release gate. Never use real accounts or funds.

## 5. Missing decisions / implementation gates

1. **Evidence source:** define an actual off-chain activity/proof class and independent attestor lifecycle; no generic source of objective truth exists from hashes.
2. **Challenge period:** proposed 72h only, not finalized. Define clock, expiry, pauses and dispute events.
3. **Validity and revocation authority:** conditions, who can file evidence and who adjudicates, appeal and transparency policy. Revocation by Safe alone is censorship risk.
4. **Entitlement consumers:** enumerate any services and governance power depending on Tier; all must use `EffectiveTierGateV01`. Without consumers the end-to-end privilege rollback cannot be shown.
5. **Target network:** chainId, whether to use EAS or purely EIP-712 signatures, smart-account signer support, cost cap.
6. **Genesis and tier activation:** new deployments only; old one-time bindings and registry pinning cannot be changed in place. Avoid migrating state without separate plan.
7. **Tokenomics:** illustrative Tier 1=1, Tier 2=2 GFLO are test fixtures, not final token allocation/burn fee decisions.

## 6. Measurable exit criteria

- `RT5-01` through `RT5-19` exact oracles pass in positive/negative, receipt-level local tests; `RT5-20` explicitly documented as unproven.
- No survivors for at least three targeted integrity mutations; invalid cases counted separately.
- A full signed scenario shows **5025→3025** valid XP upon two 1000-XP grant reversals while historical tier 2 and burned supply stay unchanged, effective tier drops to 1 and a privileged operation is denied.
- No claims of objective proof of off-chain facts, audit, mainnet readiness, or completed security gate before actual outputs.
- Record test runner commit, solc and dependency versions; produce a red-team report linking failed/successful receipt logs.

## 7. Next implementation slice (recommended)

Implement a minimal `XPPolicyV03` with **one concrete proof schema** and one independently authorized attestor plus a compact `EffectiveTierGateV01` proof-of-concept. Test `RT5-01,04,07,08,09,10,13,14,15` first; keep original 195/195 local scenarios as regressions. Do not rewrite old `XPPolicyV02` in place.

## 8. References / protocol compatibility

- EIP-712 typed structured signing: https://eips.ethereum.org/EIPS/eip-712
- ERC-1271 smart-contract signature validation: https://eips.ethereum.org/EIPS/eip-1271
- Ethereum Attestation Service reference: https://docs.attest.org/
- Project report: `docs/GFLO-BC-PROOF-INTEGRITY-REVOCABLE-XP-PROPOSAL.md`
- Project RED TEAM 4 finding: `docs/GFLO-REDTEAM4-VERIFIER-TRUST-FINDING-2026-10-15.md`

**Specification status: proposal, not implemented.** Always distinguish independent off-chain validation from on-chain cryptographic signature verification.
