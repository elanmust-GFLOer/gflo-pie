# GFLO XP Source Provenance + Passkey — architecture decision draft

**Status:** proposal and red-team test; no production authentication implementation.

## Defense in depth
1. **Source provenance:** a contract runtime hash identifies code bytes, not whether an approver approved those bytes. Treat an arbitrary constructor-supplied expectedHash as untrusted.
2. **Approval authorization:** a reviewed release manifest binds chainId, PIE Core, XP Policy address, runtime hash, compiler settings, git commit, expiry and nonce. Approval should come from trusted governance, not the deploying transaction's arbitrary inputs.
3. **Passkey/WebAuthn:** authenticate authorized humans for manifest approvals or high-impact verifier decisions. A passkey is a user-authentication credential, not proof of correct bytecode or unique human identity.
4. **Quorum and recovery:** require threshold policy for major upgrades and recovery; a single passkey device/account cannot be a universal admin dependency.
5. **Contract on-chain enforcement:** a governance-approved registry/factory would enforce allowed release hashes and bindings. The next contract design should not be deployed before governance and attack tests.

## Web3 compatibility and implementation options

**Option A (suggested first):** use a smart account or governance wallet that supports passkeys/WebAuthn for sign-in/approval and ERC-1271 contract signature validation. On-chain registry trusts the governance contract's validated approvals, not off-chain login sessions.

**Option B:** implement direct P-256/WebAuthn signature checks in a dedicated verifier. Consider EIP-7951 P-256 precompile where supported; add compatibility fallback only after gas and security review. WebAuthn signatures also require authenticatorData and clientDataJSON checks, challenge/rpId binding, UV/user presence flags and origins — do not accept a bare P-256 signature as equivalent to full WebAuthn.

**Option C:** trusted EOA/multisig approval as an interim testnet-only route with explicit risk disclosures, while passkey-ready governance evolves.

## Approval manifest (proposed)
- chainId, coreAddress, policyAddress, policyRuntimeCodehash
- audited/reviewed source revision and deployment artifact digest
- version, nonce, validUntil, authorized governance domain / verifyingContract
- unambiguous policy migration reference
- signatures or contract-account validation, threshold if applicable

## Key threat tests
- forged policy + forged matching expectedHash passes the current standalone HashGuard (negative-control test);
- unapproved policy/hash denied by registry;
- signature with wrong chainId / contract / nonce / expiry rejected;
- approval revoked or superseded;
- repeated manifest rejected;
- verifier roles cannot bypass approved source;
- migration cannot reset claim replay history or double-credit XP.

## Standards to evaluate
- W3C WebAuthn Level 3
- ERC-1271 signature validation for smart contract wallets
- ERC-4337 account abstraction
- EIP-7951 secp256r1/P-256 signature-verification precompile
- EIP-712 typed data structured signing (when signers/tooling support it)

**Important:** a passkey alone does not guarantee one-human-one-account, address user onboarding, or establish that a third-party contract is genuine. The authorized governance approval and independently reproducible build are trust roots.

## Immediate execution
Run `scripts/pie-v02-xp-provenance-negative-control.mjs` under native Termux; it intentionally confirms the remaining weakness. Then design a minimal governance-signed source registry with a mock-authority test before implementing live passkey validation.
