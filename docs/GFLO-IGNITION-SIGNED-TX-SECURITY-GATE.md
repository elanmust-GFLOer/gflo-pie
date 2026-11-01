# GFLO Ignition v0.1 — Signed Transaction Security Gate

**Status:** prepared; not yet validated in user's native Termux.
**Previous checkpoint:** 130/130 locally reported test scenarios.
**Artifacts:** `contracts/test/GFLOReceiptAttackTokenV01.sol` and `scripts/gflo-ignition-v01-signed-tx-security.mjs`.

## What this test adds
- Deterministic **synthetic test-only private keys** are generated in script; NEVER replace these with real credentials.
- EthereumJS v10 `createLegacyTx(...).sign(...)` and `runTx(vm,{tx})`, Cancun hardfork, genuine VM nonce and gas accounting.
- Signed contract creation transactions for PIE Core, XP Policy, Trusted Registry, test burn token and Ignition.
- Failed burn & partial-burn transactions must return status 0 with **zero receipt logs** and preserve token/PIE state.
- Success includes receipt logs, token supply/balance delta, tier transition and exactly one Quorum-independent approved action.
- Mock token makes a nested reentrant call to `ignite()`, stores the returned 4-byte selector. Test checks exact `Busy()` error selector.
- Failed execution still consumes transaction nonce and gas, unlike simplistic `runCall` smoke tests.

## Cautions
- This remains an in-memory EthereumJS VM with signed transactions, **not** Sepolia or an independent client test.
- Test token is malicious by design. It can mint arbitrarily and does not represent verified GFLO bytecode.
- Solidity contracts from the successful 130/130 checkpoint have not been changed.
- No tokenomics fee freeze or migrated identity has been implemented.
- User must run the script. A failing test must be diagnosed, never counted as PASS.
- No external wallet or secret is needed. No new npm installation is expected because @ethereumjs/tx ships as VM dependency in the existing Termux setup (if unavailable, verify package resolution first).
- Receipt support and EthereumJS version compatibility should be checked against actual Termux console output.

## Exit criteria
Receipt status / logs confirmed; exact Busy selector checked; nonce/gas recorded; no state mutations on failed transactions. Next: independent EVM gas profiling/fuzz/invariants and Safe-admin threat model.
