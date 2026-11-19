# Phase B test report — ERC-8004 reputation publisher and agent keeper

Date: 2026-11-19 · Scope: DESIGN-003 Phase B · Local Hardhat only, **not deployed, not audited**

## Components

| Component | Role |
|---|---|
| `GFLOReputationPublisherV01` | Mirrors eligible GFLO agent grants into the ERC-8004 Reputation Registry as one trusted client; epoch-tagged; permissionless publish/unpublish |
| `keeper/agent-keeper.cjs` | Tick: ends stale bindings after ERC-8004 transfers / wallet changes, raises flip-back alerts, retracts ineligible entries, publishes eligible ones |

## Test environment, no mocks

- Official ERC-8004 `ReputationRegistryUpgradeable` added to `contracts/test/erc8004/`, SHA-256
  pinned in `PROVENANCE.md`. `IdentityRegistryUpgradeable` was re-fetched and is byte-identical
  to the copy pinned in Phase A.
- Deployed through the official path (proxy → `MinimalUUPS.initialize(identity)` →
  `upgradeToAndCall(ReputationRegistryUpgradeable, initialize(identity))`).
- Upstream compiles this registry with `viaIR` (stack too deep otherwise). `hardhat.config.cjs`
  enables `viaIR` **for that vendored fixture only**. Project contracts keep the default
  pipeline: their deployed bytecode was compared before and after the config change and is
  identical.
- Deployment code moved to `tests-v02/fixtures/agent-stack.cjs`, shared by Phase A and B.
  Phase A tests are unchanged in content.

## Results

`tests-v02`: **54 passing** (10 in `test/ReputationPhaseB.erc8004.cjs`, 44 existing).

| Area | Proven |
|---|---|
| Setup | a reputation registry bound to a different identity registry is refused |
| Publishing | only VALID grants; exactly once; `NewFeedback` carries value 100, `gflo.verified`, `gflo-epoch:1`, `eas:<chainId>:<uid>` and the UID as hash; XP unchanged |
| No reputation transfer | after a sale and rebind (epoch 2) the current-epoch summary is 0 even before retraction; the old entry is retracted by anyone; it can never be republished |
| Lifecycle | revoked grants are retracted and cannot return; a suspension retracts, lifting it allows republishing as a new entry; retracting a still-eligible entry is refused |
| ERC-8004 rules | an operator approving the publisher only blocks their own mirroring |
| Fail-safe | pause blocks publishing only; a broken ERC-8004 upgrade blocks mirroring but leaves agent XP and tier unchanged |
| Keeper | dry run sends nothing; publishes; idempotent; after a sale it unbinds and retracts; on a W2 → W1 → W2 flip-back before it runs it raises exactly one `flipback` alert and leaves the entry live for governance |

## Review fixes (PR #29)

| Finding | Fix | Evidence |
|---|---|---|
| P2: a change in the same block as the bind shares its timestamp and was skipped forever | changes are ordered by `(blockNumber, logIndex)` against the `AgentBound` event of the current epoch | new test mines bind + transfer in one block; fails on the previous keeper, passes now |
| P2: re-setting the same wallet raised a false `flipback` alert on every tick | an alert needs a real departure (a `Transfer`, or a wallet set to a different address); a suspended agent is not re-alerted | new test fails on the previous keeper, passes now |

## Mutation gate

Each mutation applied alone, sources re-prepared, Phase B suite run:

| Mutation | Result |
|---|---|
| no epoch tag | killed (2 tests) |
| eligibility ignores inactive agents | killed (2) |
| eligibility ignores ended epochs | killed (1) |
| unpublish allowed while eligible | killed (1) |
| pause ignored | killed (1) |
| PENDING/REVOKED grants publishable | killed (3) |
| keeper alerts on changes before the binding | killed (1) |
| keeper never retracts | killed (2) |

## Known limits

- Consumers must filter by the publisher address and the current epoch tag; raw, unfiltered
  ERC-8004 summaries stay farmable by design.
- A flip-back that happens between keeper runs leaves the agent active until governance
  suspends it (accepted, DESIGN-003 §9).
- The keeper is not deployed yet and has no persistence beyond `fromBlock`; scanning from the
  deployment block each tick is fine for a pilot, not for scale.
- Not done: Phase C testnet pilot, backend `/api/agents/<id>`, Phase D measurement.
