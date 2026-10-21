# GFLO PIE v0.2 — isolated Hardhat dependency remediation gate

Status: **OPEN / design-and-reproduction only**. This document does NOT claim a repaired lockfile or a successful dependency audit.

## Pinned baseline
- Parent development commit: `b2c6930697b367be22437d76740e9768496711f3`
- `tests-v02/package.json`: Hardhat 2.26.3, solc-js 0.8.28, ethers 6.15.0, pinned exact direct dependencies.
- `tests-v02/package-lock.json`: `tmp@0.0.33` (required by root solc and Hardhat-internal solc), `ws@8.17.1` (required by ethers 6.15.0), and a *separate* `hardhat/node_modules/ws@7.5.13`. The latter must NOT be silently conflated with the root ws 8.x.
- Baseline Genesis/Path: 15/15 PASS under the pinned lock at PR #13, but PASS is not vulnerability remediation.

## Desired mitigation — requires review and real npm-generated lockfile
1. In a throwaway, reproducible Node 22.23.3/npm 10.9.9 workspace, start from exact baseline. Record `npm ls tmp ws solc hardhat ethers --all`, `npm audit --json`, and current lockfile SHA-256. No external private credentials.
2. Evaluate scoped `overrides` for `tmp` at a currently patched 0.2.x version (minimum 0.2.7 for the relevant reported advisory, verify against advisories) and root `ws` 8.x at the reviewed patched release. Resolve Hardhat's nested ws 7.x independently instead of imposing a major-breaking root override on all ws consumers.
3. Let npm calculate the lock: `npm install --package-lock-only --ignore-scripts --no-audit --no-fund`. NEVER directly rewrite package-lock integrity hashes or resolved URLs. Pin all package and integrity metadata through npm's real registry resolution.
4. Verify: `npm ci --ignore-scripts --no-audit --no-fund`; `npm ls --all tmp ws`; check that `tmp@0.0.33` and `ws@8.17.1` are absent, or document justified exceptions for transitive copies. Then `npm run compile` and `npm test -- --no-compile`, with `git diff --exit-code -- package.json package-lock.json` after installation.
5. Run the RED TEAM signed EVM suite separately if shared contracts/workflow changes arise; compare compiler artifacts, ABI/runtime bytecode and Genesis/Path outcomes. No assertion weakening.
6. Run a fresh advisory scan, triage reachability, including the separate ws 7.x copy. Treat audit findings as evidence, not blanket production exploitation claims.
7. Record lock SHA256, package versions, vulnerability IDs, node/npm/compiler versions, exact PR checkout SHA/tree, artifact hashes and independent Codex review before any merge.

## Scope boundaries
- No production Solidity, `main`, deployment, on-chain config, keys, signatures, or Safe action.
- This work package remains DRAFT until an actual registry-generated committed lockfile and green exact-tree CI evidence exist.
- If CI cannot access npm registry, report the blocker. Do not manufacture a lockfile or falsely mark the dependency gate CLOSED.
