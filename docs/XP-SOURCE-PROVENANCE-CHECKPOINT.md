# GFLO XP provenance checkpoint — 2026-10-15

## Reported outcome
Native Termux, solc 0.8.34, EthereumJS VM:

- **8/8 XP Source Provenance negative-control scenarios completed as expected**.
- Legacy CanonicalXPAdapterV02 accepted a fake XP source reporting 65,000 XP when initially configured with that source.
- The hash-guard prototype rejected that fake source given a pre-approved authentic hash.
- **Important negative control:** hash-guard ALSO accepted the fake source when presented with the fake source's corresponding hash. This demonstrates lack of independent approval of the expected hash.

These are user-reported local tests, not an independent audit or CI run. They intentionally include a reproduced weakness and must NOT be counted as eight security controls.

## Response
A separate prototype, `contracts/TrustedXPSourceRegistryV02.sol`, was added without modifying the successful prior contracts. Its governance address can be a contract-based wallet in a future passkey/WebAuthn approval flow, but **the current contract does not perform WebAuthn verification**.

The registry:
- permanently binds one PIE Core;
- checks XP Policy address/codehash and linked Core and policy owner;
- requires governance to propose, then activate a source;
- starts paused and supports emergency pausing;
- allows a single source activation and no direct replacement.
 
## Critical trust boundary
Governance is the trust root. **A compromised governance account can approve forged policy code and matching forged hash.** Proposal/activation by the same key is not independent multi-party approval. The codehash is not proof of verified software, and a governance-passkey alone does not prove code integrity. Rotating the policy's owner invalidates this registry's reads unless a new version/migration design is adopted; the registry cannot change the pinned owner.

## Upcoming tests
1. Compile the registry under the working native Termux solc-js.
2. EVM constructor tests: missing core, missing governance, EOA core.
3. Source tests: authorized proposal/activation, wrong PIE, wrong code hash, wrong policy owner, pause, no source rotation.
4. Negative control: governance choosing fake source + corresponding fake hash can still activate — make this clear rather than classing it as security pass.
5. Prepare release-manifest independent review, proper signer threshold/quorum and passkey-enabled smart-account governance.
6. Test migration and replay consistency before adding GFLO Ignition.

**Do not deploy to Sepolia, merge into main, or claim audit readiness on this basis.**
