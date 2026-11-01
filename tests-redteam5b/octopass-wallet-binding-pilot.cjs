"use strict";
// GFLO Proof Bridge PB01/PB02 — isolated, in-memory EOA wallet binding fixture.
// NOT a deployed server, API, database, authentication provider, or live OctoPass connector.
const { randomBytes } = require("node:crypto");
const { verifyMessage, getAddress } = require("ethers");

const ALLOWED_SCOPES = new Set(["pie:proof:submit"]);
function requireString(value, label) {
  if (typeof value !== "string" || !value.trim() || value.length > 256) throw Error("INVALID_" + label);
  return value;
}
function normalizeAccount(address) {
  try { return getAddress(address); } catch { throw Error("INVALID_ACCOUNT"); }
}
function validChain(chainId) {
  if (!Number.isSafeInteger(chainId) || chainId <= 0) throw Error("INVALID_CHAIN");
  return chainId;
}
function nonemptyScopes(scopes) {
  if (!Array.isArray(scopes) || scopes.length === 0 || scopes.length > 5 ||
    new Set(scopes).size !== scopes.length || scopes.some(s => !ALLOWED_SCOPES.has(s))) throw Error("INVALID_SCOPES");
  return [...scopes].sort();
}
function canonicalMessage(c) {
  // Exact ASCII/UTF-8 string, no client-provided signing text or ambiguous delimiters.
  return [
    "GFLO OctoPass Wallet Binding v0.1", "Domain: " + c.domain,
    "Profile: " + c.profileRef, "Chain ID: " + c.chainId,
    "Wallet: " + c.account, "Scopes: " + c.scopes.join(","),
    "Nonce: " + c.nonce, "Binding Epoch: " + c.epoch,
    "Issued At (ms): " + c.issuedAt,
    "Expires At (ms): " + c.expiresAt,
    "Purpose: Prove wallet control and consent to this binding only.",
    "No XP or Tier is granted."
  ].join("\n");
}
class WalletBindingPilot {
  constructor({ domain, chainId, now = () => Date.now(), ttlMs = 300000 } = {}) {
    this.domain = requireString(domain, "DOMAIN");
    this.chainId = validChain(chainId);
    if (typeof now !== "function" || !Number.isSafeInteger(ttlMs) || ttlMs < 1000 || ttlMs > 600000) throw Error("INVALID_CONFIG");
    this.now = now;
    this.ttlMs = ttlMs;
    this.challenges = new Map();
    this.bindings = new Map();
    // Profile-and-chain consent generation: revocation invalidates every older challenge.
    this.epochs = new Map();
  }
  issue({ authenticatedProfile, profileRef, account, scopes }) {
    // Caller identity is server-supplied in a real connector, never trusted from client JSON.
    if (requireString(authenticatedProfile, "AUTH") !== requireString(profileRef, "PROFILE")) throw Error("PROFILE_MISMATCH");
    const wallet = normalizeAccount(account);
    const limitedScopes = nonemptyScopes(scopes);
    const issuedAt = this.now();
    if (!Number.isSafeInteger(issuedAt) || issuedAt < 0 || !Number.isSafeInteger(issuedAt+this.ttlMs)) throw Error("INVALID_CLOCK");
    const key = profileRef + ":" + this.chainId;
    const epoch = this.epochs.get(key) ?? 0;
    const nonce = randomBytes(32).toString("hex");
    const challenge = {domain:this.domain,chainId:this.chainId,profileRef,account:wallet,scopes:limitedScopes,nonce,epoch,issuedAt,expiresAt:issuedAt+this.ttlMs};
    this.challenges.set(nonce, challenge);
    return Object.freeze({nonce, message:canonicalMessage(challenge), expiresAt:challenge.expiresAt});
  }
  verify({ authenticatedProfile, nonce, signature }) {
    requireString(authenticatedProfile, "AUTH");
    const challenge = this.challenges.get(nonce);
    if (!challenge) throw Error("INVALID_OR_USED_NONCE");
    // An unrelated authenticated profile MUST NOT consume another user's challenge.
    if (authenticatedProfile !== challenge.profileRef) throw Error("PROFILE_MISMATCH");
    const key = challenge.profileRef + ":" + challenge.chainId;
    if ((this.epochs.get(key) ?? 0) !== challenge.epoch) {
      this.challenges.delete(nonce);
      throw Error("STALE_BINDING_EPOCH");
    }
    // Consume once the authenticated owner is checked, even on expired/invalid signatures.
    // Synchronous in-memory fixture only: not an atomic cross-process database operation.
    this.challenges.delete(nonce);
    if (this.now() >= challenge.expiresAt) throw Error("CHALLENGE_EXPIRED");
    if (typeof signature !== "string") throw Error("INVALID_SIGNATURE");
    let recovered;
    try { recovered = verifyMessage(canonicalMessage(challenge),signature); } catch { throw Error("INVALID_SIGNATURE"); }
    if (recovered !== challenge.account) throw Error("WRONG_WALLET");
    const id = randomBytes(32).toString("hex");
    const previous = this.bindings.get(key);
    if (previous && previous.revokedAt === null) throw Error("ALREADY_BOUND");
    const binding = {id, profileRef:challenge.profileRef,chainId:challenge.chainId,account:challenge.account,scopes:challenge.scopes, consentAt:this.now(),revokedAt:null};
    this.bindings.set(key,binding);
    return Object.freeze({...binding,scopes:[...binding.scopes]});
  }
  revoke({ authenticatedProfile, chainId }) {
    const key = requireString(authenticatedProfile,"AUTH")+":"+validChain(chainId);
    const current = this.bindings.get(key);
    if (!current || current.revokedAt !== null) throw Error("NOT_ACTIVE");
    const at = this.now();
    if (!Number.isSafeInteger(at) || at < 0) throw Error("INVALID_CLOCK");
    const priorEpoch = this.epochs.get(key) ?? 0;
    if (!Number.isSafeInteger(priorEpoch + 1)) throw Error("EPOCH_OVERFLOW");
    current.revokedAt = at; // zero is valid: never use truthiness to test revocation
    this.epochs.set(key, priorEpoch + 1);
    // Invalidate all outstanding challenges from before revocation, including W2.
    for (const [nonce, pending] of this.challenges) {
      if (pending.profileRef === authenticatedProfile && pending.chainId === chainId) this.challenges.delete(nonce);
    }
    return true;
  }
  getActive({ authenticatedProfile, chainId }) {
    const key = requireString(authenticatedProfile,"AUTH")+":"+validChain(chainId);
    const binding = this.bindings.get(key);
    return binding && binding.revokedAt === null ? Object.freeze({...binding,scopes:[...binding.scopes]}) : null;
  }
}
module.exports = { WalletBindingPilot, canonicalMessage };
