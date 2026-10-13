// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title PIECoreV02
/// @notice Genesis identity and deterministic Path state machine.
/// @dev Phase 1: no XP administrator or token-based upgrade entrypoint is exposed.
contract PIECoreV02 {
    enum Path { None, Sovereign, Reformer, Praxis }

    struct Identity {
        bool exists;
        uint64 xp;
        Path selectedPath;
        uint8 tier; // 0 = Sovereign, 1 = Reformer, 2 = Praxis
    }

    uint64 public constant GENESIS_XP = 25;
    uint8 public constant MAX_TIER = 2;

    mapping(address => Identity) private _identities;

    error IdentityAlreadyExists();
    error IdentityDoesNotExist();
    error InvalidTargetPath();
    error TargetBelowCurrentTier();

    event IdentityCreated(address indexed account, Path indexed selectedPath, uint64 genesisXP);
    event TargetPathChanged(address indexed account, Path indexed previousPath, Path indexed newPath);

    /// @notice Creates a wallet-bound identity. Choosing a higher target does NOT grant a higher tier.
    function createIdentity(Path target) external {
        if (_identities[msg.sender].exists) revert IdentityAlreadyExists();
        if (!_validTarget(target)) revert InvalidTargetPath();

        _identities[msg.sender] = Identity({
            exists: true,
            xp: GENESIS_XP,
            selectedPath: target,
            tier: 0
        });
        emit IdentityCreated(msg.sender, target, GENESIS_XP);
    }

    /// @notice Adjusts the goal only; XP and earned tier remain unchanged.
    /// @dev A target below the already earned tier is not meaningful and is rejected.
    function setSelectedPath(Path target) external {
        Identity storage identity = _identities[msg.sender];
        if (!identity.exists) revert IdentityDoesNotExist();
        if (!_validTarget(target)) revert InvalidTargetPath();
        if (uint8(target) < identity.tier + 1) revert TargetBelowCurrentTier();

        Path previous = identity.selectedPath;
        identity.selectedPath = target;
        emit TargetPathChanged(msg.sender, previous, target);
    }

    function getIdentity(address account) external view returns (Identity memory) {
        return _identities[account];
    }

    function getCurrentPath(address account) external view returns (Path) {
        if (!_identities[account].exists) return Path.None;
        return Path(_identities[account].tier + 1);
    }

    function nextTier(uint8 currentTier) public pure returns (uint8) {
        require(currentTier < MAX_TIER, "Max tier reached");
        return currentTier + 1;
    }

    /// @notice Only adjacent ascending transitions are valid, never downgrade, skip, or > Praxis.
    function isValidTransition(uint8 fromTier, uint8 toTier) public pure returns (bool) {
        return fromTier < MAX_TIER && toTier == fromTier + 1;
    }

    function _validTarget(Path target) private pure returns (bool) {
        return target >= Path.Sovereign && target <= Path.Praxis;
    }

    // The tier mutation will be introduced together with an atomic GFLO ignition
    // mechanism. There is deliberately no public/admin tier bypass in phase 1.
}
