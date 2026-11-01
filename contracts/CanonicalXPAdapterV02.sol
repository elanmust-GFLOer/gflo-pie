// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @dev ABI of the deployed PIE Core Phase 1 identity state.
interface IPIECoreForCanonicalXP {
    enum Path { None, Sovereign, Reformer, Praxis }
    struct Identity { bool exists; uint64 xp; Path selectedPath; uint8 tier; }
    function getIdentity(address account) external view returns (Identity memory);
}

/// @dev ABI of the XP Policy v0.2 pilot.
interface IXPPolicyForCanonicalXP {
    function pie() external view returns (address);
    function totalXP(address account) external view returns (uint64);
}

/// @title CanonicalXPAdapterV02
/// @notice Immutable trust boundary binding one PIE Core to one XP Policy.
/// @dev Read-only; NOT proof of real-world merit, NOT a Tier mutator.
///      Pin both trusted implementation addresses through deployment governance.
contract CanonicalXPAdapterV02 {
    address public immutable pieCore;
    address public immutable xpPolicy;

    error InvalidContract();
    error PolicyCoreMismatch();
    error InvalidXPResponse();
    error XPBelowGenesis();

    constructor(address core, address policy) {
        if (core == address(0) || policy == address(0) ||
            core.code.length == 0 || policy.code.length == 0) {
            revert InvalidContract();
        }

        // Strict ABI-decoding catches malformed bindings; EOA / noncontract rejected above.
        address linkedCore = IXPPolicyForCanonicalXP(policy).pie();
        if (linkedCore != core) revert PolicyCoreMismatch();

        pieCore = core;
        xpPolicy = policy;
    }

    function totalXP(address account) external view returns (uint64) {
        IPIECoreForCanonicalXP.Identity memory identity =
            IPIECoreForCanonicalXP(pieCore).getIdentity(account);
        if (!identity.exists) return 0;

        uint64 xp = IXPPolicyForCanonicalXP(xpPolicy).totalXP(account);
        if (xp < identity.xp) revert XPBelowGenesis();
        return xp;
    }
}
