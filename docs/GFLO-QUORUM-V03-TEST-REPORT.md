# GFLO PIE v0.3 Quorum rotation — Termux result

**Date:** 2026-10-15  
**Branch:** `feature/pie-core-v0.2`  
**Runner:** `scripts/pie-v03-registry-quorum-rotation.mjs`  
**Contract:** `contracts/GFLORegistryQuorumV03.sol`  
**Solidity compiler:** `0.8.34+commit.80d5c536.Emscripten.clang`  
**Environment:** Android Termux / local EthereumJS VM  
**Status:** developer-supplied test output; neither independently verified nor audited.

```text
=== GFLO REGISTRY QUORUM V0.3 — ROTATION AND STALE PROPOSALS ===
solc: 0.8.34+commit.80d5c536.Emscripten.clang
✅ 1/13 Three distinct members and threshold 2 initialized
✅ 2/13 Outsider cannot propose, approve or handoff
✅ 3/13 Governance transfer requires original nomination
✅ 4/13 Unknown selector blocked
✅ 5/13 Proposer auto-approved but one signer cannot execute
✅ 6/13 Outsider approval rejected
✅ 7/13 Second signer approves and any caller may execute
✅ 8/13 Proposal cannot be replayed
✅ 9/13 Approved activation leaves XP reads paused
✅ 10/13 Quorum unpauses and canonical Genesis 25 XP reads
✅ 11/13 Quorum cannot rotate without two distinct signer votes
✅ 12/13 Two signers rotate C to new signer and increment epoch
✅ 13/13 Old approved proposals and revoked signer cannot act
✅ 13/13 QUORUM V03 ROTATION SCENARIOS COMPLETED
Pilot: quorum-based rotation only. No lost-majority recovery, WebAuthn validation, timelock or independent audit.
```

## Latest-suite cumulative checkpoint

Previous suite total **89/89** + new Quorum v0.3 **13/13** = **102/102** locally reported expected scenarios. Older provenance 7/7 is superseded by 8/8 and should not be counted twice. Some scenarios intentionally reproduce exploitable behavior; this total is **not a count of security guarantees**.

## Current engineering gate

- Distinct quorum signer addresses may be EOAs or contract smart accounts using `msg.sender`.
- Passkey/WebAuthn itself is NOT implemented here; it must be authenticated inside trusted smart-account implementation, not presumed from the address.
- Test a contract-account signer in a local EVM harness: owner-authorized relay, `msg.sender` semantics, approval accounting per smart-account address, old signer revocation, and proposal epoch invalidation.
- Address loss of two signers, timelock / veto, signature replay, signed transactions, deployed EVM compatibility, canonical release-manifest trust, and migration before public deployment.
- Keep `main` and previously tested contract versions unchanged pending review.
