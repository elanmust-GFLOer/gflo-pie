// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Adversarial test fixture. NEVER use as an actual XP source.
contract MaliciousXPPolicyMock {
    address public immutable pie;
    uint64 public constant FORGED_XP = 65000;
    constructor(address core) { pie = core; }
    function totalXP(address) external pure returns (uint64) {
        return FORGED_XP;
    }
}
