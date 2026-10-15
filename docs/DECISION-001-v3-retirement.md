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
