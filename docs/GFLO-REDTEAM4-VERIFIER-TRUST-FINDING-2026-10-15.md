# GFLO RED TEAM 4 — Authorized verifier evidence-fabrication finding

Date: 2026-10-15
Branch: `feature/pie-core-v0.2`
Test runner: `scripts/gflo-redteam4-verifier-trust-boundary.mjs`
Status: **CONFIRMED IN LOCAL TEST** — HIGH conditional risk for any financial, access-control or reputational Tier privileges. No public-network exploitation is claimed.

## User-executed output

```text
=== GFLO RED TEAM 4 — COMPROMISED VERIFIER TRUST BOUNDARY ===
Solc: 0.8.34+commit.80d5c536.Emscripten.clang
✅ 1/13 Signed Safe + Core + XP + Registry + Token + Ignition deployments
✅ 2/13 One Safe signer cannot bind ignition; signed failure preserves nonce
✅ 3/13 Two Safe signers bind ignition and activate canonical registry
✅ 4/13 25 Genesis XP blocks signed ignition without allowance; token stays intact
✅ 5/13 Signed approval exists; low XP still reverts with identical state
✅ 6/13 Safe 2/3 approves XP verifier and reward rule; canonical XP 1025
✅ 7/13 Insufficient allowance rejects signed ignition and preserves all state
✅ 8/13 Signed valid Ignition burns exactly 1 GFLO and advances only Tier 1
✅ 9/13 Second signed ignition under Praxis XP threshold reverts atomically
✅ 10/13 Without verifier role, forged unique evidence cannot earn XP
🚨 FINDING: 4 invented, unique evidence identifiers accepted as 4000 XP by authorized verifier
🚨 IMPACT: canonical XP reached 5025 without proof validation; 1000 prior XP also came from an unconstrained fixture award
✅ 11/13 Trusted but dishonest verifier can accumulate fabricated XP across cap windows
🚨 FINDING: fabricated attestations were sufficient to satisfy Tier 2 prerequisite
✅ 12/13 XP earned from fabricated claims can unlock an actual signed Praxis ignition
⚠️ GOVERNANCE LIMIT: verifier revocation does not cancel previously awarded XP or undo Tier 2
✅ 13/13 Safe 2-of-3 revocation blocks further fraudulent XP, but leaves earned XP intact
✅ 13/13 RED TEAM 4 TRUST BOUNDARY REPRODUCTION CHECKS EXECUTED
🚨 SECURITY FINDING CONFIRMED IN LOCAL TEST: authorized verifier can grant unverified XP using invented unique events/evidence.
```

The above is an observed user-run Termux local EthereumJS signed transaction simulation using synthetic wallets, not a deployed-network finding.

## Root cause

`XPPolicyV02.awardXP(account,ruleId,eventId,evidenceHash)` authenticates the caller with `verifierRoles[msg.sender]` and performs rule, quotas, replay-protection and PIE identity checks. It does **not** independently authenticate the real-world underlying event, attest the event's origin, prove completion, or verify the evidence hash's meaning. In `XPPolicyV02.sol` the comment explicitly says `Neither eventId nor evidenceHash proves truth without the verifier's integrity.`

`TrustedXPSourceRegistryV02` enforces a pinned policy shape and governance codehash/ownership checks, **not evidence veracity**.

`GFLOIgnitionV01` requires only canonical XP threshold, selected path, GFLO allowance and token-burn accuracy before `PIECoreIgnitionV01.upgradeTier`. It has no independent attestation check.

Therefore `2-of-3 Safe` is a meaningful administrator-authentication boundary but not a substitute for verifier evidence integrity.

## Observed effect

- Unauthorized verifier blocked.
- Authorized verifier, behaving dishonestly, submitted four distinct synthetic events/evidence hashes worth 4,000 XP across allowed windows.
- The test also awarded 1,000 XP before the attack without off-chain independent evidence.
- Canonical XP = Genesis 25 + earned 5,000 = **5,025**.
- The same signed local transaction test successfully consumed the illustrative Tier 2 GFLO burn and achieved Tier 2.
- Safe 2-of-3 revoked that verifier role; future awards were blocked; **previous awarded XP and Tier 2 remained**.

The report does **not** establish the loss of real assets, a mainnet exploit, or a cryptographic signature compromise.

## Risk and operational options

**Immediate pause/containment (existing authority; no new contracts):**
- Safe governance can `XPPolicyV02.setPaused(true)` to halt *new awardXP* operations.
- Safe governance can `TrustedXPSourceRegistryV02.setPaused(true)` to block canonical XP reads and thereby future Ignitions. It does not reset earned XP, burn refunds or Tier state.
- Safe can `XPPolicyV02.setVerifierRole(compromisedVerifier,0)` to block that verifier's future awards. These changes do not retroactively invalidate earned XP.
- Pause only as operational response; do not describe it as a fraud cure.

**Minimal pre-testnet redesign candidates (requires new security design and tests):**
A. Explicit policy assumption: XP is a trusted-attestation system; choose independent verifier onboarding, published evidence standards and operational review. Accept that rogue authorized verifiers can forge within caps. Avoid claims of objective proof.
B. Reversible/expiry-aware *earned XP* ledger before launch: keep event-level grants with a revocable validity state; canonical XP sums valid awards. Define how an already-ignited Tier changes, whether tiers are immutable, and what happens to already burned GFLO before implementing. Straight subtraction alone does not roll back a Tier.
C. Independent evidence validation before an award: evidence content hash linked to a verifiable source or at least signatures from an independently controlled attestor; two signatures from colluding actors are still not proof of truth. Define claim, dispute and correction windows with minimum latency as appropriate, or move complex evidence review off-chain with verifiable attestations.
D. Limit real privileges associated with irreversible Tier until the confidence in XP is improved. A Tier-only flag with no material rights is less damaging than token-governance or financial permissions.

## Release gate

**BLOCK any economically meaningful / publicly trusted Tier privileges pending explicit risk acceptance or mitigation.**
Do not confuse test case count with security assurance. Previously reported 195 local passing scenarios remain separate from this **13/13 vulnerability-reproduction result**, which validates the attack, not the defense.

**Architecture hazard:** `TrustedXPSourceRegistryV02.activatePolicy` pins a source once; `PIECoreIgnitionV01.bindIgnition` is irreversible. Their deployed instances have no straightforward in-place mitigation migration path. If production instances have not been deployed, redesign before network deployment. Do not attempt post-deployment patching by changing the source-of-truth assumptions.

## Next proposed RED TEAM gate

RED TEAM 5 should inspect **evidence authenticity assumptions plus recovery semantics**, not simply retest reward caps. Prove in a new intentionally isolated fixture that:
1. pause and revocation block *future* awards;
2. already-earned XP remains unless ledger semantics change;
3. previously unlocked Tier stays, including after policy/Registry pause;
4. an untrusted verifier cannot forge; a legitimate but corrupt verifier can still forge under the existing model;
5. proposed remedial changes fail closed without disrupting honest claims;
6. token burns are not silently reversed / claimed refunded without explicitly encoded policy.
