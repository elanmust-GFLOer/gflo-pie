// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title PathRuleRegistryV01
/// @notice Assigns every XP rule to exactly one Path (DESIGN-004):
///           1 = Sovereign  (self-mastery: identity, consistency)          ~ OctoPush Free
///           2 = Reformer   (creative transformation: building with agents) ~ OctoPush Builder
///           3 = Praxis     (orchestration: coordinating agents and others) ~ OctoPush Orchestrator
///         A rule of the member's selected Path earns a bounded bonus. The bonus is applied by
///         the XP resolver inside its caps: it rewards focus, never raises the speed limit.
/// @dev PILOT ONLY, not audited. Assignments are write-once so past grants keep their meaning.
///      Money never enters here: a paid OctoPush plan has no effect on Paths, XP or tiers.
contract PathRuleRegistryV01 {
    uint8 public constant SOVEREIGN = 1;
    uint8 public constant REFORMER = 2;
    uint8 public constant PRAXIS = 3;
    uint16 public constant SELECTED_PATH_BONUS_BPS = 2000; // +20%, the original "Praxis +20%" generalised

    address public immutable governance;
    mapping(bytes32 => uint8) public pathOf;

    error NotGovernance();
    error BadSetup();
    error InvalidPath();
    error AlreadyAssigned();
    error UnassignedRule();

    event RulePathAssigned(bytes32 indexed ruleId, uint8 indexed path);

    constructor(address governance_) {
        if (governance_ == address(0)) revert BadSetup();
        governance = governance_;
    }

    function assignRule(bytes32 ruleId, uint8 path) external {
        if (msg.sender != governance) revert NotGovernance();
        if (ruleId == bytes32(0) || path < SOVEREIGN || path > PRAXIS) revert InvalidPath();
        if (pathOf[ruleId] != 0) revert AlreadyAssigned();
        pathOf[ruleId] = path;
        emit RulePathAssigned(ruleId, path);
    }

    /// @notice Amount a member earns for `ruleId`: the base, plus the bonus when the rule belongs
    ///         to the member's selected Path. Reverts for a rule without a Path (fail closed).
    function effectiveAmount(bytes32 ruleId, uint16 baseAmount, uint8 selectedPath) external view returns (uint16) {
        uint8 path = pathOf[ruleId];
        if (path == 0) revert UnassignedRule();
        if (path != selectedPath) return baseAmount;
        return uint16(uint256(baseAmount) + (uint256(baseAmount) * SELECTED_PATH_BONUS_BPS) / 10_000);
    }
}
