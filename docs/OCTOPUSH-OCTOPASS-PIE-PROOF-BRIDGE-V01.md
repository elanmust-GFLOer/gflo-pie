# GFLO Proof Bridge v0.1 — OctoPush × OctoPass × PIE

**Status:** DESIGN / NON-PRODUCTION / no implemented connection. Base: `feature/pie-core-v0.2` at `a4e11cb467c2eae6f6baf2419aaa38aa653fdf16`. Existing PR #14 dependency work is separate; this document changes no contracts.

## 1. Grounded inventory (read-only application inspection, 2026-10-21)
- OctoGFLO Sovereign Lovable project `1bd6a65f-35c7-4257-826e-e49f2e0d7521`, last edit 2026-10-18, commit `7a2372a6e5a66e6d4d11e066c5a77e3f0835c0a7`: `src/domain/engine.ts` is a deterministic local simulation; `fixtures.ts` uses DEMO claim IDs, a DEMO wallet and DEMO XP. `src/domain/octopass-adapters.ts` declares interfaces but explicitly states these are not implemented in MVP 01; OctoPush gateway `src/lib/links.ts` is navigation-only (no shared auth/state).
- OctoChain Collective / OctoPush Lovable project `fafc7193-490d-4527-be77-4296369a300b`, last edited 2026-09-13. `src/components/app/AppShell.tsx` uses Supabase auth and a profile hook; `.lovable/plan/octopass-identity-4-modul-élesítése-2026-08-12.md` proposes the OctoPass profile/visibility model, but a plan is not evidence that an identity or wallet-binding integration is live.
- GFLO `gflo-pie` PR #11–13 have been merged into the above development base; P0/P1 contract test evidence is separately documented. Development-branch merge is not main, release or production acceptance. PR #14 remains draft and dependency acceptance OPEN.
- **No observed live authenticated OctoPush→OctoPass→PIE event source, cryptographic wallet-binding backend, proof relay, or application-level EffectiveTierGate consumer.** Do not imply integration is working.

## 2. Future end-to-end vertical slice (outside the IF-02 read-only gate)
**Pilot action:** a single low-risk, server-confirmed OctoPush action such as publishing one eligible original post in a test environment; exact eligibility, spam controls and ownership must be specified by the OctoPush product owner. Do not equate action count or AI-agent activity with valuable human contribution by default.

`OctoPush activity event` → `signed first-party evidence envelope` → `consented OctoPass wallet link` → `issuer / attestor verification` → `PIE XPPolicy PENDING / challenge / finalized` → `effective-tier read` → `privileged consumer gated action` → `revoke/pause fail-closed`.

No new XP writing permission is granted to OctoPush frontend, OctoPass profile or third-party AI agents. PIE canonical XP changes only through approved on-chain protocol mechanisms.

## 3. Historical message sketches (design only, NOT the frozen read-only wire contract)

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

These sketches are retained for provenance; they are not implemented APIs or authority-bearing credentials. The IF-02 read-only profile and its frozen evidence are defined in section 8. Future activity/attestor wire encoding, canonical digests, domains, issuer rotation and nullifiers still require separate review. ERC-1271 in Solidity attestor tests does not imply wallet-proof support: ERC-1271, counterfactual and delegated wallets are NOT SUPPORTED by the current wallet pilot and must fail closed. Do not add a verifyingContract field to the existing off-chain consent domain; changing signed fields requires a separately reviewed profile.

