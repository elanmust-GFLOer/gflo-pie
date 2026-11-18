# RED TEAM 6D.4 — transactional PostgreSQL security-gate implementation

Date: 2026-10-17
Status: **OFFLINE PACKAGE PREPARED; PostgreSQL execution PENDING; no production deployment**

## Source basis
Derived from the project's `rt6d3/001_gflo_source_outbox_DRAFT.sql` and inspected OctoPush Builder source (Lovable snapshot `c8c3c87883d18256e70f0b42a9188e3d0764bc91`). The browser can change project/task statuses; `done` and `launched` do not independently prove contribution.

## Prepared files
A separate ZIP package has been delivered in the project conversation. It contains:
- `rt6d4/sql/001_gflo_bridge_RT6D4_CANDIDATE.sql`: transactionally insert reviewed source event, 3 replay keys and outbox; RLS; limited SECURITY DEFINER entrypoints.
- `rt6d4/tests/00_disposable_roles.sql`: ephemeral roles `anon`, `authenticated`, `gflo_rt_ingest`, `gflo_rt_worker`.
- `rt6d4/tests/01_postgres_security.sql`: **9 logical SQL test groups**, including default function privilege, anonymous/browser access denial, direct SQL bypass, duplicate/partial rollback, self-review, worker restrictions, lease fencing and expired lease recovery.
- `rt6d4/tests/02_concurrency.sh`: **1 independent-connection SKIP LOCKED race**.
- `rt6d4/tests/run_ephemeral_postgres.sh`: refuses any DB name except `rt6d4_*` without an explicit disposable-database acknowledgement.
- `rt6d4/tests/00_static_gate.test.mjs`: **8/8 Node.js static checks PASS** (not PostgreSQL execution).
- `.github/workflows/rt6d4-postgres.yml`: GitHub Actions PostgreSQL 16 isolated service workflow; it becomes active only when the workflow and `rt6d4/` directory are actually committed to the repository root.

## Actual executed verification
- `node --test rt6d4/tests/00_static_gate.test.mjs`: 8 passed, 0 failed (local Node 22).
- Both Bash scripts checked with `bash -n`.
- ZIP archive unpack/contents verified.
- **Actual PostgreSQL engine execution: NOT RUN** in authoring environment (no `psql`, `postgres`, `initdb`, Docker; network access unavailable). **Do not mark RT6D.4 security gate PASS until database run/CI logs show it.**
- Source files and workflow presently delivered via ZIP; this GitHub document is the only codebase commit in this turn. No GitHub Actions run claimed.

## Database gate to execute
A disposable PostgreSQL 16 instance should run the packaged runner and concurrency tests, collect SQL and CI logs, and fix failures without relaxing role checks. Never run the included role-creating test fixture against live Supabase.

## Risk register
1. **RT6C HIGH remains OPEN**: colluding authorized PIE EIP-712 attestor/verifier can directly submit fraudulent signatures; off-chain ingress does not enforce an on-chain guard.
2. The review-event function trusts the dedicated server role. Project/task ownership, evidence authenticity, reviewer identity/conflicts and proper wallet binding still need an authenticated real source review service. The DB is not able to prove external work actually occurred.
3. `ready` outbox entries are NOT signed nor submitted. DB↔EVM exactly-once delivery, persistent signer outbox and idempotent Tx receipt reconciliation have not been tested.
4. A Postgres superuser and certain owners can bypass RLS; separate schema ownership and role grant review is required.
5. No modifications made to Lovable OctoPush, Supabase production schema, wallets or Solidity contracts.

## Next gate
Commit reviewed package sources to cookR, run its disposable PG CI, triage all real test errors, then add external OctoPush review provenance and EIP-712 signer enforcement without generic sign-anything methods.
