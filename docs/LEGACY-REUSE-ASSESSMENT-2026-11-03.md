# Legacy code reuse assessment (2026-11-03)

**Status:** assessment only. Nothing here is deployed, audited or decided beyond what
DECISION-001 and cookR ADR-0001 already state. Nothing is deleted: legacy repos stay as
they are; legacy files in this repo moved to `archive/legacy-v3/`.

Question: which parts of the legacy GFLO code (GasFeeLoop-, gflo-clean, gflo-backend,
Sepolia v3 contracts) are worth reusing, given the v0.2 line that works today?

Rule used: **reuse ideas and tested patterns, rewrite code.** No legacy contract is patched
or redeployed in place (DECISION-001, ADR-0001).

## Summary

| Area | Legacy source | State today | Verdict |
| --- | --- | --- | --- |
| Ignition | GasFeeLoop- `contracts/core/GFLOIgnition.sol` (Sepolia `0x414D…`) | Always reverts on chain; burns the "treasury" half too | **Already rewritten** → `GFLOIgnitionV01` (exact burn + supply-delta check, tested). Open item: optional treasury split as `transferFrom`, never burn |
| Burn | `MockGFLOToken` (no burn) / PIECore `burn()` calls | Broken on chain | **Already rewritten** → `GFLOFixedSupplyV01.burnFrom`, no mint |
| Staking / GasFeeLoop | GasFeeLoop- `contracts/GasFeeLoop.sol` (Sepolia `0xd2C9…`) | Works as a plain stake/unstake vault; XP path owner-only and cap unit bug | **Rewrite as a new module** with no XP sink (ADR-0001). Candidates below |
| Path registry | gflo-clean `UserPathRegistry.sol` (AccessControl, path-switch cooldown, path distribution view) | Never deployed | **Idea source**: cooldown + distribution view could inform a later `PIECore` version; do not import as-is |
| Path modules | gflo-clean `Sovereign/Reformer/PraxisModule.sol` | Stubs / memecoin deploy helper | Archive; out of V1 scope |
| ElanMust.AI (`em_ai`) | gflo-clean `ai/elanmust_ai.py` (Groq chat + constitution prompt) | Works as a CLI chat | **Reuse as advisory assistant only**; prompt must be updated (see below) |
| AI modules | gflo-clean `ai/xp_fraud_detector.py`, `mev_guard.py`, `dao_rationality.py` | 1-line empty classes | Nothing to reuse; write fresh if needed (off-chain triage, never an attestor) |
| Backend identity API | gflo-backend `flask_api.py` (`compute_identity`, `@tier_required`) | Reads retired v3 PIECore | **Reuse the pattern**, repoint to `PIECoreIgnitionV01` + `EffectiveTierGateV01` (gate on *effective* tier) |
| Faucet | gflo-backend `gflo_faucet.py` (transfer from pre-funded wallet, JSON claim log) | Paused | Reusable shape for a fixed-supply token; needs durable storage + rate limits before re-enable |
| XP scheduler | gflo-backend `gflo_scheduler.py` | Calls `getUserInfo` and `batchRewardXP`, which the deployed GasFeeLoop does not have; uses `rewardXP` (stake-based XP, rejected) | **Do not reuse**; superseded by XPPolicyV03 attest/finalize flow |
| Python sim | GasFeeLoop- `core/` (`reward.py` etc.) | Toy "regen" counter | Archive |

## Staking: what a rewrite could be (ADR-0001 compliant)

**Clarification from the project owner (2026-11-03):** staking was conceived as **GFLO token staking**
(an economic/utility feature of the token), not as an XP mechanism. It is **deferred**: it will be
specified and activated when it is next in line, after the v0.2 deployment. The options below are
input for that later specification, not a decision.

Shared constraint: stake **never** writes or multiplies PIE XP, tier, reviewer status or governance weight by itself.

1. **Attestor/reviewer bond (recommended first).** Attestors lock GFLO as a slashable bond;
   a successful revocation in XPPolicyV03 for a provably bad attestation can slash it to the
   pre-funded review pool. This puts economic weight behind the weakest documented link
   (attestor collusion) without letting money buy reputation.
2. **Time-lock commitment vault.** Plain lock/unlock with a minimum duration; emits events only.
   Useful later as an input to a separately specified governance modifier
   (e.g. `log(1+stake)/k`, capped), never as XP.
3. **Gas sponsorship / paymaster** — the original "gas fee loop" idea. A new module with its own
   policy (ADR-0001 §3), not a GasFeeLoop patch.

Reusable code from the legacy contract: the `_sqrt` helper and the stake/unstake accounting
shape. Not reusable: the multiplier → XP path, `10**18`-scaled XP cap, owner-only `rewardXP`.

## ElanMust.AI: required prompt corrections before reuse

The current system prompt in `elanmust_ai.py` still states legacy rules that contradict
current decisions:
- "PHASE 3 - GasFeeLoop: xpGain = min(baseXP * sqrt(gfloStaked), epochCap)" → rejected by ADR-0001.
- "GFLO = non-transferable deterministic state" → GFLO is a transferable fixed-supply ERC-20; XP is the non-transferable part.
- Also: `gflo_ai_core.py` uses OpenAI while `elanmust_ai.py` uses Groq; pick one client.

Boundary (same as cookR/OctoPartnR): model output is advice only — never a signature,
attestation, evidence oracle or payout authority.

## Suggested order

1. Deploy + verify the v0.2 canonical line on Sepolia (current blocker; script ready in `deploy-v02/`).
2. Repoint the backend identity API to v0.2 (`effectiveTier`).
3. When staking is next in line: specify GFLO token staking (options above) with its own test gate.
4. Update the ElanMust.AI prompt to the v0.2 constitution.
