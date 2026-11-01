# GFLO RED TEAM 5B — locked signed EVM reproduction

Status: **CI PASS for the declared local signed-transaction fixtures, NOT a protocol audit,
live OctoPush evidence attestation, production approval or public-network deployment**.

## Reproducible isolated environment

On a Node.js 22.23.3 environment, from `tests-redteam5b/`:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run prepare
node .generated/rt5b1.mjs
node .generated/rt5b2.mjs
```

Dependencies are pinned in the committed `package-lock.json` (generated in a
separate non-acceptance bootstrap, then committed). The final acceptance CI uses
`npm ci`, **not** an implicit installation or live semver resolution.

`prepare-ci.cjs` copies the exact repository scripts into an ignored
`.generated/` folder, altering *only* two hard-coded filesystem/source-loading
expressions in each copy. It fails if the expected source strings cannot be
matched uniquely and records SHA-256 hashes of originals and prepared copies in
`evidence/source-preparation.json`. Test assertions and all contract sources
remain unchanged by preparation. Test sources come from the **checked-out
repository tree**, never `origin/feature/pie-core-v0.2` or a developer's
`~/gflo-pie` checkout.

The official Safe v1.5.0 artifacts are consumed from the isolated dependency
tree; EthereumJS v10 signed `runTx` checks use disposable deterministic test
keys **only**. No external RPC or production key is accessed. Local Solidity
compiler: `solc-js 0.8.34`, Cancun, optimizer 200. This differs from the
independent Genesis/Path Hardhat fixture's solc-js 0.8.28; each tests its declared
configuration only.

## Verified GitHub Actions evidence

- [Push run 39488366475](https://github.com/elanmust-GFLOer/gflo-pie/actions/runs/39488366475):
  both 5B suites PASS (15/15 each), signed-receipt checks; complete evidence
  artifact 12295060598.
- [PR run 39488373460](https://github.com/elanmust-GFLOer/gflo-pie/actions/runs/39488373460):
  both suites PASS on the same reviewed tree.
- Original push artifact ZIP SHA-256:
  `76e95743b3d33c55c0ee7666d157a1bbde1cab2ebc48d0564ca56a7ca9fa4da9`
  (locally rehashed after download, agrees with GitHub artifact digest).
- CI proof context: `LOCKED_NPM_CI`, Node `v22.23.3`, npm `10.9.9`,
  solc `0.8.34+commit.80d5c536.Emscripten.clang`.
- Committed package-lock SHA-256:
  `ca62ba57e2e6d53f34617793b0215bd9d87eeb13016084e5d23c0f7fc4fdb7f3`.

## Boundaries and remaining security gates

1. Both suites intentionally repeat some baseline scenarios; 30 executed checks
   are **not 30 independent security properties**.
2. Authorized attestations still do not cryptographically prove that an actual
   OctoPush event happened; collusion and evidence-source governance are open.
3. The Praxis consumer is a test fixture. All economic/access consumers must be
   verified separately to use the fail-closed EffectiveTierGate.
4. RT5-15 policy pause regression is a separate four-test Hardhat suite inside
   `tests-v02/test/XPPolicyV03.pause-rt515.cjs`, covering policy-only pause,
   active control, resumption and independent registry pause.
5. Contract-account ERC-1271 rejection cases, signer collusion, off-chain
   evidence review, mutation testing, dependency vulnerability review, and
   independent EVM-client/security audit are outside this acceptance.
6. The PR should stay **draft and unmerged** pending independent review, checks
   on the exact final commit, and explicit merge authorization.
