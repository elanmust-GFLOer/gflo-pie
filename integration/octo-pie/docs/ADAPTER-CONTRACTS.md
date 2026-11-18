# Adapter interface contracts v0.1 — descriptive, not deployed

## A. OctoPass wallet link

`challenge = {userId, wallet, chainId, domain, nonce, expiresAt}`

User signs an EIP-4361 style sign-in message or a typed proof explicitly binding this app session. Server verifies signature + one-time nonce; stores minimal link. Always allow unlink and do not expose sensitive profile data by default.

## B. Activity proof

`ActivityEvent = {source:"octopush", eventId, actorId, activityType:"builder_completed", createdAt, evidenceDigest, issuer, idempotencyKey}`

Only trusted server code emits. Do not reward raw likes, messages, clicks, AI-generated text volume or arbitrary UI callbacks.

## C. OctoPartnR triage output

`ReviewRoute = {claimId, semaphore, reasons[], missingEvidence[], reviewerPool, requestHumanApproval}`

This is strictly advisory. The server applies deterministic mandatory policy independent of LLM classifications.

## D. Community reviewer decisions

`ReviewDecision = {panelId, claimId, reviewerId, verdict:"yes"|"no"|"abstain", evidenceReference, decisionNonce, signedAt}`

Claimant cannot appoint reviewers. Authenticate votes against panel assignment, prevent duplicates, reject conflicts. Permit meaningful minority objections and appeals.

## E. GFLOEvidence on chain

`{recipient, ruleId, eventId, evidenceDigest, nonce, issuedAt, validUntil}` is EIP-712 signed by explicitly authorized attestor for target policy/chain. `XPPolicyV03.submit` receives signature and identity of attestor through authorized verifier. Only finalized grants count in canonical XP.

## F. GFLO reward pool (future)

`ReviewReward = {claimId, reviewer, qualityPolicyId, amountBaseUnits, decisionId, chainId, treasury, settlementNonce}`

An off-chain calculation is not permission to transfer funds. Enforce authorized signer, proof of completion, anti-double-pay and bounded available balances at payout. No minting.