## 4. Trust boundaries and fail-closed rules
1. **OctoPush activity:** only a trusted server-side producer or a verified source signs event data. Client requests and screenshots are not attestations. User-editable Builder/profile statuses are self-assertions, not authenticated contribution events, issuer credentials or canonical XP/Tier evidence. Idempotency enforced by issuer+eventId, canonical content hash, and an expiry window; avoid rewarding duplicate/cross-account replay.
2. **OctoPass consent:** server-issued nonce+domain+expiry and actual wallet signature verification; a wallet proves account control, not uniqueness or humanity. Require explicit, revocable scope per connection. Binding has no inherent power to mint XP or alter Tier.
3. **Verifier/attestor:** validate source authorization, signature, unique independent attestors as policy demands, event status (deleted/moderated/reverted), freshness, chainId and signer revocation. Attestor/verifier separation must be verified rather than inferred from code labels.
4. **PIE policy (future, not enabled here):** submission requires a separately approved exact core/policy/registry deployment; no canonical deployment approval is established by this document. Record the exact digest, rule ID, expiry and authoritative nullifier. PENDING grants add no canonical earned XP. Source-approval revocation and finalized-grant revocation are distinct operations; do not claim that current XPPolicyV03.finalize revalidates source approval. Cross-chain/domain replay must fail closed.
5. **Consumer:** a real protected endpoint/function checks the authoritative EffectiveTierGate and pause/revocation at the moment of action, not a cached UX badge; deny on RPC/error/staleness.
6. **Privacy:** keep raw profile/PII off-chain; log hashes and necessary pseudonyms only. Do not publish profile↔wallet mapping without opt-in. Define retention, erasure, disputes and selective disclosure.
7. **Agents:** delegated agent actions require explicit scope, identity of initiating actor and approval trail; not rewarded as personally verified human contributions by default.

## 5. MVP acceptance matrix — fixture evidence versus future integration

The PB01–PB12 IDs below are bridge acceptance requirements, not the names or count of the PR #16 PB01/PB02 fixture suites. An implemented fixture path or historical scoped CI result is not a completed cross-repository integration. No row is an integration PASS; schema validation does not run these cryptographic or E2E requirements.

| ID | Test / evidence | Minimum passing outcome | Current implementation boundary / remaining status |
|---|---|---|---|
| PB01 | Future durable-binding gate: explicit signed binding intent + challenge + expiry | Not satisfied by the read-only pilot; its separate EIP-712 consent authorizes only one observation, never binding activation | NOT_IMPLEMENTED for durable binding. PR #16 is an EOA Map fixture, not the cookR two-signature read profile |
| PB02 | Revoked consent and wrong chain/domain | Read-only proof/release denied; future submission or durable binding requires its own reviewed authority | cookR0C/0D implements fixture control checks. Real authority/session/revocation integration remains UNVERIFIED |
| PB03 | First-party eligible action, server-origin signature | immutable event digest and independent verification | FUTURE / NOT_IMPLEMENTED: no authenticated eligible OctoPush event producer is established |
| PB04 | Forged event or tampered payload | no claim / no XP | cookR proof-context tampering is a different fixture boundary. Actual OctoPush event rejection remains FUTURE / UNVERIFIED |
| PB05 | Replay same event or binding across wallet/account | rejected with unchanged canonical XP | Nonce/request/profile isolation exists in wallet fixtures; event-to-claim replay and unchanged on-chain XP remain FUTURE / UNVERIFIED |
| PB06 | Single-source collusion / removed issuer | fail closed under configured threshold | Protocol-candidate source/signature negative tests do not establish a real issuer threshold or its lifecycle; bridge integration UNVERIFIED |
| PB07 | Valid action and independent approvals | PENDING, no canonical XP increment | XPPolicyV03 has protocol-fixture evidence. Authentic OctoPush action through that policy is NOT_IMPLEMENTED |
| PB08 | Challenge upheld / revoked proof | claim rejected or canonical XP removed | Protocol-specific V03 grant-revocation fixtures are separate from session/consent revocation; bridge XP/Tier effect UNVERIFIED |
| PB09 | Challenge complete | only valid finalized XP counts toward EffectiveTier | V03/EffectiveTierGate candidate fixtures only; approved source, release and real bridge consumer UNVERIFIED |
| PB10 | Real privilege consumer | allows valid, denies insufficient, paused, revoked, stale and RPC-error states | cookR final-delivery checks are a read-only transport boundary, not an on-chain Tier consumer. Real application consumer NOT_IMPLEMENTED |
| PB11 | Data minimization | no raw personal profile in on-chain logs or public proof payload | Local fixture privacy rules do not establish production retention, visibility consent or on-chain disclosure compliance; E2E UNVERIFIED |
| PB12 | Exact-tree reproducibility | pinned integration SHA, actor source code, test logs, event samples and artifact hash | Local docs/schema candidate checks only; corrected remote head, GitHub prospective-merge CI and independent sign-off PENDING |

