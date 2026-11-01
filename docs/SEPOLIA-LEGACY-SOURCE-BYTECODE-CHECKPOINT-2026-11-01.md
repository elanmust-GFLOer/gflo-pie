# Sepolia legacy contracts — bytecode provenance checkpoint (2026-11-01)

**Investigation status:** read-only Etherscan creation-transaction and GitHub artifact matching. **Not an Etherscan source-verification submission, not a security audit.** ChainId = `11155111` (Ethereum Sepolia). All three deployment receipts reported `0x1`.

## GasFeeLoop — MATCHED deployment creation bytecode

- Contract: `0xd2C926F67080D6315b5dbBc7D621d729Cfe8A9C7`
- Deployment tx: `0x4e2f484d1ef06b6ac839a7cf12ae28286fea49652b14352d7d9fe3e63775a21c`
- Candidate artifact: [GasFeeLoop-/compiled/contracts_GasFeeLoop_sol_GasFeeLoop.bin](https://github.com/elanmust-GFLOer/GasFeeLoop-/blob/main/compiled/contracts_GasFeeLoop_sol_GasFeeLoop.bin), git blob `fd22040d28553d691605916356c52232948e8920`.
- **Observed exact result:** Deployment input = 5,508 bytes; artifact = 5,444 bytes; input begins **exactly** with every byte of the artifact. Remaining 64 bytes = two 32-byte ABI constructor arguments:
  1. GFLOToken `0x563b2e3b499818a2f84c472efb3169a2667807fe`
  2. PIECore `0x9CF55d0b9D61Dc28EF3cb10765CF4b861Cd0991e`
- Creation bytecode metadata suffix indicates compiler `solc 0.8.34` (`...736f6c63430008220033`), but **all standard-json settings and source/dependency reconstruction still need a reproducible compiler run**. Exact creation-bytecode match alone is not an Etherscan verified source flag.

## GFLOIgnition — source candidate found, NOT yet bytecode-matched

- Contract: `0x414DEDcf9264614Fd087BDa58bE27a0B698CcC54`
- Deployment tx: `0xe8a8d509403932a2aab23f96b9acb417aae86989bcd2c9843a3e8643c90dacb3`
- Deployment input 8,133 bytes, last 96 bytes = 3 ABI constructor arguments, corresponding to PIECore, GFLOToken, treasury/deployer.
- Candidate source [GasFeeLoop-/contracts/core/GFLOIgnition.sol](https://github.com/elanmust-GFLOer/GasFeeLoop-/blob/main/contracts/core/GFLOIgnition.sol) has this 3-argument constructor; exact build matching is **not yet established**.
- Metadata suffix suggests `solc 0.8.34`.
- **Correction:** The [gflo-backend Hungarian README](https://github.com/elanmust-GFLOer/gflo-backend/blob/master/(Hun)README.md) previously claimed this Ignition address is byte-for-byte identical to PIECore. Direct creation input comparison disproves creation-bytecode identity: PIECore creation input = 6,923 bytes; Ignition = 8,133 bytes; different first bytes and different constructor argument layouts. A separate *runtime* bytecode comparison is still appropriate, but the original blanket byte-for-byte claim must not be treated as established.

## GFLOToken — original source/build NOT yet found

- Contract: `0x563b2e3b499818a2f84c472efb3169a2667807fe`
- Deployment tx: `0xf2cce54154bea5d4196a2886c68539e140b0d1077624c58e6ae6ede89a7a25fa`
- Creation input = 3,577 bytes; metadata suffix indicates `solc 0.8.33` (`...736f6c63430008210033`), distinct from Ignition/GasFeeLoop.
- Do **not** assume `gflo-clean/contracts/GFLOToken.sol` or `gflo-pie/contracts/MockGFLO.sol` matches this deployed code without exact compilation and bytecode comparison.

## Source verification submission gate

1. Recreate each contract with exact original sources, compiler version, optimizer, EVM version, metadata and settings. Match creation bytecode plus exact ABI constructor tail; independently compare on-chain runtime bytecode.
2. Prepare `solidity-standard-json-input` per target, with exact `contractname` and compiler, plus license and constructor args.
3. Submit to Etherscan Sepolia only if exact match; monitor accepted verification status and record explorer URLs.
4. Stop on mismatches; never submit unrelated sources or claim source verification merely from a successful deployment.
5. No deploy, secrets, token movement or main merge authorized by this document.

**Tool boundary:** Available connected Etherscan tools provide source/ABI, creation and transaction reads, but no source-submission operation. Work therefore reached a bytecode provenance checkpoint, not the explorer verification end state.
