# ADR-0001 — Separate GasFeeLoop staking from canonical PIE XP

**Status: Accepted by project owner (Option B), 2026-10-17.**

## Decision
GasFeeLoop is retained as a possible **economic / staking / utility** component. Staking GFLO, stake size or a stake multiplier **must not grant or multiply canonical GFLO PIE XP**, and must not itself confer reputation, effective tier, reviewer status or governance influence.

Canonical PIE XP remains available only through independently verified, rule-bound contributions and the authorized attestor + verifier flow of the pilot XPPolicyV03 (subject to its documented limitations). Application credits, DailyScope progress, GFLO token units and PIE integer XP are different accounting domains.

The legacy `GasFeeLoop.sol` stays untouched and is **not deployable as a compatible PIE XP writer**. Any successor requires a separate specification, code and independent verification.

## Evidence and motivation
- Legacy [GasFeeLoop.sol](https://github.com/elanmust-GFLOer/GasFeeLoop-/blob/main/contracts/GasFeeLoop.sol) calls `IPIECore.addXP(address,uint256)`, uses `10**18` scaling and a stake-dependent multiplier.
- Experimental [PIECoreIgnitionV01](https://github.com/elanmust-GFLOer/gflo-pie/blob/feature/pie-core-v0.2/contracts/PIECoreIgnitionV01.sol) does not expose `addXP`.
- Experimental [XPPolicyV03](https://github.com/elanmust-GFLOer/gflo-pie/blob/feature/pie-core-v0.2/contracts/XPPolicyV03.sol) uses authorized signatures, integer XP and `PENDING / VALID / REVOKED`.
- Sovereign Constitution v0.1: `Contribution before Recognition`, `Trust cannot be reduced to token ownership`, `Influence through Contribution`, `Utility before Speculation`.

## Implementation consequences
1. Neither cookR nor OctoPartnR may forward stake multipliers, unverified app activity or self-reported task completion as canonical XP.
2. Do not deploy or patch existing GasFeeLoop in-place or silently migrate historical XP.
3. Any future gas sponsorship/paymaster scheme is a **new module and separate policy**, not the definition of the legacy GasFeeLoop.
4. Real GFLO reviewer rewards, if introduced, must be capped, pre-funded and detached from XP.
5. Phase 1: read-only XP / achievedTier / effectiveTier adapter. GasFeeLoop redesign stays behind its own compatibility and economic test gate.

## Validation status
Decision documented; RED TEAM 6A static regression suite added as a source-compatibility gate. No EVM transaction executed by this ADR, and no security audit or network deployment implied.
