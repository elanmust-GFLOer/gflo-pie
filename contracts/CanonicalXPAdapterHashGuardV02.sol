// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @dev Minimal PIE ABI; the adapter only reads the Genesis identity.
interface ICanonicalCoreV02 {
    enum Path { None, Sovereign, Reformer, Praxis }
    struct Identity { bool exists; uint64 xp; Path selectedPath; uint8 tier; }
    function getIdentity(address user) external view returns (Identity memory);
}

/// @dev Minimal XP Policy v0.2 API.
interface ICanonicalPolicyV02 {
    function pie() external view returns (address);
    function totalXP(address user) external view returns (uint64);
}

/// @notice Pilot with a policy *runtime code hash* allowlist.
/// @dev Trusted expectedPolicyCodeHash MUST originate from independent reviewed build
///      and deployment governance. A user-supplied hash of malicious code is no defense.
///      Does not handle upgradeable proxies, migrations, or cryptographic evidence validation.
contract CanonicalXPAdapterHashGuardV02 {
    address public immutable pieCore;
    address public immutable xpPolicy;
    bytes32 public immutable expectedPolicyCodeHash;

    error InvalidContract();
    error EmptyExpectedHash();
    error PolicyCodeHashMismatch();
    error PolicyCoreMismatch();
    error XPBelowGenesis();

    constructor(address core, address policy, bytes32 expectedHash) {
        if (expectedHash == bytes32(0)) revert EmptyExpectedHash();
        if (core == address(0) || policy == address(0) ||
            core.code.length == 0 || policy.code.length == 0) revert InvalidContract();
        if (policy.codehash != expectedHash) revert PolicyCodeHashMismatch();
        if (ICanonicalPolicyV02(policy).pie() != core) revert PolicyCoreMismatch();

        pieCore = core;
        xpPolicy = policy;
        expectedPolicyCodeHash = expectedHash;
    }

    function totalXP(address account) external view returns (uint64) {
        // Check each time to fail closed if runtime code changes in unusual environments.
        if (xpPolicy.codehash != expectedPolicyCodeHash) revert PolicyCodeHashMismatch();
        ICanonicalCoreV02.Identity memory identity = ICanonicalCoreV02(pieCore).getIdentity(account);
        if (!identity.exists) return 0;
        uint64 result = ICanonicalPolicyV02(xpPolicy).totalXP(account);
        if (result < identity.xp) revert XPBelowGenesis();
        return result;
    }
}
