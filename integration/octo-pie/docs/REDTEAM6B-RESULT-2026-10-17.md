# RED TEAM 6B — signed local EVM isolation result

Date: 2026-10-17
Source of result: project owner's pasted Android Termux output (not an independently rerun test).
Repository: `elanmust-GFLOer/GFLO.Octo_PIE-cookR`
Runner: `scripts/rt6b-legacy-xp-isolation.mjs`
Runner revision tested: `d4b8b39` (as shown by local `git pull --ff-only`).

## Observed execution

The project owner executed:
```sh
cd ~/GFLO.Octo_PIE-cookR && git pull --ff-only &&
cp scripts/rt6b-legacy-xp-isolation.mjs ~/gflo-v02-evm/rt6b.mjs &&
cd ~/gflo-v02-evm && node --check rt6b.mjs && node rt6b.mjs
```

Termux reported:

```text
PASS 1/4 PIE fresh identity starts with canonical 25 XP
PASS 2/4 legacy GFLO stake executes successfully
PASS 3/4 legacy owner reward reverts against PIE without addXP and all state rolls back
PASS 4/4 unauthorized outsider cannot grant XP through legacy GasFeeLoop
RED TEAM 6B: 4/4 signed local EVM checks. Legacy integration rejected; no external deployment.
```

## Supported conclusions

1. A fresh PIECore identity starts at 25 Genesis XP in the examined local fixture.
2. The synthetic ERC-20 and legacy GasFeeLoop stake transaction succeeds.
3. Legacy owner's XP-rewarding call to the fresh PIECore (which lacks `addXP`) reverts. The test checks unchanged Genesis XP, staking balance, accumulated XP, epochXP accounting, user token balance, and pool token balance; reverted transaction emits no logs.
4. A separately signed unauthorized outsider `rewardXP` call reverts. XP and examined accounting remain unchanged.

## Not established

- This does **not** prove a complete XPPolicyV03 attestation chain in RT6B; the pilot's past RED TEAM 5A/5B results are separate.
- No live network, external chain, contract verification, economic utility, reviewer lottery, Sybil resistance, or audit has been verified.
- No evidence of the real-world authenticity of any claimed OctoPush/DailyScope activity.
- Local fixture uses a purpose-built ERC-20 test token and synthetic keys.
- Exact SHA of user's separate legacy source checkout and PIE worktree were not captured; reproducible release report should pin them.
- A negative incompatibility test is **not** an endorsement of deploying legacy GasFeeLoop.

## Gate status

RT6A: 6/6 static checks (previously reported)
RT6B: 4/4 signed local EVM isolation checks (reported in the user-run output)

**Next planned: RT6C**, positive and negative end-to-end XPPolicyV03 attestations, unauthorized actor checks, pending/final/revoked accounting and fail-closed EffectiveTier consumer. Prepare bounded work on the existing local EthereumJS fixture. Do not conflate reused test scenarios with independent security guarantees.
