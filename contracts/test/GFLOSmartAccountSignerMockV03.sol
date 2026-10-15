// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Test-only contract-address signer. NOT a passkey or production wallet.
contract GFLOSmartAccountSignerMockV03 {
    address public immutable owner;
    address public immutable quorum;

    error NotOwner();
    error ForwardFailed();
    error UnsupportedCall();

    constructor(address controller, address quorumAddress) {
        require(controller != address(0) && quorumAddress.code.length != 0, "Invalid setup");
        owner = controller;
        quorum = quorumAddress;
    }

    /// @notice Forwards only explicit governance operations to the pinned Quorum.
    function forward(bytes calldata data) external returns (bytes memory result) {
        if (msg.sender != owner) revert NotOwner();
        if (data.length < 4) revert UnsupportedCall();
        bytes4 selector;
        assembly { selector := calldataload(data.offset) }
        if (
            selector != bytes4(keccak256("proposeRegistryCall(bytes)")) &&
            selector != bytes4(keccak256("proposeSignerReplacement(address,address)")) &&
            selector != bytes4(keccak256("approve(uint256)")) &&
            selector != bytes4(keccak256("acceptRegistryGovernance()"))
        ) revert UnsupportedCall();
        (bool success, bytes memory ret) = quorum.call(data);
        if (!success) revert ForwardFailed();
        return ret;
    }
}
