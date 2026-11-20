# GFLO ⇄ OctoPush bridge worker

Turns accepted OctoPush Rooms reviews into EAS attestations for the Reformer rule
(`docs/DESIGN-005-octopush-bridge.md` §6). Tested in `tests-v02/test/BridgeWorker.cjs` against the
real contracts and a mock of the OctoPush L3 API.

Per tick:
1. lease signed events from OctoPush;
2. verify the issuer signature;
3. check the author's PIE identity and the reviewer's effective tier (≥ 1);
4. simulate, then attest; resolver rule violations become named rejections;
5. report the result;
6. revoke attestations whose OctoPush source was deleted.

Transient errors are never reported: the lease expires and the event is retried. A lost report is
recovered by finding the bridge's own earlier attestation, so an event is never attested twice.

## Run (Railway worker, Phase C)

| Env | Meaning |
|---|---|
| `GFLO_RPC_URL` | Base Sepolia RPC |
| `BRIDGE_ATTESTER_KEY` | **new** testnet key; level-1 attester for the Reformer rule; holds a little test ETH |
| `GFLO_EAS`, `GFLO_XP_RESOLVER`, `GFLO_PIE_CORE`, `GFLO_EFFECTIVE_TIER_GATE` | deployed addresses (no defaults; retired v3 refused) |
| `GFLO_DEPLOY_BLOCK` | deployment block (full-history rescan for recovery) |
| `OCTOPUSH_BRIDGE_URL` | `https://<octopush-domain>/api/public/gflo` |
| `GFLO_BRIDGE_TOKEN` | same value as the OctoPush secret |
| `OCTOPUSH_ISSUER_ADDRESS` | `0x2A7B244810F64961301794C256D6aFD77A7bCfda` (pilot) |
| `BRIDGE_LIVE` | `1` to send transactions; anything else = dry run |
| `BRIDGE_INTERVAL_SECONDS`, `BRIDGE_ONCE` | loop interval (default 60), single tick |

```sh
cd bridge && npm install && npm start
```
