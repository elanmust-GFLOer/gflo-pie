# Source review — 2026-10-15

Sources inspected directly:
- GFLO PIE GitHub development branch `feature/pie-core-v0.2` and user-executed signed EthereumJS test reports.
- Lovable project `fafc7193-490d-4527-be77-4296369a300b`, displayed as OctoChain Collective.
- OctoPush `src/lib/octopass.functions.ts`, `src/routes/_authenticated/octopass.tsx`, `src/lib/partnr.server.ts`, `src/lib/partnr.functions.ts`, `src/lib/partnr-constitution.ts`, `src/lib/mcp/guard.ts`.
- Lovable plan files: OctoPartnR v0.1 and Cognitive Semaphore, OctoPass Identity.

Observed:
- OctoPartnR uses a four-state semaphore and a 12-article constitution; its server implementation stores requests/reflections and suggests agents. No authenticated on-chain GFLO attestation or payment interface shown in reviewed files.
- OctoPass is an application-level Supabase profile, not a proven on-chain wallet.
- `src/lib/mcp/guard.ts` generic MCP policy reader returns null on policy lookup error or missing row (fail-open). It cannot be reused for privileged GFLO payout/auth.
- GFLO PIE XPPolicyV03, EffectiveTierGate and Safe/Ignition have passed user-run local EthereumJS signed transaction scenarios, not public testnet or third-party audit.

Limits:
No live database policies, real user claims or deployment provenance verified; Lovable project published does not mean GFLO integration exists. Actual organizational attestor independence, Sybil resistance and economic fairness remain unresolved.
