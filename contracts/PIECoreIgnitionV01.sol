// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice PIE Core v0.3 pilot for atomic GFLO Ignition.
/// @dev Fresh deployment only: v0.2 wallet identities are NOT migrated.
contract PIECoreIgnitionV01 {
    enum Path { None, Sovereign, Reformer, Praxis }
    struct Identity { bool exists; uint64 xp; Path selectedPath; uint8 tier; }

    uint64 public constant GENESIS_XP = 25;
    address public immutable bindingAuthority;
    address public ignition;
    mapping(address => Identity) private identities;

    error NotBindingAuthority();
    error IgnitionAlreadyBound();
    error InvalidIgnition();
    error IdentityAlreadyExists();
    error MissingIdentity();
    error InvalidPath();
    error NotIgnition();
    error InvalidTierTransition();
    error TargetPathTooLow();

    event IdentityCreated(address indexed account, Path selectedPath);
    event IgnitionBound(address indexed ignition);
    event TierUpgraded(address indexed account, uint8 previousTier, uint8 newTier);

    constructor(address initialBindingAuthority) {
        if (initialBindingAuthority == address(0)) revert InvalidIgnition();
        bindingAuthority = initialBindingAuthority;
    }

    function bindIgnition(address candidate) external {
        if (msg.sender != bindingAuthority) revert NotBindingAuthority();
        if (ignition != address(0)) revert IgnitionAlreadyBound();
        if (candidate == address(0) || candidate.code.length == 0) revert InvalidIgnition();
        ignition = candidate;
        emit IgnitionBound(candidate);
    }

    function createIdentity(Path target) external {
        if (identities[msg.sender].exists) revert IdentityAlreadyExists();
        if (target < Path.Sovereign || target > Path.Praxis) revert InvalidPath();
        identities[msg.sender] = Identity(true, GENESIS_XP, target, 0);
        emit IdentityCreated(msg.sender, target);
    }

    function setSelectedPath(Path target) external {
        Identity storage identity = identities[msg.sender];
        if (!identity.exists) revert MissingIdentity();
        if (target < Path.Sovereign || target > Path.Praxis ||
            uint8(target) < identity.tier + 1) revert InvalidPath();
        identity.selectedPath = target;
    }

    function getIdentity(address account) external view returns (Identity memory) {
        return identities[account];
    }

    function getCurrentPath(address account) external view returns (Path) {
        Identity storage identity = identities[account];
        return identity.exists ? Path(identity.tier + 1) : Path.None;
    }

    function upgradeTier(address account, uint8 targetTier) external {
        if (msg.sender != ignition || ignition == address(0)) revert NotIgnition();
        Identity storage identity = identities[account];
        if (!identity.exists) revert MissingIdentity();
        if (identity.tier >= 2 || targetTier != identity.tier + 1)
            revert InvalidTierTransition();
        if (uint8(identity.selectedPath) < targetTier + 1) revert TargetPathTooLow();
        uint8 prior = identity.tier;
        identity.tier = targetTier;
        emit TierUpgraded(account, prior, targetTier);
    }
}
