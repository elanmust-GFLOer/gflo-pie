# GFLO Compatibility Gate v0.1 — GasFeeLoop × PIE × Sovereign

Status: DRAFT / Source-backed architecture decision proposal
Date: 2026-10-17
Target repository: GFLO.Octo_PIE-cookR
No contract modification or deployment authorized by this document.

## Direct source references

- [GasFeeLoop.sol](https://github.com/elanmust-GFLOer/GasFeeLoop-/blob/main/contracts/GasFeeLoop.sol): `IPIECore.addXP(address,uint256)`, `EPOCH_XP_CAP = 1000 * 10**18`, `baseXPPerTx = 1 * 10**18`, owner-triggered `rewardXP` and `batchRewardXP`, stake-based multiplier.
- [PIE Core pilot](https://github.com/elanmust-GFLOer/gflo-pie/blob/feature/pie-core-v0.2/contracts/PIECoreIgnitionV01.sol): `getIdentity`, fixed genesis XP, ignition-only Tier transition; no `addXP` ABI.
- [XPPolicyV03](https://github.com/elanmust-GFLOer/gflo-pie/blob/feature/pie-core-v0.2/contracts/XPPolicyV03.sol): EIP-712 signed evidence, authorized verifier, independent permitted attestor, integer XP `uint16` rule award 25–1000, canonical `uint64 totalXP`, PENDING/VALID/REVOKED, replay nullifiers and quota.
- [Sovereign development baseline](https://github.com/elanmust-GFLOer/GFLO-Sovereign-v0.1-/blob/main/docs/DEVELOPMENT-BASELINE.md): existing issues with public XP paths in older code, XP scaling incompatibility and stake-based inequality.

## Findings

**COMPAT-01 / CRITICAL**: The legacy GasFeeLoop XP interface does not match the fresh PIE Core. Direct integration will fail to call `addXP` on PIECoreIgnitionV01, or require replacing canonical accounting.

**COMPAT-02 / CRITICAL**: The legacy 18-decimal XP amount is inconsistent with XPPolicyV03 integer points and caps. Do not auto-divide or truncate without explicit system-wide migration policy; do not transfer legacy XP histories silently.

**COMPAT-03 / HIGH, constitutional**: Stake-based XP boosts may convert capital advantages into Tier progression and effective privilege. Requires explicit justification against Constitution's contribution/reputation/influence separation.

**COMPAT-04 / HIGH, trust**: Legacy GasFeeLoop owner can call `rewardXP` with arbitrary base amount, bounded by an epoch cap, but the contract does not independently validate contribution. An owner role does not establish real-world evidence truth.

**COMPAT-05 / MEDIUM, operational**: Legacy `setPieCore`/`setGfloToken` are owner adjustable. The integration must not assume immutable links or canonical token/source identity.

## Proposed decision — NOT RATIFIED

1. **No direct GasFeeLoop → PIECore or XPPolicyV03 award path.**
2. Keep existing GasFeeLoop source as historical/experimental; do not patch live deployments in place.
3. Define a separate GasFeeLoop successor use case: transparent treasury accounting / participation cost subsidies / capped service credits. Any staking yield must be assessed separately and must not determine verified contributions or reviewer selection.
4. Canonical XP enters only by a validated source event, independently authorized rule attestor, verifier, challenge period, and `XPPolicyV03`. Community review alone does not prove activity truth.
5. Distinguish GFLO token balances, application credits, gas payments, personal DailyScope metrics and integer PIE XP. No conversion unless a separately accepted specification says so.
6. Scope first integration to read-only `wallet → canonical XP → achievedTier → effectiveTier`. Fail closed on RPC/registry errors. No new mint, stake, treasury payout or user-data migration.

## RED TEAM 6 — proposed acceptance tests

- RT6-01: Legacy `addXP` dependency cannot write to fresh PIE Core.
- RT6-02: 18-decimal XP amount cannot be silently accepted as integer PIE XP.
- RT6-03: Unauthorized GasFeeLoop owner/substitute cannot obtain canonical XP without an independently checked evidence signature.
- RT6-04: Valid stake without real contribution yields zero canonical XP.
- RT6-05: Duplicate source activity ID or copied evidence cannot grant XP twice.
- RT6-06: Revoked XP immediately reduces active effective Tier and blocks Tier-guarded consumer access.
- RT6-07: Registry/RPC error must not grant permissions; no fallback to historical Tier.
- RT6-08: Reward pool payout cannot mint GFLO and cannot be performed by OctoPartnR output alone.
- RT6-09: Wallet link is bound to user session, nonce, chain, audience and expiry; replay and cross-account impersonation rejected.
- RT6-10: Reviewers are independently authenticated and conflict-filtered; a 2-of-3 majority without trustworthy source evidence is insufficient.

## Decision still needed

Should a future GasFeeLoop grant **only bounded gas/service subsidies and staking utility**, with **no XP multiplier**? If accepted, split a successor `GasFeeSponsorship`/utility proposal from the immutable historical contract; reserve direct PIE progression strictly for verified contribution.

## Change control

This file is an architecture/acceptance draft. No tests were run for this document; no external deployments or Solidity changes are claimed.
