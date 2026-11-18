// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IAgentBindingForGate {
    struct Binding { address operator; address agentWallet; uint64 boundAt; uint32 epoch; bool suspended; }
    function isActive(uint256 agentId) external view returns (bool);
    function getBinding(uint256 agentId) external view returns (Binding memory);
}
interface IAgentXPForGate {
    function binding() external view returns (address);
    function totalAgentXP(uint256 agentId) external view returns (uint64);
}
interface IOperatorTierForGate {
    function effectiveTier(address wallet) external view returns (uint8);
}

/// @title AgentTierGateV01
/// @notice agentTier = min(tier from the agent's own verified XP, operator's effective tier).
///         An agent is never trusted more than the accountable human behind it.
/// @dev Inactive agents have tier 0 and fail `requireAgentTier`. A paused resolver, a paused
///      operator gate or a reverting ERC-8004 read propagates as a revert (fail-closed).
contract AgentTierGateV01 {
    IAgentBindingForGate public immutable binding;
    IAgentXPForGate public immutable agentXP;
    IOperatorTierForGate public immutable operatorGate;

    error InvalidSetup();
    error InactiveAgent(uint256 agentId);
    error InsufficientAgentTier(uint8 actual, uint8 required);

    constructor(address binding_, address agentXP_, address operatorGate_) {
        if (binding_.code.length == 0 || agentXP_.code.length == 0 || operatorGate_.code.length == 0 ||
            IAgentXPForGate(agentXP_).binding() != binding_) revert InvalidSetup();
        binding = IAgentBindingForGate(binding_);
        agentXP = IAgentXPForGate(agentXP_);
        operatorGate = IOperatorTierForGate(operatorGate_);
    }

    /// @dev Same XP scale as EffectiveTierGateV01.
    function tierFromXP(uint64 xp) public pure returns (uint8) {
        return xp >= 5000 ? 2 : xp >= 1000 ? 1 : 0;
    }

    function agentTier(uint256 agentId) public view returns (uint8) {
        uint64 xp = agentXP.totalAgentXP(agentId); // reverts if resolver paused
        if (!binding.isActive(agentId)) return 0;
        uint8 own = tierFromXP(xp);
        uint8 op = operatorGate.effectiveTier(binding.getBinding(agentId).operator);
        return own < op ? own : op;
    }

    function requireAgentTier(uint256 agentId, uint8 minTier) external view {
        if (!binding.isActive(agentId)) revert InactiveAgent(agentId);
        uint8 current = agentTier(agentId);
        if (current < minTier) revert InsufficientAgentTier(current, minTier);
    }
}
