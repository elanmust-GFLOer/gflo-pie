# DESIGN-004 — Reviving the Paths, bound to the OctoPush plans

Date: 2026-11-19 · Status: **D1–D4 accepted by the maintainer; contracts (§7.1) implemented and tested locally**; OctoPush side (§7.2) and pilot (§7.3) not started. Nothing deployed, not audited.

## 0. Principle

> **Money buys capacity, never standing.**

The OctoPush pricing page already says *"Contribution beats speculation"*. GFLO turns that into a
rule: a paid OctoPush plan buys product capacity (credits, models, rooms). It **never** buys a
GFLO Path, tier, XP or agent slot. The flow goes only one way: **verified contribution →
effective tier → OctoPush plan benefits.** That is how lapsed members can be brought back: they can
*earn* Builder or Orchestrator instead of paying for it.

## 1. Why the mapping fits

`PIECoreIgnitionV01` already treats the Paths as a ladder: `getCurrentPath = Path(tier + 1)`,
i.e. Tier 0 = Sovereign, Tier 1 = Reformer, Tier 2 = Praxis. The OctoPush plans are a ladder
of the same length, and the agent counts already line up:

| GFLO Path (effective tier) | OctoPush plan | OctoPush agents | GFLO agent slots (Phase A) |
|---|---|---|---|
| Sovereign (0) | Free | 1 | 1 |
| Reformer (1) | Builder | unlimited | 3 |
| Praxis (2) | Orchestrator | unlimited + automation | 10 |

OctoPush "agents" (in-app chat agents) and GFLO agent slots (bound ERC-8004 agents with
reputation) stay **different things**. A paid Builder plan gives unlimited chat agents. It does not
give more reputation-bearing agents.

## 2. Path meanings, restated for the ladder

The original texts (Sovereign = consistency, Reformer = social impact, Praxis = building, +20%)
are kept in spirit, and ordered as a progression from self, to work, to coordinating others:

| Path | Meaning | Rule family (evidence) |
|---|---|---|
| **Sovereign** — self-mastery | You own your identity and show up consistently | completed OctoPass identity; sustained weekly activity (consistency, not peaks); Genesis 25 XP |
| **Reformer** — creative transformation | You build and change things with your agents | **accepted OctoPush Rooms task reviews on your own shared tasks**; merged PR with green CI (DESIGN-003 rule) |
| **Praxis** — orchestration in practice | You coordinate agents and other people's work | verified work of your bound ERC-8004 agents; reviews of others' tasks that survive the challenge period; stricter caps |

**Praxis +20%** becomes a bounded multiplier, applied only to rules of the member's *selected*
Path and always inside the existing caps (daily / weekly / per operator). It rewards focus and
can never raise the speed limit.

## 3. First real evidence source: OctoPush Rooms task review

`database/migrations/20261115093000_room_task_reviews.sql` (OctoPush) already provides most of
what RED TEAM 6D3 found missing:

- server-side `review_room_task` (SECURITY DEFINER): the author can never review their own task;
  the reviewer must be a current room member; confidential content is refused;
- `content_fingerprint` = SHA-256 of the exact task text, which maps directly to `evidenceDigest`;
- the version is bound to the displayed agent response (`Agent response · <version>`);
- one irreversible review per task (`UNIQUE room_message_id`), outcome `accepted | changes_requested`.

**Proposed bridge:** an OctoPush server outbox turns each `accepted` review into one EAS
attestation. The signer is a dedicated bridge key (a Safe for high-value rules), and the attestation
uses `eventId = review id` and `evidenceDigest = content_fingerprint`. The recipient is:
- the task author's wallet (human XP, Reformer rule), or
- the agent wallet, if the response came from a bound ERC-8004 agent (agent XP, DESIGN-003).

**Gaps to close before the pilot:**
1. Room membership is chosen by the author, so a friend-only room can rubber-stamp. Required
   countermeasures:
   - reviewer ≠ author is already enforced;
   - the reviewer must hold a PIE identity with effective tier ≥ 1;
   - a per reviewer → author weekly cap in the bridge, the same idea as `ATTESTER_OPERATOR_WEEKLY_CAP`;
   - accepted reviews from `open` rooms only, in the first pilot.
2. Wallet linkage: OctoPass user → explicit wallet signature (blueprint step 1), never email alone.
3. `changes_requested` gives no XP and no penalty: honest review must stay cheap.

