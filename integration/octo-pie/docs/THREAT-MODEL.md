# RED TEAM 6 — proposed integration threat model

Status: test plan, no results claimed.

| Threat | Required negative check |
|---|---|
| Wallet linking via somebody else's signature | Signature must bind user session, wallet, nonce, domain, expiry, chain; no cross-user reuse |
| Client manufactures Builder completion | Only authorized server issuer can record event; unique idempotency key |
| Bot farm/colluding wallets dominate reviewer lottery | Adversarial pool and conflict graph scenarios, independently checked eligibility |
| Reviewer copies others / majority reward farming | Blind or sealed review before reveal and quality-based, appealable rewards |
| OctoPartnR hallucinates evidence or authorizes payout | AI output never accepted as transaction authority |
| Prompt injection via public task submissions | Untrusted task text never changes review/auth policy |
| MCP permissions lookup error | Sensitive operations **fail closed**; OctoPush existing generic guard may fail open |
| XP event double-counted from two modules | Global source/event nullifiers and idempotency checks |
| Attestor and verifier collusion | Two signatures are insufficient to prove factual truth; define source validation and dispute path |
| Revoked XP still unlocks protected operation | Consumer uses EffectiveTierGate; achievedTier alone insufficient |
| Reviewer payments after revoked claims | Settlement rules and recourse policy explicit, no automatic irreversible disbursement |
| Treasury double pay / reentrancy | Exact delta, nonce, recipient, approval and refund/no-refund oracles |

Release gate: separate integrated signed-transaction tests, negative cases with exact failure causes, plus operating evidence source and real-world reviewer selection review.
