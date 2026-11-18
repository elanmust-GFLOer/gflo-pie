# RED TEAM 6C — signed local EVM result and HIGH source-authenticity finding

Date: 2026-10-17
Status: **User-run 8/8 completed; HIGH trust gap OPEN**
Source: project owner's pasted Android Termux output, not independently rerun by this document.
Runner: `scripts/rt6c-source-authenticity.mjs`
Solc reported: `0.8.34+commit.80d5c536.Emscripten.clang`

## Observed output

- 1/8 Safe 2/3, fresh XPPolicyV03 and dynamic Gate initialized.
- 2/8 Authorized verifier requires independent permitted attestor; unsigned proof rejected.
- 3/8 **HIGH finding**: invented off-chain Builder event signed by permitted attestor and submitted by authorized verifier became PENDING.
- 4/8 PENDING XP did not unlock Tier 1.
- 5/8 **HIGH finding**: the fictitious event finalized after 3-day challenge, yielding 1000 canonical XP.
- 6/8 Tier 1 Ignition GFLO burn and effective Tier 1 succeeded on the fictitious XP.
- 7/8 Safe 2-of-3 revoked the grant; effective Tier returned to 0 while historical achieved Tier remained 1.
- 8/8 Evidence replay and paused Registry failed closed.

Printed footer: `8/8 RED TEAM 6C LOCAL SIGNED EVM SCENARIOS EXECUTED; HIGH SOURCE-AUTHENTICITY FINDING OPEN`.

## Interpretation

**This is not 8 new independent security properties.** The runner reuses prior RED TEAM 5A's eight-scene scenario with (i) legacy staking and (ii) a fictitious off-chain event. The original test fixture *does not independently authenticate the external event.* The local test demonstrates that authorization and EIP-712 signature verification do **not** establish the factual occurrence of off-chain activities.

The successful acceptance of a fabricated, properly signed claim is an intentionally reproduced **HIGH conditional trust risk**, not a security pass. The later revocation blocks future Tier privileges but does not undo already executed or irreversible actions such as GFLO token burning.

## Recommended gate

1. Separate source event issuer from the XP attestor and transaction verifier; avoid treating two independently named keys as evidence of distinct real-world trust domains.
2. Authenticate a server-side OctoPush Builder completion event with unique scoped event ID, issuer identity, signed payload, expiry/nonce and proof digest, and reject falsified/unissued events before attestor signing.
3. Implement a narrowly scoped deterministic proof adapter and test it locally (RT6D). No GFLO token payment, source identity migration or production deployment until that defense is reviewed.
4. Challenge periods, appeals and human review complement source validation; none substitutes for authentic evidence.
5. Red-team compromised issuer and combined issuer/attestor collusion; a trusted issuer can still lie, even if the adapter cryptographically validates its signature.

## Limits

No real OctoPush data, external RPC, public-chain contract deployment, independently audited code or empirical Sybil resistance was validated.
