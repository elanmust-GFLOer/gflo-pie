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


## Executed remediation evidence — 2026-10-21

The originally documented *planning-only* gate has progressed to an **npm-generated, CI-reproduced partial transitive remediation**, not total dependency security closure.

- Scoped `tests-v02/package.json` npm overrides: `tmp: 0.2.7` and `ethers.ws: 8.21.1`. Original Hardhat 2.26.3, solc 0.8.28, ethers 6.15.0 remain pinned.
- A one-time, branch-restricted GitHub Actions bootstrap ran `npm install --package-lock-only --ignore-scripts --no-audit --no-fund` against the npm registry, then `npm ci --ignore-scripts --no-audit --no-fund`, `npm ls tmp ws --all`, `npm run compile`, and `npm test -- --no-compile`. The GitHub runner committed the npm-resolved lockfile (commit `8ea6bcc8f86a092a05ebb46dee70d3da3e1d30fb`); it was NOT manually edited. Run: https://github.com/elanmust-GFLOer/gflo-pie/actions/runs/39601987108 — SUCCESS, 15/15 Genesis/Path including RT5-15.
- New package/lock SHA-256 reported in runner logs: package.json `afac9cc9d984011745da2495a6e3c3c09ce477c4d782fbd436af697ddb998df0`; package-lock.json `f4fb79452c9cc135fa9e891dd54ab5766f2f12c9e54a364b10bbe4d665887c00`.
- Resolved top-level `tmp@0.2.7` and `ws@8.21.1` have npm registry `resolved` and `integrity` metadata. Prior `tmp@0.0.33` and `ws@8.17.1` no longer appear as installed copies; Hardhat's separate `ws@7.5.13` remains and requires independent reachability/advisory consideration.
- Second evidence run https://github.com/elanmust-GFLOer/gflo-pie/actions/runs/39602320895 recorded `npm audit --json` after clean dependency install and tests. Its raw exit code was **1**; the reporting-only step intentionally recorded the findings rather than asserting zero vulnerabilities.
- **Audit summary: 20 remaining findings — 10 High, 1 Moderate, 9 Low, 0 Critical**. High-level chains include Hardhat 2.x and its transitive `undici`, `adm-zip`, `@fastify/busboy`, `serialize-javascript`, `mocha/chokidar/braces`; other reports include `uuid`, `cookie`, `elliptic`. The audit suggests some remedies require major migrations (Hardhat 3 and compatible plugins), not a blind transitive override. The findings have not been risk-triaged for isolated CI exploitability.
- A third reporting-only run https://github.com/elanmust-GFLOer/gflo-pie/actions/runs/39602320895 succeeded after the reporting step was corrected. The earlier audit-only reporting step run https://github.com/elanmust-GFLOer/gflo-pie/actions/runs/39602207114 failed because GitHub's bash `-e` exited on `npm audit` code 1 before JSON output; that failure is retained as an audit trail, not misrepresented as a compile or EVM regression.
- The **temporary `contents: write` bootstrap workflow was deleted** from the PR branch after generating the lockfile. The final PR tree must be checked to confirm no write-enabled workflow remains.
- PR #14 was retargeted to `feature/pie-core-v0.2` after merged PR #13. Its final base/head/tree and exact integration CI require subsequent verification.

**Scope disposition:** targeted `tmp/ws` upgrade verified; full Hardhat dependency remediation **OPEN**, not `PASS` or production-ready. No merge authorization.
