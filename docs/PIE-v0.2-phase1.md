# PIE Core v0.2 — Genesis Identity & Path State Machine (Phase 1)

**Status:** development branch; not deployed or audited.

## Accepted semantics
- At Genesis the user chooses a target Path: Sovereign, Reformer, Praxis.
- Everyone starts in the earned **Sovereign / Tier 0** state.
- Initial XP is **25**, issued exactly once per wallet.
- Selected goal is not an earned capability.
- Earned progression: Sovereign (0) -> Reformer (1) -> Praxis (2).
- No skipping, downgrading or Tier above Praxis.
- The selected goal may change, but cannot be set below the already earned Tier.
- Changing the selected goal does not alter XP or the earned Tier.

## Contract boundary (Phase 1)
`contracts/PIECoreV02.sol` provides: `createIdentity`, `setSelectedPath`,
`getIdentity`, `getCurrentPath`, `nextTier`, `isValidTransition`.

**Important:** There is intentionally **no public upgrade method** and no external XP awarder
in Phase 1. Later phases must implement XP evidence/replay protection and a single
atomic GFLO ignition + tier transition transaction, with authorization and tests.
Until then users cannot actually ascend above Tier 0 using this v0.2 contract.

## Acceptance test cases (to implement in the toolchain-compatible suite)
1. Nonexistent wallet returns `exists=false`, `getCurrentPath=None`.
2. Genesis with selected Praxis starts at Tier 0, current Sovereign, 25 XP.
3. Genesis with None reverts.
4. Duplicate Genesis from the same wallet reverts, even with a different goal.
5. Distinct wallets can create independent Genesis identities.
6. Goal can be changed from Sovereign to Reformer or Praxis; Tier and XP unchanged.
7. Changing a goal before identity creation reverts.
8. `isValidTransition(0,1)` and `(1,2)` true; all skip, downgrade, equal and beyond-Praxis transitions false.
9. `nextTier(0)==1`, `nextTier(1)==2`; `nextTier(2)` reverts.
10. No public or privileged tier-mutating entrypoint exists in this phase.

## Security notes
- One identity per address is **not** one identity per human; Sybil resistance is not supplied.
- Wallet migration and recovery are not supplied.
- This is separate from the legacy `PIECore.sol`; legacy ABI and on-chain state are **not** migrated.
- Existing Hardhat dependencies/config require separate alignment before claiming green automated tests.
- GFLO token addresses, allowances, decimals, burns and economic costs remain out of scope.