## 6. Non-production OctoGFLO visibility slice
A separate, approval-gated Lovable change can add a **Development Evidence** area with two explicitly different sources:
- **Verified development ledger (static/curated until a safe public read-only API exists):** PR #11 MERGED; PR #12 MERGED; PR #13 MERGED; PR #14 PARTIAL FIX / OPEN. Show commit links, scope, evidence type and last verified UTC. Stale data must be marked; never invent live status.
- **DEMO proof journey:** keep simulated XP, labels and scenarios visibly DEMO. Display `OctoPush wallet/source NOT CONNECTED` and `OctoPass binding NOT ACTIVE` until real connectors pass PB01–PB12.
An ordinary external navigation link to OctoPush must not be presented as live data integration. No live EVM reads or wallet signing in this UI slice without separately approved review.

## 7. Phases and governance
1. **Read-only mapping:** inventory actual OctoPush profile/auth/event tables, relevant route and API implementations and OctoGFLO simulated adapters. Do not confuse plans with deployed behavior.
2. **Read-only wallet-proof pilot:** reuse cookR Pilot 0C/0D SIWE plus separate read consent and final-delivery checks; keep PB01/PB02 as historical fixture vectors. Durable binding remains a separate, unimplemented approval gate.
3. **Event-source pilot:** single eligible activity type, signed source envelope and adversarial replay/forgery cases.
4. **PIE bridge:** authorized attestation into existing XPPolicy, PENDING→finalize/revoke, exact policy digest checks.
5. **Application-level consumer:** effectiveTier fail-closed enforcement, recovery/appeal/privacy and complete E2E red-team evidence.

**Separate approvals required:** app changes and publish, contract change, new proof authority, main branch, external RPC, testnet and production deployment. This PR authorizes none. No main or Lovable application edits have been made by this design work package.

## 8. IF-02 contract freeze and documentation-only acceptance

This section governs the IF-02 read-only acceptance profile. Sections 2–5 describe future bridge goals and historical sketches, not completed integration. Freeze means immutable review inputs, not an implemented or approved backend. Reuse cookR Pilot 0C/0D; do not introduce another identity or wallet-binding protocol.

### 8.1 Frozen review inputs and implementation provenance

Profile: `gflo.integration.readonly.v1`, envelope version `1.0.0`, environments `LAB_OFFLINE` / `LAB_LOCALHOST`. The following IF-01 artifact names identify the accompanying review bundle, not repository-relative files or public endpoints. Their UTF-8 bytes are fixed by SHA-256; reviewer access to the exact bundle is an A-merge gate. Missing evidence is UNVERIFIED.

| IF-01 artifact | SHA-256 |
|---|---|
| IF01-REPORT.hu.md | `bcfa11d80c91132b20a09b7ca989216aedb792a5543db1689abf8954c66e533c` |
| PR-MATRIX.hu.md | `bb49303a423e7ad8ef057e0fda4d42d77d69abb11344d054d9a5dafa3f212ad8` |
| COMPATIBILITY-CONTRACT-v1.hu.md | `b80645fa96c69818cef1c053daf937f08cfb2267ea05fdebc92577bd77ffc8d7` |
| gflo.integration.readonly.v1.schema.json | `479c637038a40eff934ba545062ba411ae8705047072fcedeb850d7ac1e6c19e` |

Evidence anchors: original PR #15 head `58ab0840cd1e1fd273f7cdc0fe4e72f5b684ef95`, base `a4e11cb467c2eae6f6baf2419aaa38aa653fdf16`; [PB01/PB02 fixture](https://github.com/elanmust-GFLOer/gflo-pie/blob/7c5d34d54d6b1eb129018b51dd824cf95db1e0d7/tests-redteam5b/octopass-wallet-binding-pilot.cjs); [cookR proof](https://github.com/elanmust-GFLOer/GFLO.Octo_PIE-cookR/blob/38adc7955820a2d11f3e01ba592d521dfcdcb73c/pilot0c/proof.cjs) and [final transport](https://github.com/elanmust-GFLOer/GFLO.Octo_PIE-cookR/blob/38adc7955820a2d11f3e01ba592d521dfcdcb73c/pilot0d1/server.cjs). These are inspected snapshots, not assertions about live applications. The IF-02 local patch and computed tree are review artifacts; no new GitHub head/CI run is implied.

