# GFLO Registry Quorum v0.3 — Passkey-ready signer rotation pilot

**Status:** untested Solidity candidate, user must first compile and execute local regression.
**Prior milestone:** 89/89 reported local v0.2 scenarios, including intentionally successful adversarial scenarios.
**Files:**
- `contracts/GFLORegistryQuorumV03.sol`
- `scripts/pie-v03-registry-quorum-rotation.mjs`

## Changes compared with v0.2

- 2/3 signer approval remains mandatory for executing registry policy activation, proposals and pause toggles.
- The three signer addresses can now be changed **one at a time** by a 2/3 approved rotation proposal.
- Replacement increments an `epoch`. Pending proposals from any older epoch cannot execute or receive further approvals.
- Revoked addresses lose signer permissions immediately after rotation.
- Contract-based smart accounts can appear among signer addresses and internally use WebAuthn/passkeys; the Quorum contract checks `msg.sender` only.

## Important limitations

- No WebAuthn passkey ceremony, P-256 verification, ERC-1271 validation or ERC-4337 user operation is performed by this contract.
- If two of three signer controls are lost, this Quorum cannot recover because replacement itself still requires 2/3.
- Two collaborating malicious signers can approve malicious XP source manifests and bypass the intended human review.
- No timelock, veto, expiration, duplicate-content suppression, multi-stage signer nomination, emergency recovery or audit.
- A nominated contract-based signer must be deployed and operational; its own wallet-specific security and chain compatibility require separate testing.
- The trusted source Registry remains single-activation; code provenance is a separate release governance problem.

## Regression plan

The new 13-case Termux test derives the first ten checks from v0.2 and adds:
1. One signer alone cannot execute replacement.
2. Two signers can revoke old signer and install replacement, incrementing epoch.
3. Previously approved but pending proposals cannot execute after rotation; revoked signer cannot create or approve.

These tests do not establish production safety. Run signed-transaction, state-transition, invariant and recovery simulations before testnet use.

## Before any deployment

- Complete independent manifest approval for policy runtime bytecode, chainId, contract address and owner.
- Review rotation-gas cost, epoch rollovers, stale-proposal storage buildup and governance timelock / veto.
- Decide whether to rely on audited multisig / smart-account solutions instead of maintaining bespoke governance code.
