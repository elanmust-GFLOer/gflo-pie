# RED TEAM 6D.2 — durable replay store prototype result

Date: 2026-10-17
State: LOCAL PROTOTYPE; not deployed; source files still in local export package, not yet committed to this repository.

## Evidence

Local test execution (Node v22.16.0) against the packaged JS files:
- v0.1 base event-authenticity suite: 10/10 PASS.
- Added SQLite transaction / restart replay suite: 5/5 PASS.
- Combined: 15 tests, 15 passed, 0 failed.

Implemented files in exported bundle:
- `rt6d/source-proof-adapter.mjs` (updated v0.1 adapter)
- `rt6d/source-proof-adapter.test.mjs`
- `rt6d/sqlite-replay-store.mjs`
- `rt6d/sqlite-replay-store.test.mjs`
- `rt6d/README.md`

The new `SQLiteReplayStore.consumeMany(keys)` executes `BEGIN IMMEDIATE`, unique primary-key inserts and rollback when a duplicate is detected. The source adapter reserves three replay keys: scoped event ID, nonce, and evidence digest. Test coverage includes DB close/reopen, nonce-only replay, evidence-only replay, rollback on a conflicting multi-key reservation, and competing DB connections.

## CRITICAL limitations

1. This is **not production OctoPush integration**; no observed authoritative Builder completion event schema or server-side signing was connected.
2. SQLite replay consumption is not transactionally coupled to EIP-712 attestor signing or the XPPolicyV03 submission queue. Crashes between stages require a transactional outbox/idempotent workflow.
3. `node:sqlite` may be experimental at the locally tested Node version; verify in target runtime.
4. Adapter still exposes a legacy in-memory replay interface for backward compatibility in tests. This must be prohibited in deployed services.
5. A colluding authorized attestor + verifier still can bypass this adapter by invoking XPPolicyV03 directly. RED TEAM 6C HIGH issue remains open; do not claim resolved.
6. A compromised issuer can sign fictitious work; cryptographic signature is not factual proof.
7. No EVM deployment, Solidity modification, real wallet keys, treasury funds, or live user information.

## Next gate

Before any production path: integrate an actually observed OctoPush event; define issuer custody and rotation; migrate atomic replay/outbox to shared durable data store (e.g. Postgres); enforce signer authorization so adapter cannot be bypassed; add signed end-to-end EVM attack tests. Source files from the local bundle still require controlled commit after review.
