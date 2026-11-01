# Local activity evidence -> canonical XP -> revocable access

Status: local executable pilot on the PIE v0.2 development line. It executes a
real local worker task and checks the result in another process. It is **not a
live OctoPush integration**, remote execution attestation, security audit or
public-network deployment. Production contracts are unchanged.

## What to reproduce

Use Node **22.23.3**. From `tests-redteam5b/`:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run test:activity
```

The committed lockfile supplies solc-js 0.8.34, EthereumJS v10, ethers and the
official Safe v1.5.0 artifacts. Compiler target/hardfork: Cancun; optimizer on,
200 runs. The disposable in-process VM uses Mainnet's chain-ID 1 configuration;
it has no RPC connection and broadcasts nothing. All signers are publicly known
synthetic test identities; never fund or reuse them outside this fixture.

`pilot/task-worker.cjs` reconciles the registered input: count completed entries,
sort their IDs and sum their integer work units. The separate
`pilot/evidence-checker.cjs` recomputes with a different implementation and checks
the registered input, rule, task, run, recipient and worker-source bindings.

The expected result is 3 completed entries and 1000 work units. Work units are
input data, **not XP or tokens**. The fixture's governance independently assigns
a 1000-XP rule for this demonstration. It is not a recommended reward policy.

## Component and authority matrix

| Component | Responsibility | Authority / boundary |
| --- | --- | --- |
| Local task registration | Fix input hash, task, rule, recipient and expected worker | Controlled by the fixture operator; not an external truth oracle |
| Worker process | Produce the task output | No wallet, signing or XP authority |
| Checker process | Recompute output; check registered bindings | Rejects bad evidence before the fixture signs; not a production verifier service |
| Attestor test identity | Sign EIP-712 evidence digest | Separately allowlisted for the rule; same fixture controls the key |
| Verifier test identity | Call `XPPolicyV03.submit` | Role 2 for the 1000-XP fixture rule; distinct address from attestor |
| `XPPolicyV03` | Pending/finalized/revoked claims, quotas and replay nullifiers | Safe controls roles/rules/revocation; anyone can finalize after the challenge |
| `TrustedXPSourceRegistryV02` | Expose the approved policy's canonical XP | Safe 2/3 activates policy; codehash/core/owner checks; fails closed |
| `PIECoreIgnitionV01` | Identity, selected goal and historical tier | Safe binds Ignition once; only that Ignition changes tier |
| `GFLOIgnitionV01` + `GFLOFixedSupplyV01` | Check canonical XP and perform exact burn before tier upgrade | User approval and burn required; pilot parameters only |
| `EffectiveTierGateV01` | Compute current privilege | Minimum of historical tier and current XP tier cap |
| Inline `PilotConsumer` | Count protected uses | Checks the Gate on every use; Tier 1 required |

`PIECoreV02` is the separate Genesis/Path phase and deliberately exposes no tier
mutation. Do not substitute it for `PIECoreIgnitionV01` in this fixture. Do not
substitute the legacy Sepolia token, PIECore, Ignition or GasFeeLoop addresses.

## Evidence and lifecycle

1. Register the exact local task and execute the worker subprocess.
2. Recompute the result in the checker subprocess. Bind input/output SHA-256
   hashes, task/run IDs, recipient, worker version/source hash and rule.
3. Hash the canonical evidence bundle with Keccak-256 for the on-chain proof.
   The event ID binds namespace + task ID + input hash + rule, deliberately
   excluding run ID. A separately executed retry has different evidence but
   the same event ID, so it cannot earn a second grant.
4. Separately allowlisted test attestor signs, and verifier submits. PENDING
   claims do not add canonical XP or authorize the consumer.
5. Advance **simulated VM time** by 3 days and finalize once: canonical XP rises
   from Genesis 25 to 1025. Re-finalization reverts.
6. User performs the fixture's 1-token exact burn. Historical/effective Tier 1
   then permits one protected consumer call. XP alone does not upgrade tier.
7. Safe 2/3 revokes the grant. Canonical XP returns to 25, historical tier stays
   1, effective tier falls to 0 and a subsequent consumer call is rejected.
   Revocation does not undo the prior consumer use or refund burned tokens.

## Acceptance checks and artifacts

The runner checks 15 scenarios, including wrong output with recomputed hashes,
changed input, relabelled task/run/recipient/executor, duplicate input IDs,
signature tampering, unauthorized submission, premature finalization, replay,
independently executed retry, single XP credit, required burn and revocation.
Contract rejection checks require the expected custom-error selector, not merely
any failed transaction. Failed consumer calls cannot increment its use counter.

On success it writes ignored files:

- `evidence/activity-pilot/evidence.json`: registered task, actual worker output
  and bindings; includes synthetic fixture identities only.
- `evidence/activity-pilot/report.json`: 15 results, lifecycle states, current
  Git HEAD, exact source/lockfile hashes, runtime/compiler settings, local
  addresses and signed transaction receipt hashes/statuses/logs.

The report's file hashes identify the executed bytes even for uncommitted work;
HEAD alone does not establish a clean checkout. Only a zero exit code plus the
current report is a successful run. Old success files are removed before source
compilation. CI uploads the activity evidence with the existing signed-EVM
artifact; a local pass must not be called a CI pass.

## Trust limits and the next integration gate

The fixture operator controls task registration, both signer identities and
governance. Distinct processes/addresses are not independent organizations. A
valid signature proves the attestor's assertion, not arbitrary real-world work.
The checker verifies a deterministic output; it cannot prove where or when a
remote agent ran, who deserves attribution, or that an operator did not fabricate
a consistent trace. The on-chain policy cannot recompute the off-chain task.

New task IDs are trusted registrations. Registering the same job under another
ID, using many identities or colluding signers is not prevented by this pilot.
Production task issuance, source authentication, retention/privacy, signer
separation and appeal handling remain explicit design and review gates.

The next step is an authorized real OctoPush event adapter plus an independently
operated checker for one such rule, retaining the same replay and revocation
tests. Any public deployment, migration or change to burn/XP economics needs a
separate decision. This pilot does not claim Activity > money compliance merely
because token balances cannot directly mint XP: burn remains an access condition.
