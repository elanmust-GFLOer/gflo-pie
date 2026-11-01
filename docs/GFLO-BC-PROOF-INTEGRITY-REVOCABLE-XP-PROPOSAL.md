# GFLO — B+C Proof Integrity & Revocable XP Proposal (DRAFT)

Date: 2026-10-15
Branch: `feature/pie-core-v0.2`
Status: Architecture proposal only; no Solidity implementation or passing tests claimed.
Motivation: `docs/GFLO-REDTEAM4-VERIFIER-TRUST-FINDING-2026-10-15.md`.

## Problem statement / threat model

Current `XPPolicyV02.awardXP(account, ruleId, eventId, evidenceHash)` trusts a registered verifier to report events truthfully. Unique opaque hashes, replay nullifiers and daily/weekly caps limit repetition/rate but do not verify whether an event occurred. With valid verifier rights, one compromised verifier can grant fabricated XP until higher Tier is reachable, then subsequent role revocation leaves earned XP and irreversible Tier progression intact. Safe governance threshold does not ensure evidence authenticity.

## Minimal proposed B+C

### C — independent evidence-source attestation

Define a fixed proof schema, bound to the target chain and policy:

```text
GFLOEvidence {
 chainId,
 verifyingPolicy,
 schemaVersion,
 subjectWallet,
 ruleId,
 eventId,
 evidenceDigest,
 sourceAttestor,
 issuedAt,
 validUntil,
 nonce
}
```

- `subjectWallet` binds the proof to the PIE identity. `ruleId` binds proof to an allowed reward amount, claim limit, cooldown and trust scope.
- `evidenceDigest` commits to a document/proof held off-chain (do not publish sensitive raw evidence on-chain).
- `eventId` is unique across the relevant issuer and rule; keep cross-wallet, cross-policy replay/nullifier rules explicit.
- A signer distinct from the submitting XP verifier attests to an independently checked source event. Separate key material and organizational separation are preferred; distinct wallet addresses alone do not establish independence.
- Bind `chainId` and `verifyingPolicy` in an EIP-712 domain; encode unused nonces and expired proofs as invalid. EIP-712 alone does **not** supply replay prevention.
- Wallet signatures from EOAs can be verified via recover/ECDSA. If accepting contract signers, explicitly support ERC-1271 `isValidSignature` and restrict to approved on-chain signers.
- For EVM ecosystems with trusted deployments of Ethereum Attestation Service (EAS), use schema UID, recipient, attester, expiry, revocation status, `refUID` and optional resolver. EAS does not establish event truth automatically; authorisation + independent external checking are still required. An EAS revocation controlled by a rogue issuer cannot be relied on as the only fraud response: the GFLO internal ledger needs a distinct revocation/invalidity mechanism.
- Start with a single well-defined evidence class (e.g. verified source event from a controlled demonstrator) rather than an unrestricted general-purpose oracle.

### B — revocable earned-XP ledger

Each grant is a distinct record:
```text
Grant {
 claimId,
 recipient,
 ruleId,
 sourceEvidenceUID,
 eventId,
 evidenceDigest,
 amount,
 claimedAt,
 finalizesAt,
 status, // PENDING, VALID, REVOKED
 verifier,
 sourceAttestor
}
```

State transition `UNSEEN -> PENDING -> VALID`; either `PENDING -> REVOKED` or `VALID -> REVOKED` on proven fraud/policy-defined invalidation. `REVOKED` cannot become `VALID` again without a NEW attestation and explicit appeal path.

- Verify attestation and source allowlist BEFORE creating a pending grant; do not add pending XP to canonical spendable/ignition XP.
- A bounded challenge period (pilot candidate 72h; not final) permits disputes before `VALID`. Expiry after grant finalization is distinct from reversal policy; define whether the attestation must still be live at ignition and later entitlement checks.
- Maintain O(1) aggregate `validEarnedXP[wallet]`. Finalization adds exactly the grant amount; revocation of `VALID` subtracts exactly once. `REVOKED` grants do not count. Do NOT loop over all grants in `totalXP`.
- Global used event/evidence identifiers remain consumed after revocation, preventing easy recycling. Normal rolling day/week caps apply to issuance; revocation should not automatically restore quota in same epoch.
- Use event-specific reason code and evidence digest for revocation; publish procedure and allow appeal. Do not place personal source data or personally identifying information on-chain.
- Each claim's `claimId`, attestation source and signer need typed/context-bound replay and signature checks; a verifier cannot substitute another account/rule.

### Tier / burn / economic invariants

The deployed pilot `PIECoreIgnitionV01` stores `tier` and its `GFLOIgnitionV01` burns irrevocably. XP subtraction alone will NOT undo a previous Tier.

**Recommended semantics before production:**

- `achievedTier` (existing Core Tier) = irreversible historical record, not direct bearer of protected privileges.
- `effectiveTier` computed/checked by a dedicated `TierEntitlementGate`: require active canonical XP, valid awards and unpaused policy/Registry, then derive at most:
  - 0 if validXP < 1000,
  - 1 if 1000 <= validXP < 5000,
  - 2 if validXP >= 5000,
  constrained by already achieved tier.
