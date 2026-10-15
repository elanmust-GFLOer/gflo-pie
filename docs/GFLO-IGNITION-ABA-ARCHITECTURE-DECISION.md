# GFLO Ignition MVP — A–B–A architecture decision (2026-10-15)

**Status:** user-selected configuration. Architecture decision and code preparation only. No Safe deployment, real GFLO issuance, confirmed token economics or public-chain transactions.

## A — token / fixed-supply ERC-20 + Burnable

Candidate implementation: `contracts/GFLOFixedSupplyV01.sol`, inheriting OpenZeppelin Contracts v5 `ERC20Burnable`. 18 default decimals. Constructor args `initialRecipient` and `initialSupplyBaseUnits`; exactly one `_mint` at deployment. No external mint after deployment.

- `totalSupply()`, `balanceOf()`, `approve()`, `allowance()`, `burnFrom()` from OpenZeppelin.
- Standard ERC20Burnable `burnFrom` consumes allowance and reduces account balance / total supply, emitting the usual ERC20 `Transfer(from, address(0), amount)` event.
- GFLO Ignition already expects these read/write methods, performs exact user balance/supply delta checks and Tier upgrade in the same transaction.
- IMPORTANT: `100`, `200` in existing smoke scripts are RAW BASE UNITS, **not** 100/200 GFLO. For a 18-decimal token, 1 token = `10**18` units.
- **Unresolved:** actual initial supply in full GFLO, recipient allocation/custody, network/chain ID, tokens burned at each Tier, signer wallet destinations. Explicit governance/economic decision required. No numbers are imposed by this draft.
- By choosing this implementation we rule out further minting. If controlled further emission is later wanted, that needs a new token architecture decision before deployment. `GFLOFixedSupplyV01` is a candidate deployment contract, **not yet deployed**.

## B — one common vetted Safe 2-of-3

**Use a real supported Safe account**; no bespoke production multisig and no fake Safe signer claims. Three genuinely independently secured owners, threshold 2, no additional module unless separately reviewed. Confirm codehash / official supported chain address / implementation. A Safe can call the existing `onlyOwner`, `onlyGovernance`, and `bindingAuthority` functions through its regular signed execution.

Target identities:
- `PIECoreIgnitionV01.bindingAuthority = Safe` at Core deployment; `bindIgnition` later initiated by Safe and allowed once.
- `XPPolicyV02.owner = Safe` (at deployment where possible); Safe manages `setVerifierRole`, `registerRule`, `setRuleActive`, `setPaused`.
- `TrustedXPSourceRegistryV02.governance = Safe` (at deployment); Safe calls `proposePolicy(policy, runtimeCodehash, Safe)`, `activatePolicy`, `setPaused(false)`.
- Registry's stored `policyOwner` must equal Safe and the policy's current owner. Do NOT activate while policy owner is still the bootstrap EOA.
- Because the current registry permits only ONE XP source activation, source version/migration must be addressed for later contract upgrades. Safe alone does not enable source replacement or verifier evidence truth.
- Core's immutable binding authority and one-time Ignition bind create irreversible bootstrap and availability risks. Verify each address and network.
- Threats to examine before valuable use: 2/3 collusion/loss, signer recovery, module/guard bypass, code provenance, verifier compromise and forged XP, registry pause liveness.

**Note:** no `Safe.sol` copy or custom passkey contract is added to GFLO. Use vetted Safe infrastructure and pinned chain deployment; only integration tests should rely on a full Safe deployment.

## A — clean Genesis

Deploy fresh `PIECoreIgnitionV01`; 25 Genesis XP exactly once for a wallet *on that Core*, eligible selected paths with Tier 0 start. `XPPolicyV02` and `TrustedXPSourceRegistryV02` are linked to this same Core. Historical v0.2 identity state is NOT imported. This is an MVP reset choice, not a statement that a real preexisting community can be silently reset.

## Minimal deployment ordering (not performed)

1. Choose supported EVM network and verify official Safe contract deployments; establish owner separation and 2-of-3 threshold.
2. Deploy GFLO fixed-supply token using **approved** `initialSupplyBaseUnits` and `initialRecipient`.
3. Deploy Core with Safe bindingAuthority.
4. Deploy XP Policy with the Core + Safe as owner.
5. Deploy Registry with the Core + Safe as governance (initially paused).
6. Deploy Ignition with Core/Registry/GFLO and **approved** Tier 1 and Tier 2 burn amounts in base units.
7. Via Safe transaction: Core.bindIgnition(Ignition); independently inspect actual on-chain state.
8. Verify XP Policy runtime codehash and Safe owner, via Safe proposePolicy and activatePolicy.
9. Via Safe: unpause Registry only after manifest review and readiness; register reward rules and verifiers by Safe as needed.
10. Verify every address, codehash, chainId, total supply, ownership, first Genesis and stop on mismatch.

## Release gating

- **138/138** was user-reported across overlapping local test scenarios as of the architecture choice, not 138 independent protections and not an audit.
- New token requires dependency-pinned compilation and functional tests: mint-once/no mint entrypoint, allowance burn, Transfer event, failed allowance/no balance rollback, sufficient decimals and nonzero initial allocation.
- Safe governance deployment must be tested with the real Safe implementation, multisignature approvals and actual direct calls (not a `msg.sender` placeholder).
- Do not silently merge to main or deploy on a public chain; no user-supplied private keys in scripts.
