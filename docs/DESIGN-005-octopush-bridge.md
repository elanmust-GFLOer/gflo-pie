# DESIGN-005 — OctoPush ⇄ GFLO bridge (DESIGN-004 §7.2)

Date: 2026-11-19 · Status: **design**, nothing implemented. Lovable task prompts:
`docs/octopush-bridge/LOVABLE-PROMPTS.hu.md`.

## 0. Goal and boundaries

An **accepted OctoPush Rooms task review** becomes **verified GFLO XP** for the task author
(Reformer rule `reformer.octopush-room-review-accepted`). The author's **effective tier** then
becomes an **earned OctoPush plan** (Reformer → Builder features, Praxis → Orchestrator features).

| Party | Holds | Never does |
|---|---|---|
| **OctoPush** (Lovable, Supabase) | facts: reviews, wallet links, room visibility; an **issuer key** that signs each event | sign EAS attestations, write XP, read money as reputation |
| **GFLO bridge** (gflo-backend worker) | an **EAS attester key** (level 1, Reformer rule only); chain reads | trust a request it cannot verify; offer a generic "sign this" endpoint |
| **Chain** (Base Sepolia, pilot) | EAS, `XPAttestationResolverV02`, `TierProgressionV01`, `EffectiveTierGateV01` | — |

Two keys, two parties: a forged OctoPush event cannot be attested without the issuer key, and a
stolen issuer key cannot write XP without the bridge, which re-checks the rules on chain. Both
keys are **new testnet keys**. The leaked deployer mnemonic is never used.

## 1. Prerequisite

`database/migrations/20261115093000_room_task_reviews.sql` is **checked in but not applied**
(OctoPush roadmap; the code handles `migration_missing`). Applying it is step L0. Without it there is
no evidence source.

## 2. Wallet link (reuse, do not invent)

Reuse the reviewed Pilot 0C/0D protocol (`docs/OCTOPUSH-OCTOPASS-PIE-PROOF-BRIDGE-V01.md` §8):

- **SIWE (EIP-4361)** proves EOA control; a **separate EIP-712 `BindingConsent`** carries consent.
- New realm, so signatures cannot move between realms:

| Field | Value |
|---|---|
| EIP-712 name | `OctoPush GFLO Binding` |
| version | `1` |
| chainId | `84532` (Base Sepolia, pilot) |
| salt | `keccak256("gflo:octopush:binding:v1")` |
| verifyingContract | none |

- Scope `gflo.xp.recipient`, `consentVersion = "octopush/1"`. This is the **first durable binding**:
  consent text must say plainly that accepted reviews will be attested publicly to this address.
- Nonce: server-issued, 32 random bytes; TTL 5 minutes; one profile + chain = one active link.
  Revocation bumps an **epoch** that invalidates every older challenge (PB01/PB02 regression rules).
- **EOA only** (65-byte low-s ECDSA). ERC-1271, counterfactual and delegated wallets fail closed.
- A wallet link proves control, not humanity, XP or tier.

## 3. Review outbox (OctoPush, Postgres)

Inserted **in the same transaction** as an `accepted` review, by `review_room_task` itself (or an
`AFTER INSERT` trigger on `room_task_reviews`). Every accepted review gets a row, eligible or not,
so Phase D can measure.

`gflo_review_outbox` (no client access at all; RLS on, no policies; `service_role` only):

| Column | Notes |
|---|---|
| `id` uuid PK | |
| `review_id` uuid UNIQUE | `room_task_reviews.id`, the idempotency key |
| `room_message_id`, `content_fingerprint`, `version` | copied from the review |
| `author_id`, `reviewer_id` | profiles; never equal (already enforced) |
| `author_wallet`, `reviewer_wallet` | active `gflo.xp.recipient` links at review time, else NULL |
| `room_visibility` | snapshot |
| `status` | `ready` · `ineligible` · `leased` · `attested` · `rejected` · `failed` |
| `ineligible_reason` | `room_not_open` · `author_wallet_missing` · `reviewer_wallet_missing` · `pair_cap` |
| `issuer_signature` | EIP-712 signature over the event (§4), set when `ready` |
| `lease_until`, `attempts` | worker lease (`FOR UPDATE SKIP LOCKED`, 5 minutes) |
| `attestation_uid`, `tx_hash`, `reject_reason`, `updated_at` | result |

**Eligibility, decided in Postgres at insert time:**
1. the room is **open** (pilot);
2. both author and reviewer have an active wallet link;
3. **pair cap:** at most **3** `ready` or `attested` rows per reviewer → author in a rolling 7 days.
   This is the off-chain counterpart of `ATTESTER_OPERATOR_WEEKLY_CAP`, against friend rings.