### 8.2 Wallet control, consent and authoritative context

- SIWE proves EOA wallet control only. A **separate** EIP-712 `BindingConsent` signature authorizes `id-entity.proof.read`, with `intent=ONE_SHOT_READ` and `persistentBindingAuthorized=false` in the proposed envelope. These envelope fields are projections, not additional signed fields. Type name does not grant durable binding consent; such consent and activation remain unimplemented.
- PB01/PB02 uses one custom `personal_sign` message combining control and consent, with `pie:proof:submit`. It is neither SIWE nor the separate read-consent pair and cannot be upgraded by relabeling signatures, scopes or generations. Existing foreign-profile nonce and pre-revocation epoch fixes remain historical regression requirements.
- Preserve the current signed `BindingConsent` type and exact server consent JSON: principal, profile, wallet, chainId, protocolSource, protocolManifestDigest, scopes, generation, nonce, challengeId, requestId, siweMessageHash, expiresAt, consentVersion, consentTextDigest, authProject. Wallet/chain/source/request/SIWE digest mismatches deny. SIWE version `1`, consentVersion `pilot0c/1`, EIP-712 domain version `0` and envelope version `1.0.0` are different version domains.
- Principal/profile/session come from the server-owned authority, never caller IDs, cookies, query data or wallet discovery. The current signed payload has authProject but no explicit issuer/audience/sessionId: session binding is enforced by the server's private record/handle, not by a portable signed session credential. The proposed envelope's issuer/audience/session references require a trusted authority projection. Synthetic authority is not Supabase Auth.
- The only current wallet profile is a canonical 65-byte low-s EOA signature. **ERC-1271: NOT_SUPPORTED** (cookR issue-time code `ERC1271_NOT_SUPPORTED`). Counterfactual or delegated account semantics, unknown wallet kinds, unknown versions and unauthorized scopes fail closed. Wallet control never establishes unique humanity, XP, Tier, token or governance authority.

| Realm | Exact SIWE domain and URI | EIP-712 name / salt preimage (UTF-8, Keccak-256) |
|---|---|---|
| Pilot 0C | `pilot0c.invalid`; `https://pilot0c.invalid/id-entity` | `GFLO Pilot 0C ID-Entity Consent`; `gflo:pilot0c:offline-consent:v1` |
| Pilot 0D-1 | `127.0.0.1:43817`; `http://127.0.0.1:43817/id-entity` | `GFLO Pilot 0D-1 Localhost Consent`; `gflo:pilot0d1:http://127.0.0.1:43817:consent:v1` |

Both existing consent domains use chainId `11155111`, version `0`, a realm-specific salt and **no verifyingContract**. Signatures cannot move between these realms. SIWE personal-sign message hash, SHA-256 source-manifest digest and Keccak-256 consent-text/EIP-712 digest are distinct preimages and must never be substituted.

### 8.3 Replay, expiry, revocation and release

Server-issued random 32-byte nonce, challenge/request IDs and exact session/source context are mandatory. Nonce encoding is hex without `0x` in SIWE and the same bytes with `0x` in typed consent. PB timestamps use milliseconds; cookR signed expiry uses integer Unix seconds; conversion must be exact and preserve original signed bytes.

The cookR auth/local generations must agree; PB profile+chain bindingEpoch is a separate domain. Revoked, expired, suspended, stale or UNKNOWN authority denies. Foreign profiles cannot consume or revoke another profile's challenge. PB owner-invalid attempts consume a nonce; cookR invalid signatures do not consume the victim challenge: preserve scheme-specific behavior rather than inventing a common retry rule.

After audit approval, recheck session, consent, generation and expiry immediately before protected delivery. Exact in-memory results permit one handoff only; serialized copies are observations, never delivery capabilities or bearer tokens. Concurrent replay or lost-response retry must not release a second result. Current authorization budget is at most one monotonic second, including cleanup; external deadlines only shorten it. Map/WeakMap state proves neither durable/distributed replay protection nor recovery. The frozen historical two-second harness is a different immutable baseline, not permission to relax this budget.

