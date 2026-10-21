# GFLO Proof Bridge v0.1 — OctoPush × OctoPass × PIE

**Status:** DESIGN / NON-PRODUCTION / no implemented connection. Base: `feature/pie-core-v0.2` at `a4e11cb467c2eae6f6baf2419aaa38aa653fdf16`. Existing PR #14 dependency work is separate; this document changes no contracts.

## 1. Grounded inventory (read-only application inspection, 2026-10-21)
- OctoGFLO Sovereign Lovable project `1bd6a65f-35c7-4257-826e-e49f2e0d7521`, last edit 2026-10-18, commit `7a2372a6e5a66e6d4d11e066c5a77e3f0835c0a7`: `src/domain/engine.ts` is a deterministic local simulation; `fixtures.ts` uses DEMO claim IDs, a DEMO wallet and DEMO XP. `src/domain/octopass-adapters.ts` declares interfaces but explicitly states these are not implemented in MVP 01; OctoPush gateway `src/lib/links.ts` is navigation-only (no shared auth/state).
- OctoChain Collective / OctoPush Lovable project `fafc7193-490d-4527-be77-4296369a300b`, last edited 2026-09-13. `src/components/app/AppShell.tsx` uses Supabase auth and a profile hook; `.lovable/plan/octopass-identity-4-modul-élesítése-2026-08-12.md` proposes the OctoPass profile/visibility model, but a plan is not evidence that an identity or wallet-binding integration is live.
- GFLO `gflo-pie` PR #11–13 have been merged into the above development base; P0/P1 contract test evidence is separately documented. PR #14 remains draft and dependency acceptance OPEN.
- **No observed live authenticated OctoPush→OctoPass→PIE event source, cryptographic wallet-binding backend, proof relay, or application-level EffectiveTierGate consumer.** Do not imply integration is working.

## 2. Minimal end-to-end vertical slice (proposed)
**Pilot action:** a single low-risk, server-confirmed OctoPush action such as publishing one eligible original post in a test environment; exact eligibility, spam controls and ownership must be specified by the OctoPush product owner. Do not equate action count or AI-agent activity with valuable human contribution by default.

`OctoPush activity event` → `signed first-party evidence envelope` → `consented OctoPass wallet link` → `issuer / attestor verification` → `PIE XPPolicy PENDING / challenge / finalized` → `effective-tier read` → `privileged consumer gated action` → `revoke/pause fail-closed`.

No new XP writing permission is granted to OctoPush frontend, OctoPass profile or third-party AI agents. PIE canonical XP changes only through approved on-chain protocol mechanisms.

## 3. Minimum message shapes (design proposal, NOT deployed API)

```ts
type OctoPushActivityV1 = {
  schema: "gflo.octopush.activity.v1";
  eventId: string;              // stable opaque identifier, unique within issuer domain
  issuerId: string;             // registered server-side source, never client asserted
  actorProfileRef: string;      // pseudonymous source-local ID; not public PII
  actionType: "eligible_post_v1";
  resourceDigest: `0x${string}`;  // SHA-256 or an explicitly declared algorithm
  occurredAt: string;           // UTC ISO-8601, trusted server timestamp
  sourceSequence: string;       // monotonically constrained where feasible
  policyVersion: string;        // accepted allowlist of reward rules
};
type WalletBindingV1 = {
  bindingId: string;
  octoPassProfileRef: string;
  chainId: number;
  account: `0x${string}`;
  walletProofNonce: string;
  challengeDomain: string;
  issuedAt: string;
  expiresAt: string;
  consentVersion: string;
  scopes: string[];
  revokedAt: string | null;
};
type EvidenceEnvelopeV1 = {
  schema: "gflo.pie.evidence.v1";
  activityDigest: `0x${string}`;
  walletBindingId: string;      // lookup in access-controlled verifier, not public PII
  policyVersion: string;
  issuerId: string;
  signature: `0x${string}`;    // signature over canonical domain-separated digest
};
```

Wire encoding, canonical serialization, digest rules, signing domain (chainId, verifyingContract, protocol version), issuer rotation and claim-id/nullifier derivation must be pinned before implementation. EIP-712 / ERC-1271 are the intended trust patterns but compatibility is not assumed without tests.