**Do not** turn the OctoPush North Star metric ("OctoPartnR decisions issued") into an XP source.
Decisions cost credits, credits can be bought, and an XP source that money can feed is plutocratic.

## 4. Earned plans (the re-engagement mechanism)

`effectiveTier` is live and revocable, so an earned plan is too:

- **Reformer (Tier 1) → Builder features**, for as long as Tier 1 holds.
- **Praxis (Tier 2) → Orchestrator features**, for as long as Tier 2 holds.
- Losing the tier (revoked XP, strike-out) downgrades the earned plan automatically. A paid plan is
  unaffected, because it is a separate purchase.
- OctoPush reads only `EffectiveTierGateV01` (fail-closed). On RPC or registry errors, earned
  benefits pause; nothing is granted on error.

**Credits are real compute cost.** An earned plan should unlock the *features* (agents, private rooms,
automation) and a bounded **earned credit allowance**, not the full paid quota (decision D2).

## 5. Rethinking the GFLO bond

Today a tier step needs XP **and** a GFLO burn through Ignition. If GFLO can be bought, money becomes
a precondition of standing, which contradicts §0. Proposal:

- **Tier steps: XP + time, no purchase.** Reaching the threshold, then holding it for N days
  (e.g. 30) of sustained, capped activity. Patience cannot be bought.
- **GFLO becomes a capacity token, not a status token.**
  - It is earned by reviewers from a pre-funded, fixed-supply treasury (blueprint Phase 3).
  - It can be spent on OctoPush credits (money and tokens buy compute).
  - It never converts into XP, tiers or slots.
  - Ledgers stay separate, as already required: OctoPush credits ≠ PIE XP ≠ GFLO.
- Ignition (burn-for-tier) is retired for new deployments, or kept as an optional, purely symbolic
  step that grants nothing (decision D3).

## 6. Decisions needed

| # | Decision | Recommendation |
|---|---|---|
| D1 | Mapping Sovereign–Free, Reformer–Builder, Praxis–Orchestrator with the meanings in §2 | **Accept** (it matches the existing ladder and agent counts) |
| D2 | What an earned plan includes | Features in full, plus an earned credit allowance of about 30% of the paid quota (Builder ≈ 500, Orchestrator ≈ 2 000 per month), funded as a growth cost |
| D3 | GFLO burn for tier steps | **Replace with XP + time**; GFLO becomes the capacity/reviewer token |
| D4 | First evidence source | **OctoPush Rooms accepted review**, open rooms only, through an EAS bridge with the caps in §3 |

## 7. Implementation outline (after D1–D4)

1. **Contracts:**
   - `PathRuleRegistry`: maps `ruleId → Path` and holds the bounded selected-Path multiplier;
   - human XP resolver V02: reads it, keeps every V01 cap;
   - `TierProgressionV01`: XP threshold plus time-in-tier, replacing Ignition for new deployments.
2. **OctoPush:**
   - server outbox for accepted reviews;
   - wallet-link signature;
   - an earned-plan check through `EffectiveTierGateV01`, shown on `/pricing` and OctoPass as
     "earned" vs "paid".
3. **Pilot (Phase C):** Base Sepolia, open rooms only, 5–20 members, measured against the North Star.

## 8. Implementation status (contracts, §7.1)

| Contract | Role |
|---|---|
| `PathRuleRegistryV01` | `ruleId → Path`, write-once, governance only; `effectiveAmount` adds +20% on the member's selected Path and reverts for unassigned rules |
| `XPAttestationResolverV02` | V01 plus Paths: unassigned rules are refused, the bonus counts against every cap, and the granted amount is stored per grant (exact revocation). Trust level is judged on the base amount |
| `TierProgressionV01` | `start` at the threshold (Tier 1 = 1 000, Tier 2 = 5 000 XP, the selected goal required); `complete` after 30 days only if XP is still at the threshold **and** grew by ≥ 200; anyone can cancel a qualification that fell below; binds to PIE core instead of the burn-for-tier Ignition. No token, balance or payment is read |

Tests: `tests-v02/test/PathsProgression.cjs`, 10 tests, no token anywhere. The full suite is 66 passing.
Mutation gate (each applied alone): bonus on every Path, unassigned rules allowed, rewritable
assignment, caps ignoring the bonus, base amount stored, no sustained-growth check, no waiting
period, no threshold re-check, goal not required, cancelling a valid qualification. **All 10 killed.**

Open for §7.2: OctoPush review outbox and EAS bridge, wallet-link signature, earned-plan check on
`/pricing` and OctoPass.
