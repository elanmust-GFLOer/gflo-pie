# RED TEAM 6C — source-authenticity boundary acceptance specification

Status: DRAFT — 2026-10-17. No test results claimed.

## Purpose
RT6A (6/6 source compatibility, user executed) and RT6B (4/4 signed local EVM, user executed) established that the legacy GasFeeLoop XP-writing path does not integrate with fresh PIECoreIgnitionV01. RT6C must test a different problem: whether an attestor/verifier **can still manufacture source claims** that XPPolicyV03 accepts. This is a trust-boundary assessment, not a restatement of prior 5B tests.

## Critical observation
The XPPolicyV03 `Proof` includes `recipient, ruleId, eventId, evidenceDigest, nonce, issuedAt, validUntil`. Its `submit` checks authorized verifier and rule attestor, an EIP-712 signature, source uniqueness, timing, identity, rule and quota limits. **It does not cryptographically verify the factual content represented by `evidenceDigest`, nor does it have a built-in GasFeeLoop source adapter.** A colluding or compromised trusted pair can attest fabricated activity unless an independent source-validating authority rejects it before the attestor signs.

This remains an intentional open trust gap; no test may be labeled a security success merely because the function returns PENDING for a valid signature.

## Required new signed-EVM scenarios

| ID | Scenario | Expected result |
|---|---|---|
| RT6C-01 | Stake GFLO in legacy GasFeeLoop; no PIE attestation | PIE canonical XP does not change |
| RT6C-02 | Unauthorized GasFeeLoop actor calls XPPolicyV03 submit with arbitrary source evidence | REVERT, no XP or grant state change |
| RT6C-03 | Authorized verifier with unauthorized attestor presents fabricated stake claim | REVERT |
| RT6C-04 | Authorized attestor + verifier sign arbitrary unique stake claim as if it were a legitimate source | **Threat demonstration**: claim can become PENDING without independently proving reality; record as open trust finding, not vulnerability fixed |
| RT6C-05 | Valid source proof held PENDING then finalized | Only finalized XP counts; source authenticity remains an off-chain assumption |
| RT6C-06 | Revoked valid XP can no longer authorize EffectiveTier-protected consumer | Fail closed; historical achieved Tier is not a privilege override |
| RT6C-07 | Replay event, evidence digest or nonce across attempts | REVERT and no second grant |
| RT6C-08 | App or AI issues an 'approve' instruction absent permitted attestor's valid signature | REVERT |

## Acceptance rules
- Show receipt status, nonce use, no logs for expected failed outer transactions, before/after canonical XP and pending/finalized grant state.
- Clearly separate *tested rejection of unauthorized submitters* from *accepted signed but factually false claims*. The latter is a critical architectural limitation, not a green security guarantee.
- Run in a separate local EthereumJS fixture with deterministic synthetic keys; PIN actual versions and source commits.
- No privileged signer credentials exposed; no real chain, treasury, wallet or OctoPush user data.
- Existing RED TEAM 5A/5B2 fixtures may be reused as regression baseline, but do not count overlapping scenarios as novel security properties.

## Design consequences before OctoPush or DailyScope XP
1. Create a claim-source registry binding approved issuer public keys, typed source event schema and source-specific idempotency keys.
2. Verify trusted server-issued event origin **before attestor signs**; the chain cannot know whether a personal task was actually completed.
3. Separate unverified self-reflection / daily presence from externally provable contribution.
4. AI (including OctoPartnR) may propose review routes but may not issue on-chain approval or treasury payouts.
5. Prototype candidate: one verified OctoPush Builder completion event. Do not reward clicks or stake balance directly.

Next implementation: build RT6C signed EVM runner as a *new* test, with explicit expected-positive-fraud demonstration and one source authenticity policy check. No existing Solidity changes.
