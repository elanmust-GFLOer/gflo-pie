// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IEffectiveTierGateRT5B {
    function requireEffectiveTier(address wallet, uint8 minTier) external view;
}

/// @dev RED TEAM fixture: access protected by dynamic Tier, never raw Core tier.
contract GFLORT5BTierConsumer {
    IEffectiveTierGateRT5B public immutable gate;
    mapping(address => uint256) public successfulUses;
    constructor(address gateAddress) {
        require(gateAddress.code.length != 0, "GATE_REQUIRED");
        gate = IEffectiveTierGateRT5B(gateAddress);
    }
    function usePraxis() external {
        gate.requireEffectiveTier(msg.sender, 2);
        successfulUses[msg.sender] += 1;
    }
}