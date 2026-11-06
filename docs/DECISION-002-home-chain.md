# DECISION-002: Home chain for XP, tier and GFLO burn

**Date:** 2026-11-06
**Status:** Accepted for the pilot (Elan Must, 2026-11-06). The production
target stays open; see "Open" below.

## Decision
Exactly one chain, the *home chain*, writes XP, tier and GFLO burns. Every
other chain, EVM or not, only reads that state, either directly or through a
signed, expiring snapshot.

| Phase | Home chain | CAIP-2 |
| --- | --- | --- |
| Pilot | Base Sepolia | `eip155:84532` |
| Production target | Base | `eip155:8453` |

The six canonical contracts from the DECISION-001 amendment (2026-11-01) run
unchanged on the home chain:
`PIECoreIgnitionV01`, `XPPolicyV03`, `TrustedXPSourceRegistryV02`,
`GFLOIgnitionV01`, `GFLOFixedSupplyV01`, `EffectiveTierGateV01`.

## Why one writing chain
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

## Why Base Sepolia for the pilot (not Ethereum Sepolia)
1. **It matches production.** It runs the same OP Stack L2 as Base, with the
   same fee model and the same finality model. An L2 block counts as finalized
   once its batch is finalized on L1, roughly 15–20 minutes. What the pilot
   shows about fees, latency and snapshot timing carries over to Base. Ethereum
   Sepolia would show none of it.
2. **The move to Base only changes the chain ID.** It is a fresh deployment of
   the same code and configuration with chain ID 8453 instead of 84532. No
   chain assumptions need to be re-checked.
3. **The tooling already works.** The deploy script reaches Base Sepolia through
   the Etherscan v2 API (`chainid=84532`). The chain supports Cancun (`MCOPY`,
   which OpenZeppelin 5.x needs), and Safe is available on it.
4. **Continuity with Ethereum Sepolia would not help.** The only thing there is
   the retired v3 stack (DECISION-001). Its read-only audit stays on Ethereum
   Sepolia, and nothing from v0.2 depends on it.

## Requirements for opening to other chains (Solana and others)
The long-term GFLO PoVA direction includes Solana and other non-EVM chains.
Under this decision those chains only read, so the choice of pilot chain does
not limit them. Three things must hold from the start so that opening later
needs no redesign:

1. **Chain-neutral snapshot format.** A tier snapshot names its target chain
   with a CAIP-2 string (for example
   `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`), not with an EVM-only
   `chainId` / `verifyingContract` domain. It is signed with secp256k1 over a
   keccak256 digest, so EVM contracts (`ecrecover`) and Solana programs (the
   `secp256k1_recover` and `keccak` syscalls) can verify the same signed
   snapshot with the same signer key. Each snapshot carries the home-chain
   CAIP-2, a finalized block number and `validUntil`. An expired snapshot means
   no privilege (fail-closed).
2. **Signed cross-chain wallet binding.** A Solana account (ed25519) is not the
   same as the user's home-chain address. Each non-EVM account is linked to a
   home-chain identity by a binding that both keys sign. Accounts are written
   as CAIP-10 (`eip155:84532:0x…`, `solana:<genesis>:<base58>`). The current
   OctoPass binding (PB01/PB02) covers EOAs only and must be extended to cover this.
3. **Contracts are not ported.** The Solidity stack does not run on Solana.
   Each non-EVM chain gets a small read-only verifier program: the
   equivalent of the proposed `PIETierMirrorV01`, with the same read surface
   (`effectiveTier`, `requireEffectiveTier`).

## Consequences
- Do not deploy a second writing stack on any other chain. Any deployment of
  `XPPolicyV03` outside the home chain is test-only and must be labelled.
- Moving from Base Sepolia to Base is a **fresh deployment, not a migration**.
  Pilot XP and identities do not carry over unless a later decision defines a
  signed migration.
- Every deployment is recorded in `deployments/eip155-<chainId>.json`. The
  pilot manifest is `deployments/eip155-84532.json` (see `deployments/README.md`).
- Read-only mirrors on other chains (EVM, Solana, OPNet) come only after the
  home-chain stack is live and verified. Each mirror is a separate decision.
- Tokens on other chains, bridged or not, never grant XP or tier.

## Open
- [ ] Production target: Base is named in the roadmap, but no Base-specific
      requirement (fees, finality, Safe and user wallet coverage) is recorded
      yet. Record that requirement or revise the target before the mainnet
      deploy.
- [ ] Confirm the Etherscan API plan covers Base Sepolia before the first
      deploy. The script fails closed if verification is refused.
