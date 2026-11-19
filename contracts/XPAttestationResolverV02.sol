// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { IEAS, Attestation } from "@ethereum-attestation-service/eas-contracts/contracts/IEAS.sol";
import { SchemaResolver } from "@ethereum-attestation-service/eas-contracts/contracts/resolver/SchemaResolver.sol";

interface IPIEForAttestedXP {
    struct Identity { bool exists; uint64 xp; uint8 selectedPath; uint8 tier; }
    function getIdentity(address account) external view returns (Identity memory);
}

/// @title XPAttestationResolverV02
/// @notice XPAttestationResolverV01 plus the Paths (DESIGN-004): every rule belongs to one Path in
///         PathRuleRegistryV01, unassigned rules are refused, and a rule of the member's SELECTED
///         Path earns a bounded bonus (+20%). The bonus counts against every V01 cap, so it rewards
///         focus but never raises the speed limit. The granted amount is stored per grant, so a
///         revocation deducts exactly what was earned.
/// @dev PILOT ONLY, not audited. Same schema, EAS hooks, challenge period, replay protection,
///      revocation and fail-closed pause as V01; keeps the pie()/owner()/totalXP() ABI that
///      TrustedXPSourceRegistryV02 and EffectiveTierGateV01 check.
interface IPathRuleRegistry {
    function effectiveAmount(bytes32 ruleId, uint16 baseAmount, uint8 selectedPath) external view returns (uint16);
}

