# GFLO XP Policy v0.2 — Pilot specification

**Status: experimental implementation, not compiled, independently tested, deployed or audited.**

## Core model
- Genesis remains exactly **25 XP** per wallet in `PIECoreV02`.
- The new `XPPolicyV02` stores **additional earned XP**; `totalXP(account)` is the Phase 2 aggregate (Genesis + earned). `PIECoreV02.getIdentity(account).xp` remains unchanged at Genesis value. These are intentionally separate storage ledgers, **not yet a unified core XP state**.
- XP is nontransferable and cannot be bought for GFLO; XP awards never change Tier. Ignition and Tier mutation require a **future core migration or redesigned integration** because Phase 1 deliberately exposes no tier-changing entrypoint.

## Reward rules
- Allowed award: **25–1000 XP**.
- Illustrative tiers: activity 25–75, engagement 75–200, contribution 200–499, achievement 500–1000 XP.
- Rule ID sets a **fixed** amount, max claims per identity and cooldown; rule parameters cannot be redefined under the same ID. Owner may pause all rewards, disable rules and rotate authorized verifier accounts.
- Standard verifier can award **25–499 XP**; elevated verifier can award **25–1000 XP**. Elevated is a role, **not proof of multisig**: assign it to an appropriately reviewed multisig for production.

## Anti-abuse
- Two separately checked single-use commitments: `eventId` and `evidenceHash`, each globally unique within this policy contract. Off-chain verifiers must issue stable canonical IDs for the actual completion. Hash uniqueness is NOT evidence validity and does NOT stop colluding verifiers inventing false events.
- Max **1500 earned XP per fixed UTC day** and **3000 per fixed seven-day Unix epoch**, tracked per wallet. Seven-day epochs begin on Thursday, not Monday. Genesis 25 XP is excluded.
- Wallet-based limits do not prove one human per account; no Sybil resistance, wallet recovery or cross-chain synchronization is provided.
- No rewards for automatic logins, token buying or volume without independently checked merit. No unlimited AI reward authority.
- Only completed verified achievements should be rewarded; never publish personal evidence or secrets on chain.

## Roles, transparency and trade-offs
- Owner has two-step transfer, can set verifiers and rule status and activate an emergency pause.
- Verifier submits `awardXP(account, ruleId, eventId, evidenceHash)` only after actual evidence is checked. On-chain verifies account exists, authorization, rule active, replay, quotas and cooldown, then emits `XPAwarded`.
- This pilot uses direct verifier-sent transactions; it does not implement EIP-712 signatures, nonces or expiries. If added later, domain-separate claims with chain ID and verifying contract.
- The XP cap model is a starting hypothesis pending simulations and adversarial testing, not an economically validated distribution.

## Tests required before this can be considered operational
Compile both contracts, perform actual contract creation (constructor runs), register and disable rules, check non-owner and non-verifier rejection, invalid/repeated evidence IDs, unknown identity, 25/1000 reward bounds, standard/elevated permission, claim limits/cooldowns, day/week caps, pauses, total XP and invariant that Tier cannot change. Run in Termux EthereumJS VM. **Passing Phase 1's 11/11 does not establish XP Policy correctness.**