- All economic/governance/access consumers MUST use `effectiveTier` gate instead of direct `getIdentity().tier`. Otherwise revocation is cosmetic.
- Invalidating XP can immediately suspend future Tier-associated privileges; past token burn is NOT automatically refunded or minted back. Refund/restitution policy, if any, must be funded explicitly and decided in advance (fixed supply is preserved).
- A bounded pending/challenge finality delay before paying burn fee reduces fraudulent Tier entry but cannot guarantee justice once rewards have settled.
- The effectiveTier system must FAIL CLOSED on paused/inactive/untrusted Registry, with explicit availability and recovery policies.

### Safe authority and operational controls

Keep one Safe 2-of-3, no new governance multi-sig:
- Add/revoke permitted rule-scoped evidence source attestators (with timelocked policy changes where appropriate).
- Pause new grants and optionally canonical XP reads to suspend Ignition.
- Freeze/dispute/revoke specific grants through publicly logged bounded procedures. The authority to revoke individual grants is high-impact and must be transparent, with signer diversity; arbitrary revocation is governance abuse.
- Existing `XPPolicyV02.setPaused` blocks NEW awards only; `TrustedXPSourceRegistryV02.setPaused` blocks canonical XP reads/ongoing Ignition but does not erase existing Tier.

### Immutable binding / migration warning

`TrustedXPSourceRegistryV02` is **one-time activation**; `PIECoreIgnitionV01.bindIgnition` is **one-time binding**. A deployed instance pinned to the old XP Policy cannot be safely updated just by changing a GitHub contract. Before testnet, use fresh deployment:
`PIECoreIgnitionV01 (or successor) -> XPPolicyV03 + evidence validation + revocation -> TrustedXPSourceRegistryV02 (fresh) -> GFLOIgnitionV01 (or successor) -> TierEntitlementGate`.
The existing Core Tier getter must not be used to grant economic privileges. There is no v0.2 identity migration promise.

## Design alternatives / critical tradeoffs

1. **Minimal pilot:** evidence attestator signs EIP-712, verifier independently submits reward, rule-bound authorized attestator registry, pending/finalized/REVOKED ledger, `TierEntitlementGate`. Fewest moving parts and no dependency on EAS chain deployment; requires off-chain evidence-review process.
2. **EAS-integrated:** pin deployed EAS contracts/schema and verify on-chain attestations with expiry/revocation/resolver; adds interoperability but gas/dependency and deployment constraints. EAS does not make fake evidence true. GFLO needs its own invalidation logic even if attester refuses to revoke EAS attestation.
3. **Simple acknowledgement of trusted verifiers:** no redesign, define XP as discretionary attestation and do not attach material rights or trust-based economics to Tier. Does not address the stated RED TEAM 4 threat if privileges matter.

## Minimal acceptance tests (RED TEAM 5)

1. A verifier without independent evidence attestation is rejected, even if authorized.
2. A valid proof is bound to the recipient, event, rule, chain, signer, expiry, and policy; replay across wallets/chains/policies fails.
3. A valid but fraudulent claim cannot be declared *objectively* fraudulent on-chain without a trusted source of truth; show manual dispute/decision boundary explicitly.
4. PENDING XP does not satisfy ignition thresholds.
5. Finalization adds the promised XP exactly once; revocation subtracts once and preserves replay nullifiers.
6. Cap accounting still holds after revocation and around UTC epoch boundaries.
7. A revoked grant lowers canonical XP and dynamically lowers `effectiveTier`, while `achievedTier` remains historical.
8. Token `totalSupply` and user balance do not increase on revocation: past burns are not silently refunded.
9. Non-revoked valid claims remain usable; unauthorized pause/revocation fail.
10. Signed receipts show failure status + rollback; mutation tests intentionally bypassing attestation check/revocation/gate must be detected.

## Required user/product choices before coding production semantics

- Are tiers historical achievements or permanently guaranteed privileges? **Recommendation**: historical `achievedTier` + dynamic `effectiveTier` rights.
- Should a cheated-but-paying user receive a token refund if grant later revoked? **Recommendation**: no automatic token re-mint (fixed supply), optional funded compensation process separate from core protocol.
- What proves a real-world event? A chain cannot infer truth solely from hashes or signatures; select at least one concrete source type and independent attestator process.
- Which EVM network? EAS availability varies; do not hardcode network addresses until target chain selected.

## Primary references

- EIP-712 structured signed data: https://eips.ethereum.org/EIPS/eip-712 (explicitly excludes replay protection itself).
- ERC-1271 signature validation for contract accounts: https://eips.ethereum.org/EIPS/eip-1271.
- EAS schema and revocable attestations: https://docs.attest.org/docs/tutorials/create-a-schema
- EAS attestation fields: https://docs.attest.org/docs/tutorials/make-an-attestation
- RED TEAM 4 finding: `docs/GFLO-REDTEAM4-VERIFIER-TRUST-FINDING-2026-10-15.md`.
