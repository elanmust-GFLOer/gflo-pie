// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Interfész a GFLO tokenhez való kapcsolódáshoz
interface IGFLO {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
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

    // Küszöbértékek
    uint256 public constant SOVEREIGN_TIER1_XP = 1000;
    uint256 public constant REFORMER_BURN_AMOUNT = 5000 * 10**18; // 5000 GFLO

    event PathChosen(address indexed user, Path path);
    event XPGained(address indexed user, uint256 amount);
    event TierUpgraded(address indexed user, uint8 newTier);
    event CommitmentBurned(address indexed user, uint256 amount);

    constructor(address _gfloAddress) {
        gfloToken = IGFLO(_gfloAddress);
    }

    function choosePath(Path _path) external {
        require(_path != Path.None, "Invalid path");
        require(identities[msg.sender].path == Path.None, "Already chosen");

        identities[msg.sender].path = _path;
        identities[msg.sender].tier = 0;

        emit PathChosen(msg.sender, _path);
    }

    function gainXP(uint256 amount) external {
        require(identities[msg.sender].path != Path.None, "Choose path first");
        identities[msg.sender].xp += amount;
        emit XPGained(msg.sender, amount);
    }

    // ÚJ: Szintugrás token égetéssel (Sovereign -> Reformer)
    function upgradeToReformer() external {
        Identity storage user = identities[msg.sender];
        require(user.path == Path.Sovereign, "Must be Sovereign first");
        require(user.xp >= SOVEREIGN_TIER1_XP, "Insufficient XP");

        // Token égetési folyamat:
        // 1. A felhasználónak előbb 'Approve'-ot kell adnia a PIECore-nak a GFLO tárcájában!
        require(gfloToken.transferFrom(msg.sender, address(this), REFORMER_BURN_AMOUNT), "Transfer failed");
        gfloToken.burn(REFORMER_BURN_AMOUNT);

        user.path = Path.Reformer;
        user.tier = 1;

        emit CommitmentBurned(msg.sender, REFORMER_BURN_AMOUNT);
        emit PathChosen(msg.sender, Path.Reformer);
    }

    // ÚJ: Szintlépés Reformer -> Praxis (Égetéssel)
    function upgradeToPraxis() external {
        Identity storage user = identities[msg.sender];
        require(user.path == Path.Reformer, "Must be Reformer first");
        require(user.xp >= 5000, "Insufficient XP for Praxis");

        uint256 PRAXIS_BURN = 10000 * 10**18; // 10,000 GFLO áldozat
        require(gfloToken.transferFrom(msg.sender, address(this), PRAXIS_BURN), "Transfer failed");
        gfloToken.burn(PRAXIS_BURN);

        user.path = Path.Praxis;
        user.tier = 2;

        emit CommitmentBurned(msg.sender, PRAXIS_BURN);
        emit PathChosen(msg.sender, Path.Praxis);
    }
}
