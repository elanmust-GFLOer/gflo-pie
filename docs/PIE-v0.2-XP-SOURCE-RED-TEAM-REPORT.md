# GFLO PIE v0.2 — XP Source Authenticity Red Team

**Reported:** 2026-10-15
**Branch:** `feature/pie-core-v0.2`
**Status:** local Termux result reported by developer, **not independent audit, CI, or chain deployment**.
**Runner:** `scripts/pie-v02-xp-source-authenticity.mjs`
**Solidity:** 0.8.34+commit.80d5c536.Emscripten.clang

## Developer-provided output

```text
=== GFLO XP SOURCE AUTHENTICITY — RED TEAM ===
solc: 0.8.34+commit.80d5c536.Emscripten.clang
✅ 1/7 Legitimate and forged policy runtime code hashes differ
⚠️ Original adapter trusts fake totalXP = 65000 (intentional failing security property)
✅ 2/7 ATTACK REPRODUCED: original adapter accepts fake XP source
✅ 3/7 Hash-guard rejects forged policy against reviewed genuine hash
✅ 4/7 Hash-guard accepts genuine XP Policy with pinned hash
✅ 5/7 Approved policy gives correct 25 Genesis XP
✅ 6/7 Zero expected code hash is rejected
✅ 7/7 No XP or policy-replacement mutator exposed
✅ 7/7 RED-TEAM SCENARIOS COMPLETED
⚠️ Original adapter spoof vulnerability reproduced; hash-guard pilot rejected mismatched runtime.
Not proof of deployed-source authenticity: expected hash must be independently trusted.
```

## Finding: deployment provenance / substitution threat

The existing `CanonicalXPAdapterV02` rejects missing-code contracts and checks that `xpPolicy.pie() == pieCore`. A fake policy can implement those same ABI functions and return a fabricated total, so **an adapter initially constructed with that malicious policy** will trust its forged total XP (65,000 in the demo).

**Threat scope:** This is a *configuration/deployment provenance weakness*. A malicious external user cannot replace an adapter's immutable `xpPolicy` address after deployment using the exposed adapter API; the exploit requires deployment using the malicious source, or deception/compromise of whatever authority selects the XP source.

## Tested mitigation and its limits

`CanonicalXPAdapterHashGuardV02` compares `policy.codehash` against a constructor-provided expected hash and verifies the PIE linkage. Under the test's trusted, genuine policy runtime hash, the fake source is rejected.

However:
- If the deployer can choose a malicious policy **and the matching malicious code hash**, the hash check itself can still succeed.
- A codehash only identifies runtime bytes. It does not prove who authorized a deployment, verifier evidence truth, or absence of malicious logic in reviewed code.
- Constructor immutables, chain hardfork/compiler settings, proxy patterns, and policies whose code changes affect codehash strategy.
- The current `HashGuardV02` is an experimental pilot. Do **not** claim this solves policy provenance.

## Engineering next gate: authentic policy approval

1. Define and publish a reviewed implementation manifest: source commit, compiler version, optimizer, EVM hardfork, contract name, deployed addresses, chain ID, runtime codehash and contract linkage; have the approving authority sign/verify it separately from deployment.
2. Do not treat deployer-supplied `expectedHash` as automatically trusted. A safer design can use a governance-controlled immutable allowlist/factory of approved policy sources, with controlled versioning, multisig/timelock and explicit migration review.
3. Write a **negative-control test** deploying the hash guard with the fake policy's own hash. It should expose the remaining trust-root problem rather than being mislabeled as defense.
4. Specify how XP balances, event IDs/evidence replay state, and one-time Genesis XP are preserved across policy replacements. No switching to a new XP ledger without migration proof.
5. Test malicious policy address/linkage substitutions, no-code contracts and compromised approval roles.

## Impact on project progress

Previous developer-reported tests: 59/59 across five suites. This red-team batch: **7/7 scenarios executed as expected, with one intentionally successful spoofing attack**. It is valid to count 66/66 executed expected scenarios, but **not** 66 independent security protections or an audited/secure release.

**No real GFLO ignition, Sepolia deployment, independent audit or public release.** Do not merge the trust-boundary pilot into main based on these checks alone.
