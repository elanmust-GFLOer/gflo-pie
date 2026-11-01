// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Simplified ERC-20-like TEST TOKEN, not a production GFLO implementation.
contract GFLOTestBurnTokenV01 {
    string public constant name = "GFLO TEST ONLY";
    string public constant symbol = "tGFLO";
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    error InsufficientBalance();
    error InsufficientAllowance();

    function mint(address to, uint256 amount) external {
        require(to != address(0), "Zero recipient");
        balanceOf[to] += amount;
        totalSupply += amount;
    }
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
    function burnFrom(address from, uint256 amount) external {
        if (allowance[from][msg.sender] < amount) revert InsufficientAllowance();
        if (balanceOf[from] < amount) revert InsufficientBalance();
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        totalSupply -= amount;
    }
}
