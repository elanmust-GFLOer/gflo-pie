# GFLO XP Policy v0.2 — Draft for protocol review

**Status: PROPOSAL, NOT IMPLEMENTED.**

## Existing accepted invariants
- Identity exists before earning XP; Genesis starts with 25 XP.
- XP is non-transferable and cannot be directly purchased with GFLO.
- Choosing a Path goal does not advance earned Tier.
- Sovereign (Tier 0) → Reformer (Tier 1) → Praxis (Tier 2), with no skipping.

## Proposed minimal award flow
1. A challenge is defined with a stable `challengeId`, rule/version and bounded reward.
2. A designated verifier establishes completion off-chain or on-chain from checkable evidence.
3. A tightly scoped authorized awarder submits `identity`, `awardId`, `challengeId`, `amount`.
4. The XP Policy validates authorized caller, existence of identity, reward amount and award replay.
5. The PIE ledger credits XP only after validation and emits an audit event.

## Security requirements
- `awardId` must be globally unique within the relevant chain/contract and bound to the recipient, challenge and claim; reject reuse.
- Enforce per-award and per-identity/epoch caps with deterministic epoch semantics and explicit failure behavior.
- Restrict awarders to least privilege; revoke/rotate compromised keys; do not grant unlimited authority to AI.
- Avoid a generic unrestricted `addXP(address,uint256)` interface callable by a broad admin.
- Clarify whether `xp` is lifetime cumulative, and how rate limits and epoch rewards relate to it.
- Include domain separation if using off-chain signatures (chainId, verifying contract, nonce, expiry and schema version).
- External verifiers and challenge data are trust assumptions, not automatically proven on-chain.
- Contract-based accounts and multiple wallets can represent one person; wallet-level limits do not solve Sybil attacks.

## Open design decisions (before Solidity implementation)
- Which evidence type first: owner-operated allowlisted verifier, signed claims, or on-chain proof?
- XP caps: maximum per event, per epoch and lifetime; whether Genesis 25 contributes to each.
- Epoch length and reward-reset rules.
- Contract upgrades and authority model (multisig, timelock, immutable roles).
- Identity recovery / wallet migration and relation to replay protections.

## Proposed test acceptance criteria
- Reject missing identity, unauthorized awarder, reused awardId, zero/excess rewards and expired signatures if signatures are used.
- Enforce caps at boundary values, including distinct identities and repeated claims.
- Show award cannot advance Tier directly or bypass GFLO ignition.
- Validate events, revert behavior, and accounting invariants with stateful, adversarial tests.

No XP Policy contract, deployment, or security validation is implied by this document.
