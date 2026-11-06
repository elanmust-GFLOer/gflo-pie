# Deployment manifests

One file per chain, named by CAIP-2: `eip155-<chainId>.json`. Each file is the
record of truth for that chain's addresses. Do not hand-edit it. The deploy
script writes it.

| File | Chain | Status |
| --- | --- | --- |
| `eip155-11155111.json` | Ethereum Sepolia (pilot home chain, DECISION-002) | not yet deployed |

## What a manifest contains
- `chain`, `chainId`, `gitCommit`, compiler (`solc`, optimizer, `evmVersion`)
- `deployer`, `governance` (must be a Safe, never the deployer)
- per contract: address, constructor args, tx hash, block, `runtimeCodehash`
  **measured on that chain**, `sourceSha256`, Etherscan verification result
- `governanceCalls`: the ordered, unsigned calls the Safe must execute
  (`bindIgnition`, `proposePolicy`, `activatePolicy`, `setPaused(false)`)

Runtime codehashes differ per chain and per deployment because constructor
immutables are compiled into runtime code. `proposePolicy` must use the hash
from this manifest, not one from another chain.

## How to deploy
From `tests-v02/` (locked dependencies, solc 0.8.28, Cancun):

```sh
npm ci --ignore-scripts
npm run deploy:dry-run        # local Hardhat only, no keys, writes tests-v02/evidence/deploy-dry-run/

cp ../deployments/config/eip155-11155111.example.json ../deployments/config/eip155-11155111.json
# fill in governance (Safe), tokenRecipient, supply and burns per the Pilot Trust Policy
GFLO_DEPLOY_CONFIG=../deployments/config/eip155-11155111.json \
RPC_URL=... DEPLOYER_KEY=... ETHERSCAN_API_KEY=... npm run deploy
```

The script fails if:
- the RPC chain does not match the config,
- governance is an EOA or equal to the deployer,
- or any contract does not verify on Etherscan.

The target chain must support Cancun (OpenZeppelin 5.x uses `MCOPY`).

After it succeeds, the Safe executes `governanceCalls` in order. Rules,
verifier roles and attestors are then set as the Pilot Trust Policy says.
