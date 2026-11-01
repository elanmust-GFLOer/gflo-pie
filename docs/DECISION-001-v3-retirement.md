# DECISION-001: PIECore v3 stack retirement

**Date:** 2026-10-15
**Status:** Accepted

## Decision
The Sepolia v3 stack is retired as legacy. It stays on-chain but receives
no new integrations. The canonical identity and XP line is now:
- `contracts/PIECoreV02.sol` (Genesis identity, Path state machine)
- `contracts/XPPolicyV02.sol` (rule-bound XP, verifier roles, replay protection)
from branch `feature/pie-core-v0.2`, commit `efe4d7d` onward.

## Retired (Sepolia, legacy, do not integrate)
| Contract | Address |
| --- | --- |
| PIECore v3 | 0x9CF55d0b9D61Dc28EF3cb10765CF4b861Cd0991e |
| GFLOIgnition v2 | 0x414DEDcf9264614Fd087BDa58bE27a0B698CcC54 |
| GasFeeLoop | 0xd2C926F67080D6315b5dbBc7D621d729Cfe8A9C7 |

## Kept
| Contract | Address | Reason |
| --- | --- | --- |
| GFLOToken | 0x563b2e3b499818a2f84c472efb3169a2667807fe | Plain ERC-20; future atomic Ignition burns this token |

## Reasons
1. The deployed PIECore v3 source cannot be located; bytecode does not match any repo file, so it cannot be verified or audited.
2. `gainXP()` has no authorization check: any wallet can mint unlimited XP.
3. GFLOIgnition calls `upgradeTier(address)`, which does not match documented behaviour.
4. `GasFeeLoop.stake()` grants no XP without a manual trigger.

## Consequences
- Backend `/api/identity` keeps reading v3 until PIECoreV02 is deployed to Sepolia, then switches.
- The faucet is paused; v0.2 Genesis requires no token. It returns with atomic Ignition.
- OctoPush identity checks will read `PIECoreV02.getIdentity()` after the Sepolia deploy.
- Pitch decks before 2026-10-15 describe the v3 stack and are historical.

## Amendment — 2026-11-01
1. **Reason 1 superseded.** The v3 source was located (`contracts/PIECore.sol`, exact metadata match) and all four Sepolia contracts are now verified on Etherscan. Retirement stands on reasons 2–4.
2. **GFLOToken moves to Retired.** Its verified source is `MockGFLOToken`: unrestricted `faucet()` mints 10,000 GFLO per call and it has no `burn`/`burnFrom`. It is incompatible with `GFLOIgnitionV01` (requires `burnFrom` and an exact supply delta). The v0.2 stack uses a fresh `GFLOFixedSupplyV01` deployment.
3. **Canonical tested line:** `PIECoreIgnitionV01` + `XPPolicyV03` + `TrustedXPSourceRegistryV02` + `GFLOIgnitionV01` + `GFLOFixedSupplyV01` + `EffectiveTierGateV01` (exercised end-to-end by the activity pilot, PR #20). `PIECoreV02`/`XPPolicyV02` remain the Genesis/Path phase reference. `contracts/experimental/` (V04, V05) is not canonical.
4. **Consequence:** any XP or tier read from 0x9CF55d0b… is self-mintable and must be labelled legacy, never shown as reputation.
