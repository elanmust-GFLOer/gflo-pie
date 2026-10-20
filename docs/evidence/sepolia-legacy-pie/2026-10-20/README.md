# GFLO Sovereign — Sepolia Legacy PIE Proof Archive

**Audit scope:** legacy PIE identity state at a fixed Ethereum Sepolia finalized block.  
**Status:** PASS **within identity-state + event-history corroboration scope**, not a smart-contract security audit.  
**Archived:** 2026-10-20 (UTC dates from GitHub Actions).  
**Network:** Ethereum Sepolia, chain ID `11155111` (`0xaa36a7`).

## Reproducible evidence

- Audit implementation commit: [`a540fe3e51c033dba83ba6fa0da2daec2572f049`](https://github.com/elanmust-GFLOer/gflo-pie/commit/a540fe3e51c033dba83ba6fa0da2daec2572f049)
- Original GitHub Actions [run 39449041651](https://github.com/elanmust-GFLOer/gflo-pie/actions/runs/39449041651) — completed successfully.
- Original artifact [12278335026](https://github.com/elanmust-GFLOer/gflo-pie/actions/runs/39449041651/artifacts/12278335026), expiry shown by GitHub: 2027-01-18.
- Original artifact ZIP SHA-256 (recorded by GitHub): `2bdc03e0e1948819ab6aba647b8524a3e00d1f07fbf27a0d8127792332c5eb48`.
- Finalized block: **11956132** (`0xb66fa4`).
- Block hash: `0x5ec2a5e6f2369792717cb99cc1ae77e5079178556c686dea90fefcedd3bc6116`.
- Full, byte-preserved audit evidence recovered from that successful run's timestamp-prefixed logs, stripped of log-display timestamp prefixes and **matched against the original per-file SHA-256 manifest**: [audit.json](./audit.json), [audit.md](./audit.md), [sha256.txt](./sha256.txt).
- The archive contains the **extracted original file contents**, not the original GitHub artifact ZIP. The ZIP digest above must not be used as the hash of the extracted files. The original ZIP remains accessible via the Actions artifact link until retention expiry (subject to GitHub availability).

| Archived member | SHA-256 (original GitHub audit manifest) |
|---|---|
| `audit.json` | `366df87c7ebb7c09c6ff110e32b84a2cb4ac339146c094d50b731ea7ad592b3b` |
| `audit.md` | `a9ca847dc72bf188d296cd3cdc95399dd4768595772bb8b0c7174575cc73c592` |


### Supplementary prior PASS — workflow failed only at artifact re-download

The preceding [run 39448376238 / job 118716257151](https://github.com/elanmust-GFLOer/gflo-pie/actions/runs/39448376238/job/118716257151) completed the on-chain audit with `GFLO_LEGACY_AUDIT=PASS`, all identity state comparisons PASS, and successfully uploaded artifact **12276524286**. The workflow itself concluded **failure**, because its immediate artifact re-download received GitHub `HTTP 503`. This was not an on-chain test failure. Unlike the final run, the prior run did not complete its *own in-job* artifact re-download verification.

The prior artifact ZIP was subsequently downloaded independently and checked against the GitHub-recorded digest; its member hashes matched the embedded manifest. We preserve its extracted evidence separately:

- [Prior audit.json](./prior-run-39448376238/audit.json)
- [Prior audit.md](./prior-run-39448376238/audit.md)
- [Prior sha256.txt](./prior-run-39448376238/sha256.txt)
- [Prior original artifact](https://github.com/elanmust-GFLOer/gflo-pie/actions/runs/39448376238/artifacts/12276524286) (retention expires 2027-01-18, subject to GitHub availability)
- Prior audit commit: `b6d9c423e996030a94150033fdfd6867bc511e6e`
- Prior finalized block: **11956100** (`0xb66f84`); hash: `0xa7b048367ddbc56ed506d2d19cf798bb897b0126d978ea2e4a666994c5b1947e`
- Original prior ZIP SHA-256: `7a8a65d6b3a459574afd2ed9299833aed562b078b0de34c64735d13d98dc3e34`
- Prior `audit.json` SHA-256: `a3b482951c26a2612ca2a104a9b61153b7bc520d69f0d215bbad35d0d09cc148`
- Prior `audit.md` SHA-256: `ab533c2a7dd44795814c57809630cb8d8d98239f2139871f806f4c3e250e0f96`

The prior and final audit states agree for all four contract/account pairs, including EARLIER / DEPLOYER **15000 XP, Sovereign, Tier 0**. The final audit is **32 finalized blocks later**. These are complementary historical snapshots, **not** independent security audits and **not** evidence that no state changes could occur outside the observed blocks. The prior workflow's failure status must not be represented as success.

### Audited subjects and contracts

- USER: `0xBF579B9DFe4E8f017eaFD67390f359B229380b80`
- DEPLOYER: `0xF80a456710B7aF746D88733dc456BC3190E6FA31`
- PRIMARY legacy PIECore: `0x9CF55d0b9D61Dc28EF3cb10765CF4b861Cd0991e`
- EARLIER legacy PIECore: `0xDa3BdF42006a2d90E14aB58a202C6bedBB6865ba`

| Contract | Wallet | XP | Path | Tier | Corroboration |
|---|---|---:|---|---:|---|
| PRIMARY | USER | 0 | 0 — None | 0 | PASS |
| PRIMARY | DEPLOYER | 0 | 0 — None | 0 | PASS |
| EARLIER | USER | 0 | 0 — None | 0 | PASS |
| EARLIER | DEPLOYER | 15000 | 1 — Sovereign | 0 | PASS |

The EARLIER / DEPLOYER result is supported by `PathChosen(path=1)` in [tx `0xc9c7d596...`](https://sepolia.etherscan.io/tx/0xc9c7d596e6ed03aaacb3476227baccc0cc3bad591d4099644f83aa0ad5ea8d91) at block 10321092 and `XPGained(amount=15000)` in [tx `0xd68416e9...`](https://sepolia.etherscan.io/tx/0xd68416e9366acead1821d90ad63c7a75e3d25e3714aaf8dbee0872c1af7ddc66) at block 10321096. The receipt and matching block-hash checks were part of the original audit.

### Interpretation and boundaries

1. USER has **0 XP, Path None, Tier 0** at the audited block **in the two named legacy PIECore contracts**. No statement is made about other deployments, later blocks, off-chain activity, or new PIE v0.2 contracts.
2. DEPLOYER has **15000 XP, Sovereign, Tier 0** in EARLIER only. The legacy ledger entry **does not prove the authenticity of the underlying contribution**.
3. GFLO token ownership is a separate question. The earlier independent ERC-20 transfer inspection found **1,000,000 Sepolia GFLO** assigned to USER; that token history is **not the PIE identity-state proof** here.
4. PASS attests to the consistency of raw view calls, complete provider-served historical event ranges and receipt checks at the anchor block. It **does not** establish token value, contract security, identity ownership by a particular person, migration approval, or Genesis readiness.
5. Historical log completeness still relies on the chosen RPC provider. Receipt corroboration helps validate observed events but does not cryptographically prove that the provider returned every transaction log.
6. Do not automatically carry 15000 legacy XP or token ownership into Verified Contribution Core, OctoPass identity, or PIE v0.2 Tier rights.

### Preservation and change control

- This archive is maintained on a **documentation-only branch** rooted at `main` (`c2fa6e89cc47d67b9fa99a6a51c5d31a62051298`).
- The archived `audit.json`, `audit.md`, and `sha256.txt` are immutable evidence. Corrections or changed interpretations should go into a **new** follow-up document; never silently rewrite original evidence.
- Audit implementation stays on the separate `audit/sepolia-legacy-pie-readonly` branch at `a540fe3e51c033dba83ba6fa0da2daec2572f049`.
- PR #9 remains an independent PIE v0.2 baseline-review gate.
- No contract deployment, token movement, wallet signing, automatic migration, merge, or Genesis initiation was performed during archival.

**Next gate:** independent documentation/code review of this archive; thereafter PIE v0.2 PR #9 review, followed by Verified Contribution Core proof-source security gates.
