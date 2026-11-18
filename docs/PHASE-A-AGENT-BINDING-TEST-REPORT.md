# Phase A test report — operator binding, agent XP, agent tier

Date: 2026-11-18 · Scope: DESIGN-003 Phase A · Local Hardhat only, **not deployed, not audited**

## Contracts

| Contract | Role |
|---|---|
| `AgentBindingRegistryV01` | Binds an ERC-8004 agent to the human operator who owns it; slot limits by operator tier; epochs; strikes; fail-closed `isActive` |
| `AgentXPResolverV01` | EAS resolver for agent work: PENDING → VALID / REVOKED, self-dealing checks, farming bounds per agent, per operator and per attester → operator |
| `AgentTierGateV01` | `agentTier = min(own XP tier, operator effective tier)`; inactive agents fail |

## Test environment, no mocks

- **ERC-8004**: official `IdentityRegistryUpgradeable`, `MinimalUUPS` and `ERC1967Proxy`,
  vendored verbatim under `contracts/test/erc8004/` and pinned by SHA-256 (`PROVENANCE.md`).
  Deployed through the official path: proxy → `MinimalUUPS.initialize` (hard-coded owner,
  impersonated) → `upgradeToAndCall(IdentityRegistryUpgradeable, initialize())`.
  Upstream uses `@openzeppelin/contracts-upgradeable` 5.4.0 (5.5+ removed
  `__UUPSUpgradeable_init`); it is pinned and overridden onto the existing
  `@openzeppelin/contracts` 5.6.1, so there is one OpenZeppelin core in the tree.
- **EAS**: real 1.9.0 contracts from the npm artifacts.
- **Human side**: real PIE core, human XP resolver, Registry, EffectiveTierGate and a
  fixed-supply GFLO burn through Ignition. Operators reach Tier 1 the production way.

## Results

`tests-v02`: **43 passing** (18 in `test/AgentPhaseA.erc8004.cjs`, 25 existing unchanged).
`npm ci` keeps the lockfile byte-identical.

| Area | Proven |
|---|---|
| Binding | ERC-8004 default wallet (= owner) refused; only the NFT owner with a PIE identity binds (approved operators cannot); one wallet ↔ one agent; a human wallet is never an agent; agentId 0 works |
| Slots | Tier 0 → 1 agent, Tier 1 → 3 agents |
| Non-transferable reputation | NFT transfer → inactive at once, ERC-8004 clears the wallet, XP reads 0; stale binding can be cleared by anyone; new owner gets epoch 2 and 0 XP; wallet change also needs rebind/new epoch |
| Agent XP | challenge period; agent XP never changes the operator's human XP; wrong recipient, unlisted attester, foreign schema, event/evidence replay rejected |
| Self-dealing | operator, the agent itself and sibling agents cannot attest; another operator's agent can |
| Farming bounds | a 3-agent fleet stops at the operator daily cap (1,500); operator weekly cap (3,000) across days, agents and attesters; one attester stops at 1,500 per operator per week while an independent attester continues; per-agent daily and per-rule limits |
| Accountability | attester withdrawal and non-strike revocations add no strikes; 3 fraud strikes deactivate all agents and block binding; strikes expire after 90 days; only the resolver can record strikes |
| Tier gate | agent with 1,200 XP stays Tier 0 while its operator is Tier 0, becomes Tier 1 when the operator does |
| Fail-closed | resolver pause blocks reads, tiers and new XP (attester withdrawal still works); unknown agent fails; an ERC-8004 upgrade to a contract without `ownerOf` makes the agent inactive |

## Mutation gate

Each mutation applied alone to `contracts/`, sources re-prepared, Phase A suite run:

| Mutation | Result |
|---|---|
| no operator daily cap | killed (1 test) |
| no operator weekly cap | killed (1) |
| no attester → operator cap | killed (1) |
| sibling agents may attest | killed (1) |
| XP survives transfer (no epoch) | killed (1) |
| fraud never strikes the operator | killed (1) |
| no slot limit | killed (1) |
| anyone may bind | killed (1) |
| fail-open on ERC-8004 read error | killed (1) |
| agent tier ignores operator | killed (1) |

## Review fixes (PR #25)

| Finding | Fix | Evidence |
|---|---|---|
| P1: governance suspension cleared by `unbind` + `bind` | suspension stored per `agentId` (`agentSuspended`), outside the removable binding; `bind` reverts `AgentIsSuspended`; can be set pre-emptively | new test fails on the previous contracts, passes now |
| P1: attester withdraws a fraudulent grant first, so `governanceRevoke(…, true)` reverted and no strike was recorded | strike tracked per grant (`struck[uid]`) separately from XP revocation; a withdrawn grant can be struck exactly once with no second XP deduction | new test fails on the previous contracts, passes now |
| P2: wallet/owner flip-back re-activates the old epoch | not fully fixable on-chain: ERC-8004 has no revision counter. Mitigation: anyone may invalidate a stale binding at any time; a keeper must watch ERC-8004 events. Recorded in DESIGN-003 §9 | open, decision pending |

## Known limits (unchanged by Phase A)

- A valid attestation proves who asserted the work, not that it happened.
- Collusion between an operator and independent attesters is bounded (per-attester budget),
  not prevented.
- PIE personhood is not Sybil-proof: one human with several PIE identities gets several
  operator budgets. Slot limits and Tier requirements raise the cost; they do not remove it.
- ERC-8004 registries are upgradeable by their owner; GFLO only fails closed.
- Phases B (ERC-8004 reputation publisher), C (testnet pilot) and D (measurement) are not done.