Revocation is protocol-specific: cookR session/consent revocation denies proof or delivery; PR #16 revokes its fixture binding/epoch; neither operation mutates PIE XP or Tier. XPPolicyV03 grant revocation and an authoritative EffectiveTierGate consumer have separate semantics and evidence requirements. No XP reduction, Tier downgrade or governance effect can be inferred from this offline proof or its revocation.

### 8.4 Event truth, protocol authority and privacy

A first-party OctoPush source must be a separately authorized server producer: bind issuer/key identity and rotation epoch, exact event ID/payload digest/algorithm, actor attribution, server commit/status, eligibility policy, freshness and issuer-scoped replay/nullifier rules. Signing by an allowlisted issuer does not prove factual work or independent review. Recheck moderation/deletion/revocation; distinguish agent activity from approved human contribution. No real eligible-event producer, custody policy or live bridge is established here; its signed format remains a future gate.

Source issuer, attestor, verifier and registry governance are distinct permissions. A wallet/profile/frontend/source record grants none of these roles. Verify exact signatures and applicable independence/threshold rules; issuer collusion and governance-authorized fabrication remain open trust risks. SIWE or BindingConsent must never be accepted as GFLOEvidence.

Read-only success accepts only `DEMO_FIXTURE` or `LEGACY_UNTRUSTED_XP`; `CANDIDATE_PROTOCOL` is not an approved source. UNKNOWN/CONFLICT/STALE source validity fails closed; a missing runtime/proxy manifest may be listed as explicitly untrusted historical inventory, never as verified canonical authority. Legacy Sepolia PIECore remains `LEGACY_UNTRUSTED_XP`. No canonical deployment is approved by this freeze. Future canonical XP requires separately approved core/policy/registry provenance; effective privileges require the authoritative EffectiveTierGate consumer, not selected target path or a cached badge.

The proposed OctoGFLO projection keeps `canonicalXp`, `historicalTier` and `effectiveTier` null, all authority flags false, capabilities/entitlements empty and `reusable=false`. Demo XP stays separately labeled. It cannot implement the numeric CanonicalPieReader by casting null/demo values to canonical zero. No existing application adapter or schema-to-runtime integration is implemented by this document.

Keep original signatures/consent bytes and session references in access-controlled evidence, out of public UI, URLs and logs. Profile–wallet links require separate visibility consent; narrow read-consent is not publication consent. Hashes/pseudonyms may remain linkable and are not automatic anonymization. Define retention, erasure, disclosure and audit access before any real data use; clients cannot make the verifier fetch arbitrary evidence URLs.

### 8.5 Acceptance boundaries and preserved findings

JSON Schema validates structure, required fields, enumerated realms/versions and non-authority flags. The acceptance runner must explicitly activate and version-pin URI/date-time validators, verify registration for every used format (including uuid), reject whole-input format failures and stop before acceptance if dependencies, registrations or positive/negative self-controls are missing. URI syntax validity is separate from the exact signing-domain/URI allowlist; RFC3339 format validity is separate from the frozen UTC-only profile and from freshness. It does **not** verify signatures, exact salt derivation, equal generations, freshness, authoritative sessions, source truth or final-release ordering. A structurally valid synthetic example is not a verified observation. Cross-repository adapter/E2E proof remains UNVERIFIED.

**AUD-01 / INV-10 remains OPEN.** Operational-role quarantine does not prove privileged-owner-resistant audit. Preserve the frozen0A failed concurrent-consent oracle and all red evidence; later green runs do not erase failures or approve a historical waiver. The separate worker correction `89abb35b18b2ad6120ff5d014a81cecf391e13f2` is not contained in the cited cookR #18 head; IF-01 records its mixed-cohort FAIL and current-code PASS separately.

**A:** documentation acceptance into `feature/pie-core-v0.2` only requires the exact final base/head/ordered merge parents/tree, one-file docs scope, hash-verified accessible evidence, schema ledger, independent review of that exact patch and explicit owner merge approval. Local checks are not prospective-merge CI; missing checks are UNVERIFIED.
**B:** code integration into gflo-pie main is not authorized. **C:** cookR laboratory integration remains BLOCKED pending its own aggregate/review/historical gate. **D:** staging and production activation remain BLOCKED.
**Pilot 0D-2: HOLD. Production: BLOCK.** No deployment, migration, privilege activation, real wallet binding or on-chain transaction is authorized by A.
