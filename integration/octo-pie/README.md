# GFLO.Octo_PIE-cookR 🐙⚛️🧬

**GFLO Sovereign Integration Reactor — Blueprint v0.1**

> Cook the bridges, don't merge the chains.

Independent integration workspace for **OctoPush Collective × OctoPartnR × GFLO PIE × GFLO Sovereign**.

**Status: architecture proposal only. No deployed integration, on-chain rewards, signed wallet linkage, public-network verification, or security audit is claimed.**

## Sources of truth

- [GFLO PIE](https://github.com/elanmust-GFLOer/gflo-pie), development branch `feature/pie-core-v0.2`: identity, canonical XP, EIP-712-attested and revocable XPPolicyV03, historical tier, dynamic EffectiveTierGate, signed local EVM tests.
- [OctoPush / OctoChain Collective](https://lovable.dev/projects/fafc7193-490d-4527-be77-4296369a300b): React/TanStack Start application, OctoPass/Supabase profiles, Builder, feed, Pixel Studio and OctoPartnR.
- OctoPartnR: Cognitive Semaphore, specialist orchestration, 12-article constitution, decisions and reflection. **Advisory coordinator only**, not autonomous on-chain attestor, jury or payment authority.
- GFLO Sovereign: proposed participation, incentive and governance experience, not yet a deployed product.

## One measurable vertical slice

`OctoPass user → explicit wallet-signature linkage → independently evidenced Builder event → OctoPartnR triage → randomized review (human decisions) → EIP-712 authorized attestor → XPPolicyV03 PENDING/VALID/REVOKED → EffectiveTierGate → read-only Sovereign dashboard`.

Reviewers may later receive GFLO from a **pre-funded treasury** under separately approved, abuse-resistant rules. GFLO is fixed-supply in the prototype; burns do not refill the review pool.

## Security boundaries

- Email login does NOT prove possession of an EVM wallet.
- OctoPartnR model output is NEVER a cryptocurrency signature or evidence truth oracle.
- Randomly selected addresses are NOT necessarily independent people (Sybil/collusion).
- Positive and negative review decisions are compensated for *quality*, not simple majority alignment.
- Retain the distinct accounting ledgers: OctoPush app credits ≠ PIE XP ≠ GFLO ERC20 token.
- Protected rights MUST check current effectiveTier. achievedTier is historical only.
- Treat OctoPush MCP `guard.ts` fail-open-on-policy-lookup behavior as unacceptable for GFLO payouts or sensitive access. Design a new fail-closed authorization gate.
- No wallets, grants, fund transfers, schema migrations or production deployment in this v0.1 documentary scaffold.

Read [the blueprint](docs/BLUEPRINT-v0.1.md), [threat model](docs/THREAT-MODEL.md), [interface boundaries](docs/ADAPTER-CONTRACTS.md), [review basis](docs/SOURCE-REVIEW.md), and [roadmap](docs/ROADMAP.md).