contract XPAttestationResolverV02 is SchemaResolver {
    string public constant SCHEMA = "bytes32 ruleId,bytes32 eventId,bytes32 evidenceDigest";

    uint16 public constant MIN_REWARD = 25;
    uint16 public constant MAX_REWARD = 1000;
    uint32 public constant DAILY_CAP = 1500;
    uint32 public constant WEEKLY_CAP = 3000;
    uint16 public constant HIGH_TRUST_FROM = 500;
    uint64 public constant CHALLENGE_PERIOD = 3 days; // PILOT parameter

    enum Status { NONE, PENDING, VALID, REVOKED }
    struct Rule { uint16 amount; uint32 maxClaims; bool active; }
    struct Grant {
        address recipient;
        bytes32 ruleId;
        uint16 amount;
        uint64 finalizesAt;
        address attester;
        Status status;
    }

    /// @notice The only schema this resolver accepts: SCHEMA + this resolver + revocable.
    ///         Anyone may register other schemas pointing at this resolver; they are rejected.
    bytes32 public immutable schemaUID;
    IPIEForAttestedXP public immutable pie;
    IPathRuleRegistry public immutable paths;
    address public owner;
    bool public paused;

    mapping(address => uint8) public attesterLevels; // 0 none, 1 standard, 2 high trust
    mapping(bytes32 => Rule) public rules;
    mapping(bytes32 => mapping(address => bool)) public ruleAttesters;
    mapping(bytes32 => Grant) public grants; // key: EAS attestation UID
    mapping(bytes32 => bool) public usedEvents;
    mapping(bytes32 => bool) public usedEvidence;
    mapping(address => uint64) public validEarnedXP;
    mapping(address => mapping(bytes32 => uint32)) public claimsPerRule;
    mapping(address => mapping(uint256 => uint32)) public dailyXP;
    mapping(address => mapping(uint256 => uint32)) public weeklyXP;

    error NotOwner();
    error BadSetup();
    error Paused();
    error InvalidRule();
    error InvalidRole();
    error WrongSchema();
    error InvalidAttestation();
    error InvalidAttester();
    error InvalidIdentity();
    error Replay();
    error LimitReached();
    error BadGrantStatus();
    error TooEarly();
    error EmptyReason();

    event GrantPending(bytes32 indexed uid, address indexed recipient, address indexed attester, uint16 amount, uint64 finalizesAt);
    event GrantFinalized(bytes32 indexed uid, address indexed recipient, uint16 amount);
    event GrantRevoked(bytes32 indexed uid, address indexed recipient, uint16 amount, bytes32 reason);
    event PausedChanged(bool state);
    event AttesterLevelChanged(address indexed attester, uint8 level);
    event RuleAttesterChanged(bytes32 indexed ruleId, address indexed attester, bool allowed);

    /// @dev reason used when the original attester withdraws via EAS revoke.
    bytes32 public constant ATTESTER_WITHDREW = "ATTESTER_WITHDREW";

    modifier onlyOwner() { if (msg.sender != owner) revert NotOwner(); _; }

    constructor(IEAS eas, address core, address pathRegistry, address safeOwner) SchemaResolver(eas) {
        if (core.code.length == 0 || pathRegistry.code.length == 0 || safeOwner == address(0)) revert BadSetup();
        pie = IPIEForAttestedXP(core);
        paths = IPathRuleRegistry(pathRegistry);
        owner = safeOwner;
        schemaUID = keccak256(abi.encodePacked(SCHEMA, address(this), true));
    }

    // ── Governance ─────────────────────────────────────────────

    function setPaused(bool state) external onlyOwner {
        paused = state; emit PausedChanged(state);
    }

    function setAttesterLevel(address attester, uint8 level) external onlyOwner {
        if (attester == address(0) || level > 2) revert InvalidRole();
        attesterLevels[attester] = level; emit AttesterLevelChanged(attester, level);
    }

    function registerRule(bytes32 ruleId, uint16 amount, uint32 maxClaims) external onlyOwner {
        if (ruleId == bytes32(0) || amount < MIN_REWARD || amount > MAX_REWARD ||
            maxClaims == 0 || rules[ruleId].maxClaims != 0) revert InvalidRule();
        rules[ruleId] = Rule(amount, maxClaims, true);
    }

    function setRuleAttester(bytes32 ruleId, address attester, bool allowed) external onlyOwner {
        if (rules[ruleId].maxClaims == 0 || attester == address(0)) revert InvalidAttester();
        ruleAttesters[ruleId][attester] = allowed;
        emit RuleAttesterChanged(ruleId, attester, allowed);
    }

    /// @notice High-privilege correction; governance must document reason and appeal off-chain.
    function governanceRevoke(bytes32 uid, bytes32 reason) external onlyOwner {
        if (reason == bytes32(0)) revert EmptyReason();
        if (!_revokeGrant(uid, reason)) revert BadGrantStatus();
    }

    // ── EAS hooks ──────────────────────────────────────────────

    function onAttest(Attestation calldata a, uint256 /* value */) internal override returns (bool) {
        if (paused) revert Paused();
        if (a.schema != schemaUID) revert WrongSchema();
        if (!a.revocable || a.expirationTime != 0) revert InvalidAttestation();
        if (a.recipient == address(0) || a.attester == a.recipient) revert InvalidAttestation();

        (bytes32 ruleId, bytes32 eventId, bytes32 evidenceDigest) =
            abi.decode(a.data, (bytes32, bytes32, bytes32));
        if (eventId == bytes32(0) || evidenceDigest == bytes32(0)) revert InvalidAttestation();

        Rule memory rule = rules[ruleId];
        if (!rule.active) revert InvalidRule();
        if (!ruleAttesters[ruleId][a.attester] ||
            attesterLevels[a.attester] < (rule.amount >= HIGH_TRUST_FROM ? 2 : 1)) revert InvalidAttester();
        IPIEForAttestedXP.Identity memory member = pie.getIdentity(a.recipient);
        if (!member.exists) revert InvalidIdentity();
        // Reverts for a rule without a Path (fail closed). Trust level above uses the base amount.
        uint16 amount = paths.effectiveAmount(ruleId, rule.amount, member.selectedPath);
        if (usedEvents[eventId] || usedEvidence[evidenceDigest] ||
            grants[a.uid].status != Status.NONE) revert Replay();

        _reserveQuota(a.recipient, ruleId, amount, rule.maxClaims);
        usedEvents[eventId] = true;
        usedEvidence[evidenceDigest] = true;
        uint64 deadline = uint64(block.timestamp + CHALLENGE_PERIOD);
        grants[a.uid] = Grant(a.recipient, ruleId, amount, deadline, a.attester, Status.PENDING);
        emit GrantPending(a.uid, a.recipient, a.attester, amount, deadline);
        return true;
    }

    /// @dev Attester withdrawal is always allowed, also while paused (fail-safe direction).
    ///      Already governance-revoked grants are accepted without a second deduction.
    function onRevoke(Attestation calldata a, uint256 /* value */) internal override returns (bool) {
        if (a.schema != schemaUID) revert WrongSchema();
        _revokeGrant(a.uid, ATTESTER_WITHDREW);
        return true;
    }

    // ── Lifecycle and reads ────────────────────────────────────

    function finalize(bytes32 uid) external {
        if (paused) revert Paused();
        Grant storage grant = grants[uid];
        if (grant.status != Status.PENDING) revert BadGrantStatus();
        if (block.timestamp < grant.finalizesAt) revert TooEarly();
        grant.status = Status.VALID;
        validEarnedXP[grant.recipient] += grant.amount;
        emit GrantFinalized(uid, grant.recipient, grant.amount);
    }

    /// @notice ABI-compatible with TrustedXPSourceRegistryV02 / EffectiveTierGateV01.
    /// @dev Pause fails closed: downstream entitlement gates revert too.
    function totalXP(address wallet) external view returns (uint64) {
        if (paused) revert Paused();
        IPIEForAttestedXP.Identity memory identity = pie.getIdentity(wallet);
        if (!identity.exists) return 0;
        return identity.xp + validEarnedXP[wallet];
    }

    function _revokeGrant(bytes32 uid, bytes32 reason) private returns (bool) {
        Grant storage grant = grants[uid];
        if (grant.status != Status.PENDING && grant.status != Status.VALID) return false;
        if (grant.status == Status.VALID) validEarnedXP[grant.recipient] -= grant.amount;
        grant.status = Status.REVOKED;
        emit GrantRevoked(uid, grant.recipient, grant.amount, reason);
        return true;
    }

    function _reserveQuota(address recipient, bytes32 ruleId, uint16 amount, uint32 maxClaims) private {
        uint32 count = claimsPerRule[recipient][ruleId];
        uint256 dayId = block.timestamp / 1 days;
        uint256 weekId = block.timestamp / 7 days;
        if (count >= maxClaims ||
            uint256(dailyXP[recipient][dayId]) + amount > DAILY_CAP ||
            uint256(weeklyXP[recipient][weekId]) + amount > WEEKLY_CAP) revert LimitReached();
        claimsPerRule[recipient][ruleId] = count + 1;
        dailyXP[recipient][dayId] += amount;
        weeklyXP[recipient][weekId] += amount;
    }
}
