// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Adversarial GFLO token fixture for signed EthereumJS transactions.
/// @dev TEST ONLY; no actual tokenomics, unlimited mint, unrestricted modes.
contract GFLOReceiptAttackTokenV01 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint256 public totalSupply;
    // 0: exact burn, 1: immediate revert, 2: partial burn + event, 3: callback + exact burn
    uint8 public mode;
    bool public lastCallbackSucceeded;
    bytes4 public lastCallbackSelector;

    event TestBurn(address indexed from, uint256 amount);
    event CallbackAttempt(bool accepted, bytes4 revertSelector);

    function setMode(uint8 nextMode) external {
        require(nextMode <= 3, "mode");
        mode = nextMode;
    }

    function mint(address to, uint256 amount) external {
        require(to != address(0), "zero");
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function burnFrom(address from, uint256 amount) external {
        if (mode == 1) revert("forced burn failure");
        uint256 burned = mode == 2 ? amount - 1 : amount;
        if (mode == 3) {
            (bool success, bytes memory response) = msg.sender.call(
                abi.encodeWithSignature("ignite()")
            );
            bytes4 selector;
            if (response.length >= 4) {
                assembly { selector := mload(add(response, 32)) }
            }
            lastCallbackSucceeded = success;
            lastCallbackSelector = selector;
            emit CallbackAttempt(success, selector);
        }
        require(allowance[from][msg.sender] >= burned, "allowance");
        require(balanceOf[from] >= burned, "balance");
        allowance[from][msg.sender] -= burned;
        balanceOf[from] -= burned;
        totalSupply -= burned;
        emit TestBurn(from, burned);
    }
}
