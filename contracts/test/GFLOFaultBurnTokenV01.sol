// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice TEST-ONLY adversarial token: identical interface, selectable burn faults.
/// @dev Anyone may mint and set modes. NEVER use for GFLO mainnet.
contract GFLOFaultBurnTokenV01 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint256 public totalSupply;
    // 0 exact; 1 revert; 2 return without burning; 3 burn 1 less; 4 callback then exact burn.
    uint8 public mode;
    bool public callbackSucceeded;

    function setMode(uint8 value) external { require(value <= 4); mode = value; }
    function mint(address to, uint256 value) external {
        balanceOf[to] += value; totalSupply += value;
    }
    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value; return true;
    }
    function burnFrom(address from, uint256 value) external {
        if (mode == 1) revert("simulated burn failure");
        if (mode == 2) return;
        uint256 actual = mode == 3 ? value - 1 : value;
        if (mode == 4) {
            // Attempts to reenter the same user's Ignite; inner call should fail.
            (bool ok,) = msg.sender.call(abi.encodeWithSignature("ignite()"));
            callbackSucceeded = ok;
        }
        require(balanceOf[from] >= actual && allowance[from][msg.sender] >= actual, "funds");
        allowance[from][msg.sender] -= actual;
        balanceOf[from] -= actual;
        totalSupply -= actual;
    }
}
