// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IPIEForProgression {
    struct Identity { bool exists; uint64 xp; uint8 selectedPath; uint8 tier; }
    function getIdentity(address account) external view returns (Identity memory);
    function upgradeTier(address account, uint8 targetTier) external;
}

interface ICanonicalXPForProgression {
    function pieCore() external view returns (address);
    function totalXP(address user) external view returns (uint64);
}

/// @title TierProgressionV01
/// @notice Tier steps by verified XP and time, with no purchase (DESIGN-004 §5, decision D3).
///         Replaces GFLOIgnitionV01 (burn-for-tier) for new deployments: it is bound to
///         PIECoreIgnitionV01 as its one-time tier authority.
///           1. start():    canonical XP has reached the next threshold, and the next tier is the
///                          member's selected goal; the qualification clock starts.
///           2. complete(): after QUALIFY_PERIOD, XP is still at or above the threshold AND grew by
///                          at least SUSTAIN_XP during the period (sustained activity, not a peak).
///         Anyone may cancel a qualification whose XP fell below the threshold (e.g. revoked XP).
/// @dev PILOT ONLY, not audited. No token, balance or payment is read here: patience and verified
///      work are the only inputs. Canonical XP comes from TrustedXPSourceRegistryV02; a paused or
///      failing registry reverts every step (fail closed).
contract TierProgressionV01 {
    uint64 public constant REFORMER_XP = 1000; // Tier 1, aligned with EffectiveTierGateV01 caps
    uint64 public constant PRAXIS_XP = 5000;   // Tier 2
    uint64 public constant QUALIFY_PERIOD = 30 days;
    uint64 public constant SUSTAIN_XP = 200;   // minimum verified growth during the period

    struct Qualification { uint64 startedAt; uint64 xpAtStart; uint8 targetTier; }

    IPIEForProgression public immutable pie;
    ICanonicalXPForProgression public immutable canonicalXP;
    mapping(address => Qualification) public qualifications;

    error InvalidSetup();
    error MissingIdentity();
    error MaximumTier();
    error GoalNotSelected();
    error InsufficientXP();
    error AlreadyQualifying();
    error NotQualifying();
    error TooEarly();
    error InsufficientSustainedActivity();
    error TierChanged();
    error StillQualified();

    event QualificationStarted(address indexed account, uint8 indexed targetTier, uint64 xp, uint64 completesAt);
    event QualificationCancelled(address indexed account, uint8 indexed targetTier, uint64 xp);
    event TierEarned(address indexed account, uint8 indexed tier, uint64 xp);

    constructor(address core, address registry) {
        if (core.code.length == 0 || registry.code.length == 0) revert InvalidSetup();
        if (ICanonicalXPForProgression(registry).pieCore() != core) revert InvalidSetup();
        pie = IPIEForProgression(core);
        canonicalXP = ICanonicalXPForProgression(registry);
    }

    function threshold(uint8 tier) public pure returns (uint64) {
        return tier == 1 ? REFORMER_XP : PRAXIS_XP;
    }

    function start() external {
        if (qualifications[msg.sender].startedAt != 0) revert AlreadyQualifying();
        uint8 next = _nextTier(msg.sender);
        uint64 xp = canonicalXP.totalXP(msg.sender);
        if (xp < threshold(next)) revert InsufficientXP();
        uint64 completesAt = uint64(block.timestamp) + QUALIFY_PERIOD;
        qualifications[msg.sender] = Qualification(uint64(block.timestamp), xp, next);
        emit QualificationStarted(msg.sender, next, xp, completesAt);
    }

    function complete() external {
        Qualification memory q = qualifications[msg.sender];
        if (q.startedAt == 0) revert NotQualifying();
        if (block.timestamp < uint256(q.startedAt) + QUALIFY_PERIOD) revert TooEarly();
        if (_nextTier(msg.sender) != q.targetTier) revert TierChanged();
        uint64 xp = canonicalXP.totalXP(msg.sender);
        if (xp < threshold(q.targetTier)) revert InsufficientXP();
        if (xp < q.xpAtStart + SUSTAIN_XP) revert InsufficientSustainedActivity();
        delete qualifications[msg.sender];
        pie.upgradeTier(msg.sender, q.targetTier);
        emit TierEarned(msg.sender, q.targetTier, xp);
    }

    /// @notice Permissionless: ends a qualification whose canonical XP dropped below the threshold.
    function cancelIfBelow(address account) external {
        Qualification memory q = qualifications[account];
        if (q.startedAt == 0) revert NotQualifying();
        uint64 xp = canonicalXP.totalXP(account);
        if (xp >= threshold(q.targetTier)) revert StillQualified();
        delete qualifications[account];
        emit QualificationCancelled(account, q.targetTier, xp);
    }

    function _nextTier(address account) private view returns (uint8 next) {
        IPIEForProgression.Identity memory identity = pie.getIdentity(account);
        if (!identity.exists) revert MissingIdentity();
        if (identity.tier >= 2) revert MaximumTier();
        next = identity.tier + 1;
        if (identity.selectedPath < next + 1) revert GoalNotSelected();
    }
}
