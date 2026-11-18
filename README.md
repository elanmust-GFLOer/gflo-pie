# GFLO PIE — Proof of Verified Activity

**Activity → XP → Identity → Sovereignty.** The anti-plutocratic identity and XP core of GFLO Sovereign.

> Status: development line. Nothing here is audited. No v0.2 contract is deployed to a public network yet.

## Canonical tested line (v0.2)

| Contract | Role |
| --- | --- |
| `PIECoreIgnitionV01` | Identity, selected path, historical tier; only the bound Ignition changes tier |
| `XPAttestationResolverV01` | **XP source for new deployments.** EAS schema resolver with the XPPolicyV03 rules: attested, revocable XP, PENDING → VALID / REVOKED, caps, replay protection. See `docs/DECISION-002-eas-resolver-and-canonical-repo.md` |
| `XPPolicyV03` | Previous attested-XP policy (own EIP-712 proofs); kept for reference, superseded by the EAS resolver |
| `TrustedXPSourceRegistryV02` | Single approved XP source; fails closed |
| `GFLOIgnitionV01` | Exact GFLO burn, then tier upgrade |
| `GFLOFixedSupplyV01` | Fixed-supply token with `burnFrom`, no mint |
| `EffectiveTierGateV01` | Current privilege = min(historical tier, XP tier cap) |

`PIECoreV02` / `XPPolicyV02`: Genesis/Path phase reference. `contracts/experimental/` (V04, V05): research, not canonical.

## Legacy Sepolia v3 — deprecated, do not integrate

Verified on Etherscan and kept for history. See `docs/DECISION-001-v3-retirement.md`.

| Contract | Address | Why retired |
| --- | --- | --- |
| PIECore v3 | `0x9CF55d0b9D61Dc28EF3cb10765CF4b861Cd0991e` | Public `gainXP()`: anyone can mint unlimited XP |
| GFLOIgnition | `0x414DEDcf9264614Fd087BDa58bE27a0B698CcC54` | Calls functions PIECore v3 does not have; always reverts |
| GasFeeLoop | `0xd2C926F67080D6315b5dbBc7D621d729Cfe8A9C7` | Stake-multiplied XP; rejected as plutocratic |
| GFLOToken (MockGFLOToken) | `0x563b2e3b499818a2f84c472efb3169a2667807fe` | Open `faucet()` mint, no `burn`/`burnFrom` |

XP read from `0x9CF55d0b…` is self-mintable. Never present it as reputation.

## Running the tests

CI runs every suite on each pull request. Locally with Node 22:

```sh
cd tests-redteam5b
npm ci --ignore-scripts --no-audit --no-fund
npm test               # signed EVM red-team suites (EthereumJS, runs in Termux)
npm run test:activity  # activity → XP → access → revoke pilot
```

`tests-v02` (Hardhat) runs in CI; Hardhat 2 does not run on Android/Termux.

## Trust limits

A valid signature proves an attestor's assertion, not that real-world work happened. Issuer/attestor/governance collusion remains an open, documented risk. The `tests-v02` dependency audit gate (Hardhat 2 dev dependencies) is open by design.

## Repository map

This is the **single canonical repository** of GFLO.

- `contracts/`, `tests-v02/`, `tests-redteam5b/`: protocol and tests
- `docs/`: decisions, audits and evidence
- `integration/octo-pie/`: OctoPush × OctoPartnR integration design and RED TEAM 6 archive (imported from `GFLO.Octo_PIE-cookR`)
- [`gflo-backend`](https://github.com/elanmust-GFLOer/gflo-backend): live HTTP API (separate until its Railway source is moved)
- Archived: `GasFeeLoop-` (legacy v3), `gflo-clean` (early prototype), `GFLO.Octo_PIE-cookR`
