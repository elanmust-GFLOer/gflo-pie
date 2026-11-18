# RT6D.3 — OctoPush observed source and proposed Postgres boundary

Status: **SOURCE INSPECTION + OFFLINE DRAFT; NOT DEPLOYED**

Lovable project `fafc7193-490d-4527-be77-4296369a300b`, inspected at `c8c3c87883d18256e70f0b42a9188e3d0764bc91`.

## Observed (grounded in Lovable files)
- `src/routes/_authenticated/builder.tsx` updates `projects.status` directly via browser Supabase client, statuses `idea, building, testing, launched, paused`.
- `src/routes/_authenticated/projects.$projectId.tsx` updates `project_tasks.status` directly via browser Supabase client, statuses `todo, in_progress, blocked, done`.
- These statuses are **user-editable**, therefore not independent evidence of real Builder work. No independently authenticated completion event was confirmed from these routes.

## RT6D.3 prototype decision

Use a **new** event type `octopush.builder.reviewed.v1`, deliberately different from previously mocked `octopush.builder.completed.v1`, only after independent authenticated source review. Proposed private Postgres schema: `gflo_bridge.source_events`, `gflo_bridge.attestation_outbox`, `gflo_bridge.used_source_keys`; unique source event+revision, replay-keys, outbox event. Restrict client role from all inserts and updates; authorize through dedicated server and checked review workflow.

**No migration has been run, no Lovable or Solidity source changed, and no real signatures or GFLO XP were issued.** The corresponding review-only SQL draft and detailed README were prepared as an offline archive. It is a schema proposal, not an implementation of source truth.

## Blocking risks

- Browser users can set a task to `done` or project to `launched`; raw status events MUST NOT mint XP.
- Reviewer identity, evidence, anti-self-review, conflict and dispute procedures require specification.
- Signer must reject arbitrary EIP-712 proof requests; consuming reviewed events is necessary but not enough while XPPolicyV03 allows authorized parties to call submit directly.
- RT6C HIGH collusion and compromised issuer risk remains OPEN.
- Need disposable Postgres transaction/RLS tests before schema migration is considered.
