# Pilot Trust Policy (draft)

**Date:** 2026-11-06
**Status:** Draft. Becomes binding when Elan Must approves it and fills in the
role holders below.
**Scope:** The canonical v0.2 Ignition stack on the home chain (DECISION-002).

This document says who may grant, attest, revoke and pause XP during the pilot,
and what limits apply. Anything not listed here is not authorised.

## 1. Roles

| Role | Contract / mechanism | Holder | Key type |
| --- | --- | --- | --- |
| Governance | Owner of `XPPolicyV03`, governance of `TrustedXPSourceRegistryV02`, `bindingAuthority` of `PIECoreIgnitionV01` | **TBD**: Safe address | Safe, 2-of-3 |
| Deployer | Creates contracts only | **TBD** | Hot EOA with no on-chain role after deployment |
| Verifier (issuer) | `XPPolicyV03.setVerifierRole(_, 2)`; calls `submit` | **TBD** | EOA used only by the worker/checker |
| Attestor | `XPPolicyV03.setAttestor(ruleId, _, true)`; signs EIP-712 proofs | **TBD** | Separate key from the verifier |
| Snapshot signer | Future `PIETierMirrorV01` only | Not appointed during the pilot | Separate from all of the above |

Separation rules:
1. The verifier and the attestor must be different keys held by different
   people. The activity pilot (PR #20) asserts `attestor != verifier`; this
   policy adds that they must also be different people.
2. No Safe owner is also the verifier or the attestor.
3. The deployer's key holds no role after deployment. The deploy script refuses
   to run if deployer equals governance.
4. Any snapshot signer added later must not hold any other role.

## 2. Limits

| Parameter | Pilot value | Where enforced |
| --- | --- | --- |
| XP per rule claim (`amount`) | **TBD**, 25–1000 (`MIN_REWARD`/`MAX_REWARD`). The activity pilot uses 1000, a test value. Amounts ≥ 500 need verifier role 2 | `registerRule` |
| Claims per rule per account (`maxClaims`) | **TBD**; the pilot uses 3 | `registerRule` |
| Daily / weekly XP cap | 1500 / 3000 (`DAILY_CAP`/`WEEKLY_CAP`) | On-chain constants |
| Challenge window before `finalize` | 3 days (`CHALLENGE_PERIOD`). Anyone may call `finalize` after it | On-chain constant |
| Tier 1 / tier 2 burn | **TBD** in GFLO base units | `GFLOIgnitionV01` constructor (immutable) |
| Initial GFLO supply and recipient | **TBD** | `GFLOFixedSupplyV01` constructor (immutable) |
| Allowed rules | One rule ID per OctoPush task type, listed in an appendix | `registerRule` |

Burn amounts and supply are immutable. Changing them means deploying again.

## 3. Revocation and pause

- **Who revokes:** only governance (the Safe). `XPPolicyV03.revoke` is
  `onlyOwner` and works on both PENDING and VALID grants. Revocation needs a non-zero reason.
- **When:** forged or duplicate evidence, a compromised attestor or verifier,
  or a checker verdict that turns out wrong.
- **Compromised attestor:** governance calls `setAttestor(ruleId, attestor, false)`
  for every rule, then revokes that attestor's pending grants.
- **Emergency stop:** `XPPolicyV03.setPaused(true)` stops new XP.
  `TrustedXPSourceRegistryV02.setPaused(true)` makes `EffectiveTierGateV01`
  and Ignition fail closed for everyone.
- Every revocation and pause is logged in `docs/evidence/` with tx hash and reason.

## 4. Known gaps this policy accepts for the pilot

1. **Issuer–attestor collusion is not prevented on-chain.** With two
   colluding keys, any XP up to the caps can be granted. The only mitigations
   are separation rule 1, the caps, the challenge window and revocation.
2. `finalize()` does not re-check that the attestor is still allowed, and
   anyone can call it once the window ends. When you remove an attestor, revoke
   its pending grants within the 3-day window.
3. The registry's `proposePolicy` → `activatePolicy` takes two transactions,
   but one governance actor sends both. Treat the Safe threshold as the only
   independent check.
4. Pilot task IDs come from a trusted registration. They do not prevent Sybil attacks.

## 5. Change control

Changing a role holder, rule or limit requires:
1. a PR that edits this document and states the reason,
2. approval by Elan Must,
3. the matching Safe transaction, with its hash recorded in the PR.

## Approval

- [ ] Role holders filled in
- [ ] Limits filled in
- [ ] Approved by Elan Must — date: ____
