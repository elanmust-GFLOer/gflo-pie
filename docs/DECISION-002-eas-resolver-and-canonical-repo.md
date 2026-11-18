# DECISION-002 — EAS as the attestation layer; gflo-pie as the canonical repository

Date: 2026-11-18 · Status: accepted for the development line, **not audited, not deployed**

## 1. Attestations move to EAS

`XPAttestationResolverV01` replaces `XPPolicyV03` as the XP source for new
deployments. Evidence is an attestation on the Ethereum Attestation Service
(EAS) under one schema:

```
bytes32 ruleId, bytes32 eventId, bytes32 evidenceDigest   (revocable, no expiration)
```

The resolver applies every XPPolicyV03 rule inside `onAttest`: rule registry and
reward bounds, per-rule attester allowlist, PIE identity required, event and
evidence replay protection, per-rule/daily/weekly caps, 3-day challenge period
(PENDING → VALID), governance revocation and pause that fails closed. It keeps
the `pie()`, `owner()` and `totalXP()` ABI, so `TrustedXPSourceRegistryV02` and
`EffectiveTierGateV01` work unchanged.

Why: EAS is the shared attestation standard with deployments on Ethereum and the
major L2s, existing indexers/explorers (easscan) and wallet/tool support. Our
value is the policy, not the signature plumbing. Attestations become portable:
other protocols can read GFLO evidence without our contracts.

### What changed relative to XPPolicyV03

| XPPolicyV03 | XPAttestationResolverV01 |
|---|---|
| Own EIP-712 proof, nonce, `validUntil` | EAS authenticates the attester; EAS UID + delegation deadline/nonce |
| Separate verifier (caller) and attestor (signer) | Resolver sees only the attester. High-value rules (≥ 500) require a level-2 attester, which SHOULD be a Safe multisig. Delegated attestation (`attestByDelegation`) still lets a relayer submit a signer's attestation. |
| `revoke()` by owner | `governanceRevoke()` by owner **and** EAS revoke by the original attester (always allowed, also while paused). No double deduction. |
| — | Rejects foreign schemas that point at this resolver, irrevocable or expiring attestations and self-attestation. |

**Readers MUST use `grants(uid).status`.** A governance revocation does not set the
EAS `revocationTime` (EAS lets only the attester revoke), so an EAS explorer can
show an attestation as active while the resolver has revoked it.

Unchanged trust limit: a valid attestation proves who asserted the event, not
that the work happened. Attester collusion and Sybil identities remain open.

Evidence: `tests-v02/test/XPAttestationResolverV01.eas.cjs`, 10 tests against the
real EAS 1.9.0 contracts (npm prebuilt artifacts, not mocks). Five targeted
mutations (schema check, self-attestation, trust level, revoke deduction,
evidence replay) each fail exactly one test.

## 2. gflo-pie is the single canonical repository

| Repository | New status |
|---|---|
| `gflo-pie` | **Canonical**: contracts, decisions, tests, integration |
| `GFLO.Octo_PIE-cookR` | Imported verbatim into `integration/octo-pie/`; source repo archived |
| `GasFeeLoop-` | Legacy v3, archived (history and RT6B legacy-isolation evidence) |
| `gflo-clean` | Early prototype, archived |
| `gflo-backend` | Stays the Railway deploy source for now; move into `gflo-pie/backend/` once the Railway service is re-pointed |

## 3. Live backend no longer reads v3

`gflo-backend` v3.0 has no default addresses and refuses the retired v3
addresses even if a Railway variable still holds them. Until the v0.2 contracts
are deployed, reputation endpoints answer 503 and the tier gate denies every
request. See that repository's README.
