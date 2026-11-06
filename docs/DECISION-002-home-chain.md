# DECISION-002: Home chain for XP, tier and GFLO burn

**Date:** 2026-11-06
**Status:** Proposed. Awaiting approval from Elan Must.

## Decision
Exactly one chain, the *home chain*, writes XP, tier and GFLO burns. Every
other chain only reads that state, either directly or through a signed,
expiring snapshot.

| Phase | Home chain | CAIP-2 |
| --- | --- | --- |
| Pilot | Ethereum Sepolia | `eip155:11155111` |
| Production target | Base | `eip155:8453` |

The six canonical contracts from the DECISION-001 amendment (2026-11-01) run
unchanged on the home chain:
`PIECoreIgnitionV01`, `XPPolicyV03`, `TrustedXPSourceRegistryV02`,
`GFLOIgnitionV01`, `GFLOFixedSupplyV01`, `EffectiveTierGateV01`.

## Reasons
1. Event and evidence nullifiers (`usedEvents`, `usedEvidence`,
   `usedProofNonces`) live only in one contract's storage. Running two writing
   stacks means one OctoPush event can grant XP once per chain.
2. The daily and weekly XP caps (`block.timestamp / 1 days`, `/ 7 days`) are
   kept per instance, so N writing chains multiply the cap by N.
3. `GFLOFixedSupplyV01` mints its whole supply in the constructor. Each
   deployment is an independent supply, and a burn only counts on its own chain.
4. EIP-712 domains already bind proofs to `chainId` and contract address, so
   proofs cannot be replayed across chains. This keeps the home chain safe, but
   it does not stop duplicate XP from a second writing stack.

## Consequences
- Do not deploy a second writing stack on any other chain. Mainnet or
  Base Sepolia deployments of `XPPolicyV03` are test-only and must be labelled.
- Moving from Sepolia to Base is a **fresh deployment, not a migration**.
  Pilot XP and identities do not carry over unless a later decision defines a
  signed migration.
- Every deployment is recorded in `deployments/eip155-<chainId>.json`
  (see `deployments/README.md`).
- Other chains get a read-only tier mirror (proposed `PIETierMirrorV01`) only
  after the home-chain stack is live and verified. That mirror is a separate
  decision.
- Tokens on other chains, bridged or not, never grant XP or tier.

## Open before acceptance
- [ ] Confirm Sepolia for the pilot (alternative: Base Sepolia, `eip155:84532`,
      which would make the production move a smaller step).
- [ ] Confirm Base as production target. The roadmap names Base, but no
      Base-specific requirement (fees, finality, Safe availability) is recorded yet.
