// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @dev Read-only interface for the v0.2 XP Policy trust checks.
interface IXPPolicyTrustV02 {
    function pie() external view returns (address);
    function owner() external view returns (address);
    function totalXP(address user) external view returns (uint64);
}

/// @title TrustedXPSourceRegistryV02
/// @notice Governance-controlled, one-time XP source activation for PIE Core v0.2.
/// @dev PILOT ONLY. Governance approval is the trust root; a codehash alone is
///      not proof of safety. Designed so governance can later be a smart account
///      with passkey-backed approval, without embedding WebAuthn verification here.
contract TrustedXPSourceRegistryV02 {
    address public immutable pieCore;
    address public governance;
    address public pendingGovernance;
    bool public paused = true;

    struct PolicySource {
        address policy;
        bytes32 runtimeCodehash;
        address policyOwner;
    }

    PolicySource public proposedSource;
    PolicySource public activeSource;

    error NotGovernance();
    error NotPendingGovernance();
    error InvalidAddress();
    error InvalidContract();
    error EmptyExpectedHash();
    error PolicyCodeHashMismatch();
    error PolicyCoreMismatch();
    error PolicyOwnerMismatch();
    error NoPendingPolicy();
    error PolicyAlreadyActivated();
    error RegistryInactive();

    event GovernanceProposed(address indexed previousGovernance, address indexed proposedGovernance);
    event GovernanceAccepted(address indexed previousGovernance, address indexed newGovernance);
    event PolicyProposed(address indexed policy, bytes32 runtimeCodehash, address indexed policyOwner);
    event PolicyActivated(address indexed policy, bytes32 runtimeCodehash, address indexed policyOwner);
    event RegistryPaused(bool paused);

    modifier onlyGovernance() {
        if (msg.sender != governance) revert NotGovernance();
        _;
    }

    constructor(address core, address initialGovernance) {
        if (core == address(0) || core.code.length == 0) revert InvalidContract();
        if (initialGovernance == address(0)) revert InvalidAddress();
        pieCore = core;
        governance = initialGovernance;
    }

    function proposeGovernance(address nextGovernance) external onlyGovernance {
        if (nextGovernance == address(0)) revert InvalidAddress();
        pendingGovernance = nextGovernance;
        emit GovernanceProposed(governance, nextGovernance);
    }

    function acceptGovernance() external {
        if (msg.sender != pendingGovernance) revert NotPendingGovernance();
        address previous = governance;
        governance = msg.sender;
        pendingGovernance = address(0);
        emit GovernanceAccepted(previous, msg.sender);
    }

    /// @notice Governance MUST independently verify build provenance before proposing.
    function proposePolicy(address policy, bytes32 expectedRuntimeCodehash, address expectedOwner)
        external onlyGovernance
    {
        if (activeSource.policy != address(0)) revert PolicyAlreadyActivated();
        _requireTrustedShape(policy, expectedRuntimeCodehash, expectedOwner);
        proposedSource = PolicySource(policy, expectedRuntimeCodehash, expectedOwner);
        emit PolicyProposed(policy, expectedRuntimeCodehash, expectedOwner);
    }

    /// @notice Two transactions, but not two independent signers. Use trusted governance.
    function activatePolicy() external onlyGovernance {
        if (activeSource.policy != address(0)) revert PolicyAlreadyActivated();
        PolicySource memory source = proposedSource;
        if (source.policy == address(0)) revert NoPendingPolicy();
        _requireTrustedShape(source.policy, source.runtimeCodehash, source.policyOwner);
        activeSource = source;
        delete proposedSource;
        emit PolicyActivated(source.policy, source.runtimeCodehash, source.policyOwner);
        // Remain paused until governance explicitly enables reads.
    }

    function setPaused(bool shouldPause) external onlyGovernance {
        paused = shouldPause;
        emit RegistryPaused(shouldPause);
    }

    /// @notice The future Ignition must use this approved address, not arbitrary totalXP().
    /// @dev Fails closed when paused, policy code changes, ownership changes,
    ///      or the policy linkage no longer matches the intended PIE Core.
    function totalXP(address user) external view returns (uint64) {
        if (paused || activeSource.policy == address(0)) revert RegistryInactive();
        PolicySource memory source = activeSource;
        _requireTrustedShape(source.policy, source.runtimeCodehash, source.policyOwner);
        return IXPPolicyTrustV02(source.policy).totalXP(user);
    }

    function _requireTrustedShape(address policy, bytes32 codehash, address expectedOwner)
        private view
    {
        if (policy == address(0) || policy.code.length == 0) revert InvalidContract();
        if (codehash == bytes32(0)) revert EmptyExpectedHash();
        if (expectedOwner == address(0)) revert InvalidAddress();
        if (policy.codehash != codehash) revert PolicyCodeHashMismatch();
        if (IXPPolicyTrustV02(policy).pie() != pieCore) revert PolicyCoreMismatch();
        if (IXPPolicyTrustV02(policy).owner() != expectedOwner) revert PolicyOwnerMismatch();
    }
}
