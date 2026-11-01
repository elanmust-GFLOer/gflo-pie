# GFLO Safe 2-of-3 — integration readiness gate

Date: 2026-10-15
Branch: feature/pie-core-v0.2
Status: official Safe dependency/version identified; local Termux installation and actual contract execution PENDING.
Previous checkpoint: 145/145 reported local scenario PASS (overlapping suites).

## Official dependency chosen for investigation

- `@safe-global/safe-smart-account@1.5.0`, official tag `v1.5.0`:
  https://github.com/safe-fndn/safe-smart-account/tree/v1.5.0
- The official source project's `package.json` identifies Solidity `solc =0.7.6` for its own builds.
- GFLO local scripts use `solc 0.8.34`. Do not concatenate or compile Safe Solidity 0.7.6 source with GFLO Solidity 0.8.x in one compilation. Prefer official published build artifacts compiled for the relevant Safe version, or a completely separate reproducible build.
- No deployment or npm installation is claimed from this document.

## A–B–A target wiring

`Safe (2 of 3 independent owners)` is set as:
- `PIECoreIgnitionV01.bindingAuthority` at Core construction (immutable);
- `XPPolicyV02.owner` at Policy construction;
- `TrustedXPSourceRegistryV02.governance` at Registry construction.

Then after deploying `GFLOFixedSupplyV01`, `GFLOIgnitionV01` and XP policy, Safe must execute:

1. `PIECoreIgnitionV01.bindIgnition(ignition)` once.
2. `TrustedXPSourceRegistryV02.proposePolicy(policy, runtimeCodehash, safe)`.
3. `TrustedXPSourceRegistryV02.activatePolicy()`.
4. `TrustedXPSourceRegistryV02.setPaused(false)`.
5. `XPPolicyV02.setVerifierRole(verifier, role)`, `registerRule` and other controlled operations.

Never activate XP Registry when Policy owner differs from pinned Safe address.

## Real Safe acceptance scenarios

1. A real Safe smart account is deployed/initialized with 3 distinct test-only owners and threshold 2 (not custom multisig mock).
2. One signature insufficient to execute `XPPolicyV02.setVerifierRole`.
3. Two valid ECDSA Safe transaction signatures ordered by owner address authorize it.
4. A signer outside Safe's owner list cannot satisfy threshold.
5. Replay of completed Safe transaction fails due to nonce.
6. Two-signature Safe transaction configures Core Ignition binding and Registry policy activation.
7. Successful GFLO token burn plus canonical XP threshold causes an atomic Tier transition.
8. Failed operations leave no unexpected on-chain state mutation.
9. Log transaction receipts, gas, deployed contract addresses, chainId and bytecode identity.

## Release constraints

- Use official Safe bytecode/artifacts, independently verify version and deployed runtime behavior. Bundled package may include compiled artifacts: first inspect rather than assume artifact paths.
- Safe v1.5 may require a Safe proxy/factory, an approved chain deployment, or isolated constructor/setup logic depending on artifact and singleton implementation.
- No user mainnet private keys or funds.
- 2-of-3 signer control is NOT evidence authenticity or uniqueness of human signers.
- Token supply, distribution, Tier burn fees, target network and identity migration remain separate decisions.
- npm audit findings of the shared Termux root environment do not imply all newly isolated package dependencies are compromised; audit independently.

## First Termux action

```bash
cd ~/gflo-v02-evm || exit 1
npm view @safe-global/safe-smart-account@1.5.0 version
```

If npm metadata lookup works, pin the package in the isolated local environment only after reporting the response. Installation or compilation tests are not yet reported.
