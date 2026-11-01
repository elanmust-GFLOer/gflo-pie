// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

/// @title GFLOFixedSupplyV01
/// @notice A–B–A pilot token: one-time constructor supply and standard burnFrom.
/// @dev No post-deployment mint, blacklist, tax, administrator, permit or upgrade logic.
///      Initial supply is denominated in BASE UNITS (18 decimals); this pilot
///      does not decide how many tokens to issue or where to allocate them.
contract GFLOFixedSupplyV01 is ERC20Burnable {
    error InvalidInitialAllocation();

    constructor(address initialRecipient, uint256 initialSupplyBaseUnits)
        ERC20("GFLO", "GFLO")
    {
        if (initialRecipient == address(0) || initialSupplyBaseUnits == 0) {
            revert InvalidInitialAllocation();
        }
        _mint(initialRecipient, initialSupplyBaseUnits);
    }
}
