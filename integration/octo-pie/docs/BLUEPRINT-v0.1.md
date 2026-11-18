# GFLO.Octo_PIE-cookR — Integration Blueprint v0.1

Status: design proposal; 2026-10-15. Not implemented.

## Context

**OctoPush** provides app-level verified login and workflows. **OctoPartnR** provides intent analysis, risk triage, specialist selection and human approval coordination. **GFLO PIE** provides an on-chain wallet identity, attestations, revocable XP and calculated Tier rights. **GFLO Sovereign** names the proposed shared participation and incentive experience.

Do not consolidate the independent databases or deploy Solidity from this integration repository automatically.

## Component roles

| Component | Owns | Must not do |
|---|---|---|
| OctoPass / Supabase | App profile, authentication, privacy preferences | Treat email session as wallet ownership |
| Wallet-link adapter | Nonce challenge, cryptographic link verification, revocation | Read/export wallet private keys |
| Activity event adapter | Signed, unique, server-side Builder completion event | Reward client-generated clicks |
| OctoPartnR | Risk review, route to evidence review, summarize dissent | Solely approve XP or transfer GFLO |
| Reviewer coordinator | Eligible pool, auditable assignment, decisions, appeals | Assume randomized wallets are distinct humans |
| Attestation service | Evidence verification and rule-scoped EIP-712 claim | Sign anything simply because an AI said so |
| XPPolicyV03 | PENDING → VALID / REVOKED XP, caps, nullifiers | Certify off-chain truth from signature alone |
| EffectiveTierGateV01 | Active Tier authorization and fail-closed reads | Grant rights using raw historical Core tier |
| Reviewer treasury | Deterministic and capped GFLO disbursement | Mint new tokens; reward blind majority conformity |

## End-to-end request

1. OctoPass user authenticates; optional wallet linkage uses explicit signed, one-time domain-bound challenge with expiry and revocable mapping.
2. Server issues immutable event ID + evidence digest only for a verifiable Builder outcome. Define one evidence class before building XP rewards.
3. Claim enters `RECEIVED`; OctoPartnR proposes GREEN / YELLOW / RED / BLACK with reasons. Risk label is advice, never a grant authorization.
4. A deterministic eligibility policy assigns three reviewers through independently auditable randomness. Reviewers cannot be selected by claimant.
5. Reviewers submit individually authenticated yes/no/abstain decisions with evidence references, time limits and conflict disclosures. A 2/3 vote is NOT independent proof of truth.
6. Attestor independently checks source event and review outcome, then signs chain-bound EIP-712 proof with rule, event, recipient wallet, nonce and validity.
7. Authorized verifier submits to freshly deployed XPPolicyV03. PENDING XP is not canonical spendable XP. After review/challenge period, finalize or revoke.
8. EffectiveTierGate calculates real-time entitlements from canonical valid XP and achievedTier; pause fails closed.
9. In a future, separately approved phase, compensated review earns GFLO transferred from pre-funded treasury after quality/dispute resolution, independently from XP.

## Data contracts (proposed, no migrations here)

`wallet_links(user_id, wallet_address, chain_id, nonce_hash, verified_at, revoked_at)`

`activity_events(event_id, user_id, activity_type, occurred_at, evidence_digest, issuer, idempotency_key)`

`proof_claims(claim_id, event_id, recipient_wallet, rule_id, status, evidence_digest, reviewer_panel_id, attestation_uid, chain_tx_hash)`

`review_assignments(panel_id, claim_id, reviewer_id, selection_proof, conflict_status, deadline)`

`review_votes(panel_id, reviewer_id, vote, reason_digest, signed_at)`

`reward_ledger(entry_id, reviewer_id, claim_id, reward_base_units, status, approval_reference, tx_hash)`

Supabase RLS: owner-visible identity data, tightly scoped review assignments, no service credentials or private claim contents in frontend. Backend must enforce policy on all writes.

## Web3 compatibility

Pilot typed evidence signatures: [EIP-712](https://eips.ethereum.org/EIPS/eip-712); explicit replay protection and domain separation. Contract-wallet support is a separate [ERC-1271](https://eips.ethereum.org/EIPS/eip-1271) gate. EAS remains optional pending selected chain. Existing Safe v1.5.0 2-of-3 controls pilot policy/admin; it is **not** decentralized adjudication.

## Unresolved decisions

Target EVM network, evidence class, verified eligible reviewer identities, lottery randomness source, payment criteria, reward pool funding, minimum dispute/appeal guarantees, chain RPC and tokenomics. No external rewards until those are resolved.
