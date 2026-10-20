# GFLO Sepolia Legacy PIE read-only audit

Result: **PASS**
Commit: a540fe3e51c033dba83ba6fa0da2daec2572f049
Chain ID: 11155111
Block: 0xb66fa4
Block hash: 0x5ec2a5e6f2369792717cb99cc1ae77e5079178556c686dea90fefcedd3bc6116
Endpoint: https://ethereum-sepolia-rpc.publicnode.com

PASS means consistent readable legacy state, NOT a security audit.

| Contract | Account | XP | Path | Tier | Status |
|---|---|---:|---:|---:|---|
| PRIMARY_LEGACY | USER | 0 | 0 | 0 | PASS |
| PRIMARY_LEGACY | DEPLOYER | 0 | 0 | 0 | PASS |
| EARLIER_LEGACY | USER | 0 | 0 | 0 | PASS |
| EARLIER_LEGACY | DEPLOYER | 15000 | 1 | 0 | PASS |

## PRIMARY_LEGACY event corroboration: PASS
USER: PASS; events={"PathChosen":0,"XPGained":0,"TierUpgraded":0,"CommitmentBurned":0}; derived={"xp":"0","path":0,"tier":0}
DEPLOYER: PASS; events={"PathChosen":0,"XPGained":0,"TierUpgraded":0,"CommitmentBurned":0}; derived={"xp":"0","path":0,"tier":0}

## EARLIER_LEGACY event corroboration: PASS
USER: PASS; events={"PathChosen":0,"XPGained":0,"TierUpgraded":0,"CommitmentBurned":0}; derived={"xp":"0","path":0,"tier":0}
DEPLOYER: PASS; events={"PathChosen":1,"XPGained":1,"TierUpgraded":0,"CommitmentBurned":0}; derived={"xp":"15000","path":1,"tier":0}

## Uncertainties
- Event coverage trusts the RPC provider; receipt checks are not a cryptographic proof against omitted whole transactions.
- PASS is identity-state corroboration, not contract security or migration authorization.

All raw responses, ABI call selectors, read errors, event logs, bytecode fingerprints and anchor confirmation are in audit.json.