## 4. Trust boundaries and fail-closed rules
1. **OctoPush activity:** only a trusted server-side producer or a verified source signs event data. Client requests and screenshots are not attestations. Idempotency enforced by issuer+eventId, canonical content hash, and an expiry window; avoid rewarding duplicate/cross-account replay.
2. **OctoPass consent:** server-issued nonce+domain+expiry and actual wallet signature verification; a wallet proves account control, not uniqueness or humanity. Require explicit, revocable scope per connection. Binding has no inherent power to mint XP or alter Tier.
3. **Verifier/attestor:** validate source authorization, signature, unique independent attestors as policy demands, event status (deleted/moderated/reverted), freshness, chainId and signer revocation. Attestor/verifier separation must be verified rather than inferred from code labels.
4. **PIE policy:** submit through existing verified policy; challenge and revocation remain effective. Record exact digest, rule ID, expiry and authoritative nullifier. No rewards before finalization. Cross-chain/domain replay fails closed.
5. **Consumer:** a real protected endpoint/function checks the authoritative EffectiveTierGate and pause/revocation at the moment of action, not a cached UX badge; deny on RPC/error/staleness.
6. **Privacy:** keep raw profile/PII off-chain; log hashes and necessary pseudonyms only. Do not publish profile↔wallet mapping without opt-in. Define retention, erasure, disputes and selective disclosure.
7. **Agents:** delegated agent actions require explicit scope, identity of initiating actor and approval trail; not rewarded as personally verified human contributions by default.

## 5. MVP acceptance matrix
| ID | Test / evidence | Minimum passing outcome |
|---|---|---|
| PB01 | Explicit consent + signed challenge + expiry | wallet binding established only for authorized profile+wallet |
| PB02 | Revoked consent and wrong chain/domain | subsequent proof submission rejected |
| PB03 | First-party eligible action, server-origin signature | immutable event digest and independent verification |
| PB04 | Forged event or tampered payload | no claim / no XP |
| PB05 | Replay same event or binding across wallet/account | rejected with unchanged canonical XP |
| PB06 | Single-source collusion / removed issuer | fail closed under configured threshold |
| PB07 | Valid action and independent approvals | PENDING, no canonical XP increment |
| PB08 | Challenge upheld / revoked proof | claim rejected or canonical XP removed |
| PB09 | Challenge complete | only valid finalized XP counts toward EffectiveTier |
| PB10 | Real privilege consumer | allows valid, denies insufficient, paused, revoked, stale and RPC-error states |
| PB11 | Data minimization | no raw personal profile in on-chain logs or public proof payload |
| PB12 | Exact-tree reproducibility | pinned integration SHA, actor source code, test logs, event samples and artifact hash |

## 6. Non-production OctoGFLO visibility slice
A separate, approval-gated Lovable change can add a **Development Evidence** area with two explicitly different sources:
- **Verified development ledger (static/curated until a safe public read-only API exists):** PR #11 MERGED; PR #12 MERGED; PR #13 MERGED; PR #14 PARTIAL FIX / OPEN. Show commit links, scope, evidence type and last verified UTC. Stale data must be marked; never invent live status.
- **DEMO proof journey:** keep simulated XP, labels and scenarios visibly DEMO. Display `OctoPush wallet/source NOT CONNECTED` and `OctoPass binding NOT ACTIVE` until real connectors pass PB01–PB12.
An ordinary external navigation link to OctoPush must not be presented as live data integration. No live EVM reads or wallet signing in this UI slice without separately approved review.

## 7. Phases and governance
1. **Read-only mapping:** inventory actual OctoPush profile/auth/event tables, relevant route and API implementations and OctoGFLO simulated adapters. Do not confuse plans with deployed behavior.
2. **Wallet-binding pilot:** signature challenge, nonce expiry, consent and revocation, separated from GFLO XP.
3. **Event-source pilot:** single eligible activity type, signed source envelope and adversarial replay/forgery cases.
4. **PIE bridge:** authorized attestation into existing XPPolicy, PENDING→finalize/revoke, exact policy digest checks.
5. **Application-level consumer:** effectiveTier fail-closed enforcement, recovery/appeal/privacy and complete E2E red-team evidence.

**Separate approvals required:** app changes and publish, contract change, new proof authority, main branch, external RPC, testnet and production deployment. This PR authorizes none. No main or Lovable application edits have been made by this design work package.
