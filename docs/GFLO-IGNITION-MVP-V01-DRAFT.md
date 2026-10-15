# GFLO Ignition MVP v0.1 — isolated prototype

Status: experimental implementation, user Termux run pending. NOT audited or deployed.

## Contracts
- `PIECoreIgnitionV01.sol`: new Core, wallet identity, 25 genesis XP, target Path, authorized next-tier-only `upgradeTier`. One-time `bindIgnition` by constructor-designated authority.
- `GFLOIgnitionV01.sol`: immutable Core/Registry/token binding, Tier 0→1 (1000 XP) and 1→2 (5000 XP) thresholds, explicit burnFrom, supply/balance verification, reentrancy guard.
- `test/GFLOTestBurnTokenV01.sol`: unrestricted-mint TEST token only; not a live GFLO ERC20.
- `scripts/gflo-ignition-v01-atomic.mjs`: nine local EVM smoke/integration scenarios.

## Canonical source and architecture
`XPPolicyV02.totalXP` sums PIE genesis and earned XP; `TrustedXPSourceRegistryV02.totalXP` is the designated public canonical read. Registry requires its selected policy's runtime codehash, PIE link and pinned policy owner to match. The Ignition constructor requires Registry.pieCore == new Core.

**Important deployment order**: Core(new binding authority) → XP Policy(new Core, intended governance Safe owner) → Registry(new Core, intended Safe governance) → real burnable GFLO token → Ignition(new Core, Registry, token, fees) → Core.bindIgnition(Ignition) once → Registry propose/activate/unpause. The `bindIgnition` caller is a separate centralization/bootstrap trust root that must be controlled, preferably by the same trusted governance, and cannot be reset.

## Atomicity
In `ignite()`, XP and Path are checked before calling GFLO `burnFrom(msg.sender, fee)`; observed balance/supply deltas must equal fee; then authorized Core `upgradeTier` executes. An EVM revert unwinds burn and Tier state changes together.

**This does not validate the burnable token implementation**: malicious token behavior or unchecked external state assumptions require adversarial tests. This pilot presumes a token exposing `burnFrom`, `balanceOf`, `totalSupply`. A conventional nonburnable ERC20 is NOT compatible.

## Open decisions and risk gates
1. **Fees 100/200 are illustrative raw token units only**, not approved GFLO tokenomics. With 18 decimals in the mock these raw units are a minuscule fraction of a token; future fees should be expressed as proper token base-unit amounts after governance approval.
2. New Core is a **fresh deployment**; v0.2 identity state is not migrated. No silent claim of backwards-compatible upgrade.
3. Thresholds 1000 and 5000 XP are provisional.
4. Registry owner pin means ownership transfers after activation cause reads to revert. Safe ownership should be established BEFORE source activation.
5. Before trusted testnet use: prove Tier 2 successful flow across UTC XP epochs; unauthorized bind attempts; repeated binding; failed burn rollback; malicious token callback/reentrancy; mismatched Registry; real gas and signed transaction tests.
6. A compromised XP verifier or XP Policy owner remains an XP trust issue even with canonical reads. Registry governance alone cannot prevent dishonest rewards. A vetted multisig owner and evidence assurance are separate work.
7. Need independently reviewed deployment manifests and correct Safe configuration, plus protocol pause/freeze strategy.
8. No passkey, main-branch merge, public deployment, or audit implied.

## Acceptance gate
First compile and run the nine Termux checks; do NOT report 120/120 before the developer provides actual output. After passing, broaden tests and challenge architecture before any release.
