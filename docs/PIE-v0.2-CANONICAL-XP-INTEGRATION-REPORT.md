# GFLO PIE v0.2 — Canonical XP Integration: Local Test Record

**Status:** developer-reported local passing tests; not independently reproduced, CI-verified, or audited.
**Date reported:** 2026-10-15
**Branch:** `feature/pie-core-v0.2`
**Runner:** `scripts/pie-v02-canonical-xp-integration.mjs`
**Contracts:** `contracts/PIECoreV02.sol`, `contracts/XPPolicyV02.sol`
**Compiler:** Solidity 0.8.34+commit.80d5c536.Emscripten.clang
**Execution:** Android Termux, EthereumJS in-memory VM; both contracts created in VM.

## Developer-supplied terminal result

```text
=== GFLO PIE + XP POLICY — CANONICAL XP INTEGRATION ===
Compiler: 0.8.34+commit.80d5c536.Emscripten.clang
✅ 1/12 Contracts created and XP Policy points to PIE Core
✅ 2/12 Before Genesis: canonical total XP is zero
✅ 3/12 Genesis: independent wallet totals equal 25
✅ 4/12 Unauthorized XP cannot change canonical total
✅ 5/12 500 verified XP yields canonical total 525
✅ 6/12 Replay attack cannot double-credit 500 XP
✅ 7/12 Other wallet's XP remains isolated
✅ 8/12 Selected Path may change, earned XP stays unchanged
✅ 9/12 Reaching 1000+ XP does not automatically advance Tier
✅ 10/12 Daily limit failure leaves balance, counter and evidence reusable
✅ 11/12 Invalid identity cannot receive a positive XP award
✅ 12/12 Core Genesis XP stays 25 even when canonical XP is 1525
✅ 12/12 CANONICAL XP INTEGRATION CHECKS PASS
Scope: current two-ledger aggregate; no Core storage migration or real-token Ignition.
```

## Interpretation

The current XP aggregate is `XPPolicyV02.totalXP(account) = PIECoreV02.getIdentity(account).xp + XPPolicyV02.earnedXP(account)` for existing identities. The PIE Core's `Identity.xp` still stores the **initial 25 Genesis XP**; it is not automatically updated by the XP Policy. No Tier can be upgraded by this integration.

The test uses role-authorized XP credits; the contract itself does not attest that real-world evidence is authentic. The tested revert paths and invariants do not constitute a security audit.

## Cumulative locally reported checks

| Suite | Passed |
| --- | ---: |
| PIE Core Phase 1 | 11/11 |
| XP Policy CREATE smoke | 10/10 |
| XP Policy boundary/security | 17/17 |
| Canonical XP aggregate integration | 12/12 |
| **Aggregate** | **50/50** |

Suites overlap; count is not evidence of 50 independent audited guarantees. GitHub Actions is not currently an independently available signal.

## Next engineering gate (before GFLO Ignition)

1. **Fix the authoritative XP source boundary**: require a pinned XP Policy address and linkage to the intended PIE Core, rather than accept an arbitrary third-party `totalXP` contract.
2. Preserve wallet Genesis XP and earned XP exactly once; define future migration policy and prevent duplicated credit when switching ledgers.
3. Define how the future Ignition contract gets this authoritative aggregate without exposing unrestricted XP/Tier mutators.
4. Expand regression suite: mismatched core/policy pair, unauthorized policy replacement, ledger rollback/atomicity, malformed identity, replay across policy instances/migrations.
5. Define evidence source trust and control of verifier roles before accepting XP as real-world merit.
6. Independently test token burn with mock GFLO and failure/reentrancy scenarios **only after** the canonical source design is approved.

**Deployment status:** no Sepolia deployment, no production deployment, no audit.