`changes_requested` creates nothing: no XP, no penalty.

## 4. Issuer signature

Server-side only, with secret `GFLO_ISSUER_PRIVATE_KEY`, using EIP-712:

```
domain  = { name: "OctoPush GFLO Issuer", version: "1", chainId: 84532 }
OctoPushReviewEvent(
  bytes32 reviewId,          // uuid → keccak256(utf8(uuid))
  bytes32 roomMessageId,     // uuid → keccak256(utf8(uuid))
  bytes32 contentFingerprint,// 0x + the stored SHA-256 hex
  string  version,
  address author,            // author_wallet
  address reviewer,          // reviewer_wallet
  uint64  reviewedAt         // unix seconds
)
```

The issuer address is published once (OctoPush README and GFLO bridge config) and is rotatable.

## 5. Bridge API (OctoPush server routes)

Both routes are authenticated with `Authorization: Bearer <GFLO_BRIDGE_TOKEN>` (constant-time
compare) and rate-limited. They have no browser access and no generic signing.

- `POST /api/gflo/outbox/lease { limit ≤ 20 }` → `ready` rows (or rows with an expired lease), moved to `leased`, returning the event plus `issuer_signature`.
- `POST /api/gflo/outbox/{id}/result { status: attested|rejected|failed, attestationUid?, txHash?, reason? }`
  is idempotent: a second identical report is a no-op, a conflicting one returns 409.

## 6. GFLO bridge worker (gflo-backend; built by GFLO, not Lovable)

For each leased event:
1. Verify the issuer signature against the configured issuer address.
2. Re-check on chain: the author has a PIE identity; the **reviewer's `effectiveTier` ≥ 1**. A Tier 0
   reviewer cannot confer XP; such events are rejected with `reviewer_tier`.
3. EAS `attest` on `XPAttestationResolverV02`'s schema:
   - `recipient = author`;
   - data `(ruleId = REF_RULE, eventId = reviewId, evidenceDigest = contentFingerprint)`;
   - revocable, no expiry.

   The resolver then applies every on-chain rule: Path, +20% bonus, caps, replay, challenge period.
4. Report the result. A resolver revert is `rejected` with its reason, never retried blindly.

The keeper finalizes after 3 days.

## 7. Earned plan (OctoPush)

A server function `getEarnedPlan(userId)`:
- active link → `EffectiveTierGateV01.effectiveTier(wallet)` via a public Base Sepolia RPC;
- tier 0 → `free`, 1 → `builder`, 2 → `orchestrator`;
- **any error → `free` + `status: "unavailable"`** (fail closed);
- cached for at most 10 minutes.

`effectivePlan = max(paidPlan, earnedPlan)`. Checkout is not live yet, so today that is the earned
plan. UI:
- `/pricing` shows "Earned through GFLO" on the matching card;
- OctoPass shows the current Path and that earned plans follow the live tier.

**Credits allowance** (D2: about 30% of the paid quota) is designed but **not** in this step. It is
granted later by a monthly job, once the Economy arm exists.

Contract addresses come from server env (`GFLO_CHAIN_ID`, `GFLO_EFFECTIVE_TIER_GATE`, …). There are
no defaults, and the retired v3 addresses are refused (same blocklist as `gflo-frontend`).

## 8. Threats

| Threat | Mitigation |
|---|---|
| Friend room rubber-stamps tasks | open rooms only; reviewer tier ≥ 1 on chain; pair cap 3 / 7 days; on-chain caps; 3-day challenge and revocation |
| Author edits the task after review | the fingerprint is bound in the review, the outbox and the EAS evidence |
| Forged outbox event | issuer signature checked by the bridge |
| Stolen issuer key | the bridge still enforces the chain rules; rotate the issuer; revoke the attestations |
| Stolen bridge key | resolver caps; governance revoke; rotate the attester (`setRuleAttester`) |
| Replay / double attestation | `review_id` UNIQUE; resolver `usedEvents` / `usedEvidence` |
| Paid credits buying XP | no credit, plan or OctoPartnR-decision count is an XP source |
| Chain or RPC down | the earned plan falls back to free; the outbox waits (leases expire, rows are retried) |

## 9. Order of work

| Step | Who | Depends on |
|---|---|---|
| L0 apply the review migration | Lovable (owner approval) | — |
| L1 wallet link | Lovable | L0 not required |
| L2 outbox + eligibility + issuer signature | Lovable | L0, L1 |
| L3 bridge API | Lovable | L2 |
| L4 earned plan read + UI (behind env, off until deploy) | Lovable | L1 |
| G1 bridge worker + keeper as Railway workers | GFLO | L3, contracts deployed |
| C deploy contracts on Base Sepolia, pilot with 5–20 members | both | all above |
