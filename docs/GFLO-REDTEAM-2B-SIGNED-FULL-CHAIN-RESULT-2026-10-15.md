# GFLO RED TEAM 2B — signed full-chain rollback report

Date: 2026-10-15
Branch: `feature/pie-core-v0.2`
Runner: `scripts/gflo-redteam2b-signed-full-chain.mjs`
Execution: Android Termux, Node 25.8.0, Solidity 0.8.34; local EthereumJS v10 `runTx` with synthetic private keys and official Safe v1.5.0 compiled artifacts. No public network.

## User-run result

The user posted terminal output reporting:

```text
=== GFLO RED TEAM 2B — SIGNED FULL ATOMIC RECEIPTS ===
Solc: 0.8.34+commit.80d5c536.Emscripten.clang
✅ 1/9 Signed Safe + Core + XP + Registry + Token + Ignition deployments
✅ 2/9 One Safe signer cannot bind ignition; signed failure preserves nonce
✅ 3/9 Two Safe signers bind ignition and activate canonical registry
✅ 4/9 25 Genesis XP blocks signed ignition without allowance; token stays intact
✅ 5/9 Signed approval exists; low XP still reverts with identical state
✅ 6/9 Safe 2/3 approves XP verifier and reward rule; canonical XP 1025
✅ 7/9 Insufficient allowance rejects signed ignition and preserves all state
✅ 8/9 Signed valid Ignition burns exactly 1 GFLO and advances only Tier 1
✅ 9/9 Second signed ignition under Praxis XP threshold reverts atomically
✅ 9/9 RED TEAM 2B SIGNED FULL CHAIN CHECKS PASS
```

The first attempted 2B run stopped at check 3 with a JavaScript tuple-decoding issue: `read()` returns the first decoded item from `activeSource()`; treating it as `.policy` returned `undefined`. This was corrected in the runner without changing Solidity contracts. The above result is from the updated runner.

## Grounded security claims

- Official Safe proxy (3 owners, threshold 2), XP Policy owner, Registry governance and Core binding authority are integrated in the same signed-transaction scenario.
- Only 2 of 3 Safe owner signatures authorize privileged actions, and signed failure with one signer does not increment the Safe nonce.
- Canonical XP reads 25 initial Genesis and 1025 after one 1000 XP reward.
- Low XP and zero allowance scenarios fail in signed outer transactions with status 0 and no logs; all measured contract-state variables remain equal before and after each failed attempt.
- The authorized token burn consumes precisely 1 GFLO (18 decimals) and advances Tier 0→Tier 1; the fee is an illustrative test parameter, not approved tokenomics.
- Another attempt below Praxis XP 5000 fails without advancing Tier or token supply mutation.
- Signed failed outer transactions consume gas and the outer sender nonce even where application-state effects revert; distinguish outer signer nonce from Safe nonce.

## Limitations and remaining gates

- EthereumJS local `runTx` is not another EVM client or an actual public chain. It proves the reported behavior for this model and exact fixtures, not mainnet readiness.
- The 1 GFLO test fee, initial allocation and synthetic owners are NOT final GFLO governance/tokenomics decisions.
- No successful Tier 2 (Praxis) transition (5000 canonical XP) with daily 1500 / 7-day epoch 3000 caps has yet been validated in the same Safe + OpenZeppelin signed full-chain scenario. Epoch advancement and event/evidence deduplication need independent tests.
- No external verifier evidence authenticity, Sybil resistance, third-party security audit, gas-bounded stress runs, Safe module/guard/fallback risk gate, dependency audit closure or deployed Safe codehash verification.
- Previously reported cumulative local scenario count: 172 + 9 = 181 / 181. The suites are overlapping, and three killed RED TEAM 1 mutants are a separate metric; do not add them to the 181.
- The test fixture checks successful receipt logs and state; production delivery should also parse expected event arguments, runtime bytecode provenance, transaction envelope and permit/approval UX.

## Recommended next step

**RED TEAM 3 / Tier-2 positive and canonical time-window security:** independently establish 5000 XP across permitted reward-cap windows, then require signed second Ignition to burn exactly the configured Tier-2 amount; assert duplicate-event/evidence rejection, daily+weekly caps and no Tier/supply changes on rejected claims, and verify unknown/external verifier restrictions. If valuable, test the full sequence under an independent EVM implementation or testnet after local robustness is confirmed.
