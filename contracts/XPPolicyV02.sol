// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @dev ABI-compatible read-only interface for PIECoreV02.
interface IPIEIdentityV02 {
    enum Path { None, Sovereign, Reformer, Praxis }
    struct Identity { bool exists; uint64 xp; Path selectedPath; uint8 tier; }
    function getIdentity(address account) external view returns (Identity memory);
}

/// @title XPPolicyV02
/// @notice Validated, non-transferable XP earned after PIE Core's one-time Genesis allocation.
/// @dev Pilot: does not mutate PIECoreV02 XP or Tier, and does not provide GFLO ignition.
contract XPPolicyV02 {
    uint16 public constant MIN_REWARD = 25;
    uint16 public constant MAX_REWARD = 1000;
    uint32 public constant DAILY_CAP = 1500;
    uint32 public constant WEEKLY_CAP = 3000;
    uint16 public constant HIGH_TRUST_FROM = 500;

    // 0: none; 1: standard; 2: elevated (also permits standard awards).
    uint8 public constant STANDARD_VERIFIER = 1;
    uint8 public constant ELEVATED_VERIFIER = 2;

    IPIEIdentityV02 public immutable pie;
    address public owner;
    address public pendingOwner;
    bool public paused;

    struct RewardRule {
        uint16 xpAmount;
        uint32 maxClaimsPerIdentity;
        uint32 cooldownSeconds;
        bool exists;
        bool active;
    }

    mapping(bytes32 => RewardRule) public rewardRules;
    mapping(address => uint8) public verifierRoles;
    mapping(bytes32 => bool) public usedEventIds;
    mapping(bytes32 => bool) public usedEvidenceHashes;
    mapping(address => uint64) public earnedXP;
    mapping(address => mapping(bytes32 => uint32)) public claimsPerRule;
    mapping(address => mapping(bytes32 => uint64)) public lastClaimAt;
    mapping(address => mapping(uint256 => uint32)) public dailyXP;
    mapping(address => mapping(uint256 => uint32)) public weeklyXP;

    error NotOwner();
    error NotPendingOwner();
    error InvalidAddress();
    error InvalidVerifierRole();
    error RuleAlreadyExists();
    error InvalidRule();
    error RuleNotActive();
    error NotAuthorizedVerifier();
    error IdentityRequired();
    error InvalidEvidence();
    error DuplicateEvent();
    error DuplicateEvidence();
    error ClaimLimitReached();
    error CooldownActive();
    error DailyLimitReached();
    error WeeklyLimitReached();
    error AwardsPaused();

    event OwnershipTransferStarted(address indexed previousOwner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event VerifierRoleChanged(address indexed verifier, uint8 role);
    event RewardRuleRegistered(bytes32 indexed ruleId, uint16 xpAmount, uint32 maxClaims, uint32 cooldownSeconds);
    event RewardRuleStatusChanged(bytes32 indexed ruleId, bool active);
    event PauseStatusChanged(bool paused);
    event XPAwarded(address indexed account, bytes32 indexed ruleId, bytes32 indexed eventId,
        bytes32 evidenceHash, uint16 amount, uint64 newEarnedXP, address verifier);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address pieCore, address initialOwner) {
        if (pieCore == address(0) || pieCore.code.length == 0 || initialOwner == address(0)) {
            revert InvalidAddress();
        }
        pie = IPIEIdentityV02(pieCore);
        owner = initialOwner;
    }

    function proposeOwner(address nextOwner) external onlyOwner {
        if (nextOwner == address(0)) revert InvalidAddress();
        pendingOwner = nextOwner;
        emit OwnershipTransferStarted(owner, nextOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        address previousOwner = owner;
        owner = msg.sender;
        pendingOwner = address(0);
        emit OwnershipTransferred(previousOwner, msg.sender);
    }

    function setVerifierRole(address verifier, uint8 role) external onlyOwner {
        if (verifier == address(0)) revert InvalidAddress();
        if (role > ELEVATED_VERIFIER) revert InvalidVerifierRole();
        verifierRoles[verifier] = role;
        emit VerifierRoleChanged(verifier, role);
    }

    /// @notice Registered amounts and quotas cannot change; use a new ruleId for revisions.
    function registerRule(bytes32 ruleId, uint16 amount, uint32 maxClaims, uint32 cooldown)
        external onlyOwner
    {
        if (ruleId == bytes32(0) || amount < MIN_REWARD || amount > MAX_REWARD || maxClaims == 0) {
            revert InvalidRule();
        }
        if (rewardRules[ruleId].exists) revert RuleAlreadyExists();
        rewardRules[ruleId] = RewardRule(amount, maxClaims, cooldown, true, true);
        emit RewardRuleRegistered(ruleId, amount, maxClaims, cooldown);
    }

    function setRuleActive(bytes32 ruleId, bool active) external onlyOwner {
        if (!rewardRules[ruleId].exists) revert InvalidRule();
        rewardRules[ruleId].active = active;
        emit RewardRuleStatusChanged(ruleId, active);
    }

    function setPaused(bool state) external onlyOwner {
        paused = state;
        emit PauseStatusChanged(state);
    }

    /// @notice Only an authorized verifier may attest completed real-world activity.
    /// @dev Neither eventId nor evidenceHash proves truth without the verifier's integrity.
    function awardXP(address account, bytes32 ruleId, bytes32 eventId, bytes32 evidenceHash) external {
        if (paused) revert AwardsPaused();
        RewardRule memory rule = rewardRules[ruleId];
        if (!rule.active) revert RuleNotActive();
        uint8 requiredRole = rule.xpAmount >= HIGH_TRUST_FROM ? ELEVATED_VERIFIER : STANDARD_VERIFIER;
        if (verifierRoles[msg.sender] < requiredRole) revert NotAuthorizedVerifier();
        if (account == address(0) || eventId == bytes32(0) || evidenceHash == bytes32(0)) {
            revert InvalidEvidence();
        }
        if (!pie.getIdentity(account).exists) revert IdentityRequired();

        // Global, single-use events AND evidence within this policy instance.
        bytes32 eventKey = keccak256(abi.encode(block.chainid, address(this), eventId));
        bytes32 evidenceKey = keccak256(abi.encode(block.chainid, address(this), evidenceHash));
        if (usedEventIds[eventKey]) revert DuplicateEvent();
        if (usedEvidenceHashes[evidenceKey]) revert DuplicateEvidence();

        uint32 claimCount = claimsPerRule[account][ruleId];
        if (claimCount >= rule.maxClaimsPerIdentity) revert ClaimLimitReached();
        if (claimCount > 0 && block.timestamp < uint256(lastClaimAt[account][ruleId]) + rule.cooldownSeconds) {
            revert CooldownActive();
        }

        // Fixed UTC epochs (7-day epochs begin Thursday 00:00 UTC).
        uint256 dayId = block.timestamp / 1 days;
        uint256 weekId = block.timestamp / 7 days;
        if (uint256(dailyXP[account][dayId]) + rule.xpAmount > DAILY_CAP) revert DailyLimitReached();
        if (uint256(weeklyXP[account][weekId]) + rule.xpAmount > WEEKLY_CAP) revert WeeklyLimitReached();

        usedEventIds[eventKey] = true;
        usedEvidenceHashes[evidenceKey] = true;
        claimsPerRule[account][ruleId] = claimCount + 1;
        lastClaimAt[account][ruleId] = uint64(block.timestamp);
        dailyXP[account][dayId] += rule.xpAmount;
        weeklyXP[account][weekId] += rule.xpAmount;
        earnedXP[account] += rule.xpAmount;
        _emitAward(account, ruleId, eventId, evidenceHash, rule.xpAmount);
    }

    /// @dev Isolating the event emission reduces stack pressure in awardXP.
    function _emitAward(address account, bytes32 ruleId, bytes32 eventId,
        bytes32 evidenceHash, uint16 amount) private {
        emit XPAwarded(account, ruleId, eventId, evidenceHash, amount,
            earnedXP[account], msg.sender);
    }

    /// @notice Phase 2 canonical XP: PIE Core Genesis allocation + policy-earned XP.
    /// @dev PIECoreV02.getIdentity(account).xp remains Genesis-only in this pilot.
    function totalXP(address account) external view returns (uint64) {
        IPIEIdentityV02.Identity memory identity = pie.getIdentity(account);
        if (!identity.exists) return 0;
        return identity.xp + earnedXP[account];
    }
}
