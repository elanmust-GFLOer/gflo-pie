// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { IEAS, Attestation } from "@ethereum-attestation-service/eas-contracts/contracts/IEAS.sol";
import { SchemaResolver } from "@ethereum-attestation-service/eas-contracts/contracts/resolver/SchemaResolver.sol";

interface IAgentBindingForXP {
    struct Binding { address operator; address agentWallet; uint64 boundAt; uint32 epoch; bool suspended; }
    function isActive(uint256 agentId) external view returns (bool);
    function getBinding(uint256 agentId) external view returns (Binding memory);
    function agentOfWallet(address wallet) external view returns (bool bound, uint256 agentId, address operator, uint32 epoch);
    function recordStrike(address operator) external;
}

/// @title AgentXPResolverV01
/// @notice EAS resolver for verified work done by ERC-8004 agents bound to a human operator.
///         Same lifecycle as XPAttestationResolverV01 (PENDING -> VALID / REVOKED), plus
///         farming bounds that do not grow with the number of agents:
///           1. per agent+epoch: rule claims, daily and weekly caps
///           2. per OPERATOR (all of their agents together): daily and weekly caps equal to
///              one agent's, so N agents earn no faster than one
///           3. per ATTESTER -> OPERATOR: weekly cap, so one attester cannot feed one operator
///           4. no self-dealing: attester is never the operator, the agent, or a sibling agent
///         Agent XP is keyed by (agentId, epoch): a transferred or re-walleted agent starts at 0.
///         Agent XP never flows into the operator's human XP.
/// @dev PILOT ONLY, not audited. Human XP stays in XPAttestationResolverV01; ERC-8004 agentId 0
///      is valid, so humans and agents use separate schemas and resolvers.
contract AgentXPResolverV01 is SchemaResolver {
    string public constant SCHEMA = "bytes32 ruleId,bytes32 eventId,bytes32 evidenceDigest,uint256 agentId";

    uint16 public constant MIN_REWARD = 25;
    uint16 public constant MAX_REWARD = 1000;
    uint32 public constant AGENT_DAILY_CAP = 1500;
    uint32 public constant AGENT_WEEKLY_CAP = 3000;
    uint32 public constant OPERATOR_DAILY_CAP = 1500;     // all agents of one operator together
    uint32 public constant OPERATOR_WEEKLY_CAP = 3000;
    uint32 public constant ATTESTER_OPERATOR_WEEKLY_CAP = 1500;
    uint16 public constant HIGH_TRUST_FROM = 500;
    uint64 public constant CHALLENGE_PERIOD = 3 days;     // PILOT parameter

    enum Status { NONE, PENDING, VALID, REVOKED }
    struct Rule { uint16 amount; uint32 maxClaims; bool active; }
    struct Grant {
        uint256 agentId;
        uint32 epoch;
        address operator;
        address attester;
        bytes32 ruleId;
        uint16 amount;
        uint64 finalizesAt;
        Status status;
    }

    bytes32 public immutable schemaUID;
    IAgentBindingForXP public immutable binding;
    address public owner;
    bool public paused;

    mapping(address => uint8) public attesterLevels;
    mapping(bytes32 => Rule) public rules;
    mapping(bytes32 => mapping(address => bool)) public ruleAttesters;
    mapping(bytes32 => Grant) public grants;               // EAS UID => grant
    mapping(bytes32 => bool) public usedEvents;
    mapping(bytes32 => bool) public usedEvidence;
    mapping(uint256 => mapping(uint32 => uint64)) public agentXP;   // agentId => epoch => VALID XP

    // Quotas. Keys are hashed so every counter is a flat mapping.
    mapping(bytes32 => uint32) public quotaUsed;
    mapping(bytes32 => bool) public struck;                  // EAS UID => fraud strike already recorded

    error NotOwner();
    error BadSetup();
    error Paused();
    error InvalidRule();
    error InvalidRole();
    error WrongSchema();
    error InvalidAttestation();
    error InactiveAgent();
    error InvalidAttester();
    error SelfDealing();
    error Replay();
    error LimitReached(bytes32 bound);
    error BadGrantStatus();
    error TooEarly();
    error EmptyReason();
    error AlreadyStruck();

    event GrantPending(bytes32 indexed uid, uint256 indexed agentId, address indexed operator, address attester, uint16 amount, uint32 epoch, uint64 finalizesAt);
    event GrantFinalized(bytes32 indexed uid, uint256 indexed agentId, uint32 epoch, uint16 amount);
    event GrantRevoked(bytes32 indexed uid, uint256 indexed agentId, uint16 amount, bytes32 reason, bool strike);
    event FraudStrike(bytes32 indexed uid, uint256 indexed agentId, address indexed operator, bytes32 reason);
    event PausedChanged(bool state);
    event AttesterLevelChanged(address indexed attester, uint8 level);
    event RuleAttesterChanged(bytes32 indexed ruleId, address indexed attester, bool allowed);

    bytes32 public constant ATTESTER_WITHDREW = "ATTESTER_WITHDREW";
    bytes32 private constant B_RULE = "AGENT_RULE_CLAIMS";
    bytes32 private constant B_AGENT_DAY = "AGENT_DAILY";
    bytes32 private constant B_AGENT_WEEK = "AGENT_WEEKLY";
    bytes32 private constant B_OP_DAY = "OPERATOR_DAILY";
    bytes32 private constant B_OP_WEEK = "OPERATOR_WEEKLY";
    bytes32 private constant B_ATT_OP = "ATTESTER_OPERATOR_WEEKLY";

    modifier onlyOwner() { if (msg.sender != owner) revert NotOwner(); _; }

    constructor(IEAS eas, address binding_, address governance) SchemaResolver(eas) {
        if (binding_.code.length == 0 || governance == address(0)) revert BadSetup();
        binding = IAgentBindingForXP(binding_);
        owner = governance;
        schemaUID = keccak256(abi.encodePacked(SCHEMA, address(this), true));
    }

    // ── Governance ─────────────────────────────────────────────

    function setPaused(bool state) external onlyOwner { paused = state; emit PausedChanged(state); }

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

    /// @notice Governance correction. `strike` = fraud-class finding against the operator
    ///         (fabricated evidence, collusion); three live strikes deactivate all their agents.
    /// @dev A strike is tracked separately from XP revocation: if a colluding attester withdraws
    ///      the grant first, governance can still strike it exactly once (no second XP deduction).
    function governanceRevoke(bytes32 uid, bytes32 reason, bool strike) external onlyOwner {
        if (reason == bytes32(0)) revert EmptyReason();
        Grant storage grant = grants[uid];
        if (grant.status == Status.NONE) revert BadGrantStatus();
        bool revoked = _revokeGrant(uid, reason, strike);
        if (strike) {
            if (struck[uid]) revert AlreadyStruck();
            struck[uid] = true;
            binding.recordStrike(grant.operator);
            emit FraudStrike(uid, grant.agentId, grant.operator, reason);
        } else if (!revoked) {
            revert BadGrantStatus();
        }
    }

    // ── EAS hooks ──────────────────────────────────────────────

    function onAttest(Attestation calldata a, uint256 /* value */) internal override returns (bool) {
        if (paused) revert Paused();
        if (a.schema != schemaUID) revert WrongSchema();
        if (!a.revocable || a.expirationTime != 0 || a.recipient == address(0)) revert InvalidAttestation();

        (bytes32 ruleId, bytes32 eventId, bytes32 evidenceDigest, uint256 agentId) =
            abi.decode(a.data, (bytes32, bytes32, bytes32, uint256));
        if (eventId == bytes32(0) || evidenceDigest == bytes32(0)) revert InvalidAttestation();

        if (!binding.isActive(agentId)) revert InactiveAgent();
        IAgentBindingForXP.Binding memory b = binding.getBinding(agentId);
        if (a.recipient != b.agentWallet) revert InactiveAgent();
        _checkNoSelfDealing(a.attester, b.operator, b.agentWallet);

        Rule memory rule = rules[ruleId];
        if (!rule.active) revert InvalidRule();
        if (!ruleAttesters[ruleId][a.attester] ||
            attesterLevels[a.attester] < (rule.amount >= HIGH_TRUST_FROM ? 2 : 1)) revert InvalidAttester();
        if (usedEvents[eventId] || usedEvidence[evidenceDigest] ||
            grants[a.uid].status != Status.NONE) revert Replay();

        _reserveQuotas(agentId, b.epoch, b.operator, a.attester, ruleId, rule);
        usedEvents[eventId] = true;
        usedEvidence[evidenceDigest] = true;
        uint64 deadline = uint64(block.timestamp + CHALLENGE_PERIOD);
        grants[a.uid] = Grant(agentId, b.epoch, b.operator, a.attester, ruleId, rule.amount, deadline, Status.PENDING);
        emit GrantPending(a.uid, agentId, b.operator, a.attester, rule.amount, b.epoch, deadline);
        return true;
    }

    /// @dev Attester withdrawal is always allowed (also while paused) and is never a strike.
    function onRevoke(Attestation calldata a, uint256 /* value */) internal override returns (bool) {
        if (a.schema != schemaUID) revert WrongSchema();
        _revokeGrant(a.uid, ATTESTER_WITHDREW, false);
        return true;
    }

    // ── Lifecycle and reads ────────────────────────────────────

    function finalize(bytes32 uid) external {
        if (paused) revert Paused();
        Grant storage grant = grants[uid];
        if (grant.status != Status.PENDING) revert BadGrantStatus();
        if (block.timestamp < grant.finalizesAt) revert TooEarly();
        grant.status = Status.VALID;
        agentXP[grant.agentId][grant.epoch] += grant.amount;
        emit GrantFinalized(uid, grant.agentId, grant.epoch, grant.amount);
    }

    /// @notice VALID XP of the agent's CURRENT binding epoch; 0 when not active.
    /// @dev Pause fails closed: downstream tier gates revert too.
    function totalAgentXP(uint256 agentId) public view returns (uint64) {
        if (paused) revert Paused();
        if (!binding.isActive(agentId)) return 0;
        return agentXP[agentId][binding.getBinding(agentId).epoch];
    }

    function quotaKey(bytes32 bound, bytes32 subject, uint256 period) public pure returns (bytes32) {
        return keccak256(abi.encode(bound, subject, period));
    }

    // ── Internals ──────────────────────────────────────────────

    function _checkNoSelfDealing(address attester, address operator, address agentWallet) private view {
        if (attester == operator || attester == agentWallet) revert SelfDealing();
        (bool bound, , address attesterOperator, ) = binding.agentOfWallet(attester);
        if (bound && attesterOperator == operator) revert SelfDealing(); // sibling agent
    }

    function _reserveQuotas(uint256 agentId, uint32 epoch, address operator, address attester,
        bytes32 ruleId, Rule memory rule) private
    {
        uint256 day = block.timestamp / 1 days;
        uint256 week = block.timestamp / 7 days;
        bytes32 agentKey = keccak256(abi.encode(agentId, epoch));
        bytes32 opKey = bytes32(uint256(uint160(operator)));
        _take(quotaKey(B_RULE, keccak256(abi.encode(agentKey, ruleId)), 0), 1, rule.maxClaims, B_RULE);
        _take(quotaKey(B_AGENT_DAY, agentKey, day), rule.amount, AGENT_DAILY_CAP, B_AGENT_DAY);
        _take(quotaKey(B_AGENT_WEEK, agentKey, week), rule.amount, AGENT_WEEKLY_CAP, B_AGENT_WEEK);
        _take(quotaKey(B_OP_DAY, opKey, day), rule.amount, OPERATOR_DAILY_CAP, B_OP_DAY);
        _take(quotaKey(B_OP_WEEK, opKey, week), rule.amount, OPERATOR_WEEKLY_CAP, B_OP_WEEK);
        _take(quotaKey(B_ATT_OP, keccak256(abi.encode(attester, operator)), week),
            rule.amount, ATTESTER_OPERATOR_WEEKLY_CAP, B_ATT_OP);
    }

    function _take(bytes32 key, uint32 amount, uint32 cap, bytes32 bound) private {
        uint32 used = quotaUsed[key];
        if (uint256(used) + amount > cap) revert LimitReached(bound);
        quotaUsed[key] = used + amount;
    }

    function _revokeGrant(bytes32 uid, bytes32 reason, bool strike) private returns (bool) {
        Grant storage grant = grants[uid];
        if (grant.status != Status.PENDING && grant.status != Status.VALID) return false;
        if (grant.status == Status.VALID) agentXP[grant.agentId][grant.epoch] -= grant.amount;
        grant.status = Status.REVOKED;
        emit GrantRevoked(uid, grant.agentId, grant.amount, reason, strike);
        return true;
    }
}
