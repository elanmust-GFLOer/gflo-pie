# GFLO PIE v0.2 — 2-of-3 Registry Quorum test report / next gate

**Reported by developer:** 2026-10-15
**Branch:** `feature/pie-core-v0.2`
**Compiler:** Solidity 0.8.34+commit.80d5c536.Emscripten.clang
**Environment:** Android Termux + local EthereumJS VM
**Contract:** `contracts/GFLORegistryQuorumV02.sol`
**Runner:** `scripts/pie-v02-registry-quorum-security.mjs`
**Status:** user-reported PASS, *not* independent audit or deployed-chain verification.

## Reported terminal result

```text
=== GFLO REGISTRY QUORUM 2-OF-3 — SECURITY ===
solc: 0.8.34+commit.80d5c536.Emscripten.clang
✅ 1/10 Three distinct members and threshold 2 initialized
✅ 2/10 Outsider cannot propose, approve or handoff
✅ 3/10 Governance transfer requires original nomination
✅ 4/10 Unknown selector blocked
✅ 5/10 Proposer auto-approved but one signer cannot execute
✅ 6/10 Outsider approval rejected
✅ 7/10 Second signer approves and any caller may execute
✅ 8/10 Proposal cannot be replayed
✅ 9/10 Approved activation leaves XP reads paused
✅ 10/10 Quorum unpauses and canonical Genesis 25 XP reads
✅ 10/10 QUORUM INTEGRATION SCENARIOS COMPLETED
Pilot: fixed signers, no passkey verification, no rotation/recovery, no independent code audit.
```

Previous attempt halted on the third test because the test harness attempted to decode a *nested Registry custom error* from the Quorum ABI. The updated runner asserts the call failed and the governance state stayed unchanged instead; user reran and completed all ten.

## Count of current local regression scenarios

| Suite | Results |
| --- | ---: |
| PIE Core | 11/11 |
| XP Policy smoke | 10/10 |
| XP boundary/security | 17/17 |
| PIE–XP integration | 12/12 |
| Canonical XP adapter | 9/9 |
| XP source provenance **latest** (8 checks, supersedes the old 7-check runner) | 8/8 |
| Trusted registry security | 12/12 |
| Registry Quorum | 10/10 |
| **Current-suite aggregate** | **89/89** |

The old 7/7 authenticity runner is intentionally **not added a second time** because its checks are included by the newer 8/8 provenance runner. Red-team scenarios include an intentionally successful malicious-policy/governance action; their expected execution does not mean vulnerability elimination. Count is not 89 independent security guarantees.

## Quorum limits

- Exactly three fixed addresses and threshold 2; the contract does **not** rotate, revoke or recover signer keys.
- If two signer keys are lost, approvals cannot reach threshold and governance is permanently stuck.
- If any two signers collude or are compromised, they can jointly approve untrusted policy code + matching codehash; a threshold reduces single-key risk, not source-review risk.
- This pilot contains no timelock / cancellation / signature-based off-chain proposal flow.
- Current quorum uses `msg.sender` to check membership; it does not itself use passkeys, WebAuthn, ERC-1271, P-256, or ERC-4337.
- Registry is single-activation and its pinned policy owner check makes owner changes a runtime failure of reads; recovery/migration is not solved.
- The VM runCall-based local harness is not a substitute for signed transactions, fork testing, EIP-1559 execution, gas profiling, fuzzing or an independent audit.

## Proposed P0/P1 gate before passkey live implementation

1. **Signer recovery and governance continuity design:** explicit threshold-based replacement and removal of compromised signers, protection against duplicate/zero addresses, two-phase transfer, per-proposal nonce/version invalidation, and emergency pause/kill switch under validated quorum.
2. **Allow for passkey smart account signers** (not bare P-256 public keys treated as EOAs). ERC-1271 specifies contract-account signature validation; ERC-4337 is an account abstraction execution option. WebAuthn credential challenge/origin/rpId/flags validation must be implemented by the signer wallet or a dedicated WebAuthn verifier.
3. **Independent source provenance:** a published reviewed release manifest binding chain ID, contract addresses, codehash, compiler build, deployment artifact and signed governance approval. No arbitrary caller-supplied approved hash.
4. **Adversarial acceptance testing** for signer loss, two-key collusion, unauthorized rotation, stale proposal after rotation, replay/cross-chain misuse, governance transfer, and normal XP reads after authorized recovery.
5. Only after these pass, evaluate v0.3 signer manager or a proven battle-tested smart-account/multisig to avoid reinventing wallet-security functionality.

**Recommendation:** Do not modify the passing GFLORegistryQuorumV02 in place. Create a separate v0.3 recovery/governance proposal and test with the existing registry in VM, retaining `feature/pie-core-v0.2` until explicit review.
