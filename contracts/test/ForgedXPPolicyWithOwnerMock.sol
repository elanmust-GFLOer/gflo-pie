// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Adversarial test fixture ONLY — not a real XP accounting policy.
/// @dev Satisfies the registry's shallow interface and claims fake XP.
///      Demonstrates that an untrusted governance can approve arbitrary code.
contract ForgedXPPolicyWithOwnerMock {
    address public immutable pie;
    address public immutable owner;

    constructor(address core, address claimedOwner) {
        pie = core;
        owner = claimedOwner;
    }

    function totalXP(address) external pure returns (uint64) {
        return 65000;
    }
}
