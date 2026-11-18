# GFLO.Octo_PIE-cookR roadmap

## Phase 0 — present
- [x] Standalone integration repository established.
- [x] Blueprint v0.1 documentation scaffold.
- [ ] Independent risk review and source snapshots pinned to commits.

## Phase 1 — read-only bridge
- [ ] Explicit EVM wallet-link signature protocol, revoke/unlink.
- [ ] Display canonical XP + achievedTier + effectiveTier through reliable chain reader.
- [ ] Error handling: chain/Registry unavailable => no privileges.
- [ ] Unit tests for wrong-wallet and replay.

## Phase 2 — review proof pilot
- [ ] Define one Builder completion source event.
- [ ] OctoPartnR advisory semaphore integration, no autonomous XP authority.
- [ ] Independent, auditable human review selection with conflict filtering.
- [ ] Server-side attestor signs only verified events.
- [ ] PENDING/VALID/REVOKED state UI and dispute process.

## Phase 3 — economics
- [ ] Pre-funded fixed-supply GFLO reviewer rewards with bounded payment policy.
- [ ] Explicit payout receipts, idempotency, no self-awarded token mints.
- [ ] Sybil, collusion, slashing-free pilot incentives and balance sustainability test.

## Phase 4 — testnet
- [ ] Pick chain, RPC, Safe addresses and verified deployment artifacts.
- [ ] Run RED TEAM 6 and independent security review.
- [ ] Limited consenting users; measured event acceptance, false positives, gas and UX.
