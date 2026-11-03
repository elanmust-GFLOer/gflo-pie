# archive/legacy-v3 — Sepolia v3 era files (kept, not deleted)

Moved here on 2026-11-03 from the repository root with `git mv`. Nothing was deleted;
full history stays available through `git log --follow <file>`.

These files belong to the **retired** Sepolia v3 stack (see `docs/DECISION-001-v3-retirement.md`).
Do not build on them. They are kept as history and as negative-control material.

| File | What it is |
| --- | --- |
| `PIECore.sol`, `GpieV0.1` | Early PIECore drafts (differ from the verified `contracts/PIECore.sol`) |
| `contracts_PIECore_sol_*.abi/.bin` | solcjs output used by `deploy_piecore.js` |
| `compiled/`, `compiled2/`, `compiled3/` | solcjs build variants; `compiled2`/`compiled3` ABIs are read by `tests-v02/audit/sepolia-legacy-pie-readonly.cjs` |
| `deploy_piecore.js` | Mnemonic-prompt deployer for the v3 PIECore (run from this folder) |
| `check_gflo_direct.js` | Read-only GFLOToken query |
| `safe_send_gflo.js` | Mnemonic-prompt token sender |
| `gflo-wallet.js`, `gflo_wallet.js` | Two diverging wallet helper drafts |

The canonical code lives in `contracts/` (v0.2 line) and is described in the root `README.md`.
