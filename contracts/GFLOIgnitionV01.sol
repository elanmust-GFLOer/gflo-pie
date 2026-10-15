// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IPIEIgnitionCore {
    enum Path { None, Sovereign, Reformer, Praxis }
    struct Identity { bool exists; uint64 xp; Path selectedPath; uint8 tier; }
    function getIdentity(address user) external view returns (Identity memory);
    function upgradeTier(address user, uint8 targetTier) external;
}
interface ICanonicalXPForIgnition {
    function pieCore() external view returns (address);
    function totalXP(address user) external view returns (uint64);
}
interface IExactBurnGFLO {
    function balanceOf(address user) external view returns (uint256);
    function totalSupply() external view returns (uint256);
    function burnFrom(address user, uint256 amount) external;
}

/// @notice Experimental atomic ignition using canonical Registry XP.
/// @dev Fees are deployment parameters, not validated GFLO tokenomics.
///      Supported token MUST implement burnFrom and honest balance/supply reporting.
contract GFLOIgnitionV01 {
    IPIEIgnitionCore public immutable pie;
    ICanonicalXPForIgnition public immutable canonicalXP;
    IExactBurnGFLO public immutable gflo;
    uint256 public immutable reformerBurn;
    uint256 public immutable praxisBurn;
    uint64 public constant REFORMER_XP = 1000;
    uint64 public constant PRAXIS_XP = 5000;
    bool private entered;

    error InvalidSetup();
    error Busy();
    error MissingIdentity();
    error MaximumTier();
    error GoalNotSelected();
    error InsufficientXP();
    error BurnNotExact();

    event Ignited(address indexed account, uint8 indexed tier, uint64 xp, uint256 burned);

    constructor(address core, address registry, address token, uint256 tier1Burn, uint256 tier2Burn) {
        if (core.code.length == 0 || registry.code.length == 0 || token.code.length == 0 ||
            tier1Burn == 0 || tier2Burn == 0) revert InvalidSetup();
        if (ICanonicalXPForIgnition(registry).pieCore() != core) revert InvalidSetup();
        pie = IPIEIgnitionCore(core);
        canonicalXP = ICanonicalXPForIgnition(registry);
        gflo = IExactBurnGFLO(token);
        reformerBurn = tier1Burn;
        praxisBurn = tier2Burn;
    }

    function ignite() external {
        if (entered) revert Busy();
        entered = true;
        IPIEIgnitionCore.Identity memory identity = pie.getIdentity(msg.sender);
        if (!identity.exists) revert MissingIdentity();
        if (identity.tier >= 2) revert MaximumTier();
        uint8 next = identity.tier + 1;
        if (uint8(identity.selectedPath) < next + 1) revert GoalNotSelected();
        uint64 xp = canonicalXP.totalXP(msg.sender);
        if (xp < (next == 1 ? REFORMER_XP : PRAXIS_XP)) revert InsufficientXP();
        uint256 amount = next == 1 ? reformerBurn : praxisBurn;
        uint256 priorUser = gflo.balanceOf(msg.sender);
        uint256 priorSupply = gflo.totalSupply();
        gflo.burnFrom(msg.sender, amount);
        if (priorUser < amount || priorSupply < amount ||
            gflo.balanceOf(msg.sender) != priorUser - amount ||
            gflo.totalSupply() != priorSupply - amount) revert BurnNotExact();
        pie.upgradeTier(msg.sender, next);
        emit Ignited(msg.sender, next, xp, amount);
        entered = false;
    }
}
