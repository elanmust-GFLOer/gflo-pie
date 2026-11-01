# Isolated PIE v0.2 build baseline

Scope: compile the complete current `contracts/` tree and run the existing 15
Genesis/Path and policy-pause tests for `PIECoreV02`. This is not functional coverage for every
contract, a full protocol audit, a deployment, or an architecture decision.

## Current checkpoint (2026-11-01)

Main baseline `18b1ef168cae9eded38e8fa5998f1308627ab5ed` contains 26 project Solidity files; the clean build compiles 47 files including imports and runs 15 assertions. Compiler remains local solc-js 0.8.28, optimizer 200, Cancun. Historical counts/hashes below belong to their named commits. Current dependency disposition and lock comparison: [maintenance](../docs/MAIN-MAINTENANCE-2026-11-01.md).

## Root cause and fix

The prior Hardhat project lived in `tests-v02/` but pointed `paths.sources` at
`../contracts`, outside its project root, causing HH1007.
`prepare-sources.cjs` now copies the complete source tree byte-for-byte to
`tests-v02/.sources/contracts/`. It does not select a single contract or skip
test mocks. Every current Solidity source is compared against its original and
recorded in `evidence/sources.json`; stale copied sources are removed first.

Contract contents and the existing test assertions are unchanged. At the base
commit dbd02d3f1ffd31abff3bda9caaa9852ee7cecf5c there are 22 project Solidity
files. With the pinned OpenZeppelin imports, CI compiles 43 Solidity files.

The isolated test package declares its own OpenZeppelin dependency and exact
test-tool versions. Hardhat uses the local lockfile-bound solc-js 0.8.28 instead
of downloading a compiler. Optimizer remains enabled with 200 runs. The test
compiler target and local Hardhat hardfork are explicitly Cancun, matching the
integration EVM fixture; this does not assert a target production deployment.

## Reproduction

Use Node 22.23.3. From `tests-v02/`:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run compile
npm test -- --no-compile
```

`npm test` without `--no-compile` also prepares sources and compiles.
No mnemonic, private key, external RPC, deployment config or QuickNode endpoint
is required. The chain is the disposable in-process Hardhat chain, ID 31337.

## Dependency evidence

Bootstrap run 39409749851 on commit 5d5271b9f2295254c014d34a4e8459c87800de23
compiled all sources and passed 11 tests. It generated the lockfile for review,
but is not a reproducibility acceptance run. Its compiler-version manifest field
was empty due to a shell quoting error; the strict workflow corrects that command
and fails the evidence step if it cannot read the compiler version.

Committed lockfile SHA-256:
`46241d4b848e0b500e445989fb1767656a752e5ff47b1fd231afc853fbc5d0e2`.

The reviewed lock contains 252 resolved dependency entries, each with an npm
registry HTTPS source and an integrity digest. This is an integrity/provenance
check, not a dependency vulnerability audit.

The final gate must independently show `LOCKED_NPM_CI`, compile success,
15 tests passing, a nonempty exact compiler version, and a downloadable artifact
bound to the tested commit. The workflow records hashes for the source manifest,
logs, test config, preparation script, unchanged tests and workflow.

## Architecture boundary

QuickNode can later provide the JSON-RPC transport between an authorized signer/
reader and the selected EVM network. It does not establish source-event truth,
replace claim review, or by itself implement the complete OctoPush-to-XP flow.
Public-network deployment remains a separate approval gate.
