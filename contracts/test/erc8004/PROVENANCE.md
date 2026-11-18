# Vendored ERC-8004 reference contracts (test fixtures only)

Copied verbatim (MIT) from https://github.com/erc-8004/erc-8004-contracts, branch `master`, fetched 2026-11-18.
The upstream commit id could not be read from this environment, so the files are pinned by SHA-256:

```
18c8ca8c88493b46e54d000c96eaf7470d1f9dbfe55493fd7fa923bae543ff75  IdentityRegistryUpgradeable.sol
aae449c7c3b0a72a231649c5a123de693c53faf8912f197bc41d928b58d64296  MinimalUUPS.sol
d70ae5779f17b5a0b42eea535227f4004072ccc35b4d0b4ffe7c0ed5502a25c5  ERC1967Proxy.sol
```

Tests deploy them through the official path: ERC1967Proxy → MinimalUUPS.initialize (hard-coded owner, impersonated in Hardhat) → upgradeToAndCall(IdentityRegistryUpgradeable, initialize()). Never deploy from here.
