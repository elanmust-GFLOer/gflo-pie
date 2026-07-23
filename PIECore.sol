// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title PIECore - Path Identity Engine
 * @notice Core identity, XP, and tier management system
 * @dev Compatible with GFLOIgnition and GasFeeLoop
 */

interface IGFLO {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function burnFrom(address account, uint256 amount) external;
    function burn(uint256 amount) external;
    function balanceOf(address account) external view returns (uint256);
}

contract PIECore {
    enum Path { None, Sovereign, Reformer, Praxis }

    struct Identity {
        uint256 xp;
        Path path;
        uint8 tier;
    }

    mapping(address => Identity) public identities;
    IGFLO public gfloToken;
    address public owner;
    mapping(address => bool) public authorizedCallers;

    // XP követelmények
    uint256 public constant SOVEREIGN_XP_REQUIREMENT = 0;
    uint256 public constant REFORMER_XP_REQUIREMENT = 1000;
    uint256 public constant PRAXIS_XP_REQUIREMENT = 5000;

    // Token égetési mennyiségek
    uint256 public constant REFORMER_BURN_AMOUNT = 5000 * 10**18;   // 5,000 GFLO
    uint256 public constant PRAXIS_BURN_AMOUNT = 10000 * 10**18;    // 10,000 GFLO

    // Ignittion cost felülírások (GFLOIgnition-hoz)
    mapping(uint8 => uint256) public ignitionCost;

    event PathChosen(address indexed user, Path path);
    event XPGained(address indexed user, uint256 amount);
    event TierUpgraded(address indexed user, uint8 newTier);
    event CommitmentBurned(address indexed user, uint256 amount);
    event IgnitionCostSet(uint8 tier, uint256 cost);

    constructor(address _gfloAddress) {
        gfloToken = IGFLO(_gfloAddress);
        owner = msg.sender;

        // Alapértelmezett ignition költségek
        ignitionCost[0] = 100 * 10**18;     // Sovereign -> Reformer: 100 GFLO
        ignitionCost[1] = 500 * 10**18;     // Reformer -> Praxis: 500 GFLO
        ignitionCost[2] = 2000 * 10**18;    // Praxis -> Advanced: 2000 GFLO
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyAuthorized() {
        require(authorizedCallers[msg.sender] || msg.sender == owner, "Not authorized");
        _;
    }

    // ============================================
    // ADMIN FUNCTIONS
    // ============================================

    function setAuthorizedCaller(address caller, bool status) external onlyOwner {
        authorizedCallers[caller] = status;
    }

    function setIgnitionCost(uint8 tier, uint256 cost) external onlyOwner {
        ignitionCost[tier] = cost;
        emit IgnitionCostSet(tier, cost);
    }

    // ============================================
    // IDENTITY MANAGEMENT
    // ============================================

    /**
     * @notice Choose initial path (Sovereign by default)
     */
    function choosePath(Path _path) external {
        require(_path != Path.None, "Invalid path");
        require(identities[msg.sender].path == Path.None, "Already chosen");

        identities[msg.sender].path = _path;
        identities[msg.sender].tier = 0;
        identities[msg.sender].xp = 0;

        emit PathChosen(msg.sender, _path);
    }

    // ============================================
    // XP MANAGEMENT
    // ============================================

    /**
     * @notice Add XP to user (called by authorized backends/contracts)
     */
    function addXP(address user, uint256 amount) external onlyAuthorized {
        require(identities[user].path != Path.None, "User has no path");
        identities[user].xp += amount;
        emit XPGained(user, amount);
    }

    /**
     * @notice Check if user is eligible for upgrade
     */
    function isEligibleForUpgrade(address user) external view returns (bool) {
        Identity memory id = identities[user];
        if (id.path == Path.Sovereign) {
            return id.xp >= REFORMER_XP_REQUIREMENT;
        } else if (id.path == Path.Reformer) {
            return id.xp >= PRAXIS_XP_REQUIREMENT;
        }
        return false;
    }

    /**
     * @notice Get next XP threshold for user
     */
    function getNextThreshold(address user) external view returns (uint256) {
        Identity memory id = identities[user];
        if (id.path == Path.Sovereign) {
            return REFORMER_XP_REQUIREMENT;
        } else if (id.path == Path.Reformer) {
            return PRAXIS_XP_REQUIREMENT;
        }
        return 0;
    }

    // ============================================
    // TIER UPGRADES (Direct method)
    // ============================================

    /**
     * @notice Upgrade from Sovereign to Reformer (user initiates)
     */
    function upgradeToReformer() external {
        Identity storage user = identities[msg.sender];
        require(user.path == Path.Sovereign, "Must be Sovereign first");
        require(user.xp >= REFORMER_XP_REQUIREMENT, "Insufficient XP");

        // Transfer and burn GFLO
        require(
            gfloToken.transferFrom(msg.sender, address(this), REFORMER_BURN_AMOUNT),
            "Transfer failed"
        );
        gfloToken.burn(REFORMER_BURN_AMOUNT);

        user.path = Path.Reformer;
        user.tier = 1;

        emit CommitmentBurned(msg.sender, REFORMER_BURN_AMOUNT);
        emit TierUpgraded(msg.sender, 1);
        emit PathChosen(msg.sender, Path.Reformer);
    }

    /**
     * @notice Upgrade from Reformer to Praxis (user initiates)
     */
    function upgradeToPraxis() external {
        Identity storage user = identities[msg.sender];
        require(user.path == Path.Reformer, "Must be Reformer first");
        require(user.xp >= PRAXIS_XP_REQUIREMENT, "Insufficient XP");

        // Transfer and burn GFLO
        require(
            gfloToken.transferFrom(msg.sender, address(this), PRAXIS_BURN_AMOUNT),
            "Transfer failed"
        );
        gfloToken.burn(PRAXIS_BURN_AMOUNT);

        user.path = Path.Praxis;
        user.tier = 2;

        emit CommitmentBurned(msg.sender, PRAXIS_BURN_AMOUNT);
        emit TierUpgraded(msg.sender, 2);
        emit PathChosen(msg.sender, Path.Praxis);
    }

    // ============================================
    // AUTHORIZED TIER UPGRADE (GFLOIgnition)
    // ============================================

    /**
     * @notice Upgrade tier (called by authorized GFLOIgnition contract)
     */
    function upgradeTier(address user) external onlyAuthorized {
        Identity storage id = identities[user];
        require(id.path != Path.None, "User has no path");

        if (id.path == Path.Sovereign) {
            require(id.xp >= REFORMER_XP_REQUIREMENT, "Insufficient XP for Reformer");
            id.path = Path.Reformer;
            id.tier = 1;
            emit TierUpgraded(user, 1);
            emit PathChosen(user, Path.Reformer);
        } else if (id.path == Path.Reformer) {
            require(id.xp >= PRAXIS_XP_REQUIREMENT, "Insufficient XP for Praxis");
            id.path = Path.Praxis;
            id.tier = 2;
            emit TierUpgraded(user, 2);
            emit PathChosen(user, Path.Praxis);
        } else {
            revert("Already at max tier");
        }
    }

    // ============================================
    // VIEW FUNCTIONS
    // ============================================

    /**
     * @notice Get full identity (compatible with GFLOIgnition)
     */
    function getIdentity(address user) external view returns (
        uint256 xp,
        uint8 path,
        uint8 tier,
        uint256 nextThreshold
    ) {
        Identity memory id = identities[user];
        uint8 pathUint = uint8(id.path);
        uint256 threshold = 0;

        if (id.path == Path.Sovereign) {
            threshold = REFORMER_XP_REQUIREMENT;
        } else if (id.path == Path.Reformer) {
            threshold = PRAXIS_XP_REQUIREMENT;
        }

        return (id.xp, pathUint, id.tier, threshold);
    }

    /**
     * @notice Get only XP
     */
    function getXP(address user) external view returns (uint256) {
        return identities[user].xp;
    }

    /**
     * @notice Get only tier
     */
    function getTier(address user) external view returns (uint8) {
        return identities[user].tier;
    }

    /**
     * @notice Get only path
     */
    function getPath(address user) external view returns (Path) {
        return identities[user].path;
    }
}
