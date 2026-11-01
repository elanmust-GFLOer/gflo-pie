// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Test-only ERC-1271 contract attestor with hostile response modes.
/// @dev Digest/signature hash are set by fixture controller. No production authorization.
contract GFLOERC1271AdversarialMock {
    bytes4 public constant MAGIC = 0x1626ba7e;
    address public immutable controller;
    bytes32 public approvedDigest;
    bytes32 public approvedSignatureHash;
    uint8 public mode; // 0 valid, 1 wrong magic, 2 short ABI, 3 revert, 4 gas exhaustion

    error NotController();
    error InvalidMode();
    error Refused();

    constructor(address controller_) {
        require(controller_ != address(0), "CONTROLLER_REQUIRED");
        controller = controller_;
    }

    function configure(bytes32 digest, bytes32 signatureHash) external {
        if (msg.sender != controller) revert NotController();
        approvedDigest = digest;
        approvedSignatureHash = signatureHash;
    }

    function setMode(uint8 next) external {
        if (msg.sender != controller) revert NotController();
        if (next > 4) revert InvalidMode();
        mode = next;
    }

    function isValidSignature(bytes32 digest, bytes calldata signature) external view returns (bytes4) {
        if (mode == 1) return 0xffffffff;
        if (mode == 2) {
            // A deliberately truncated 4-byte response violates Solidity ABI encoding.
            assembly { mstore(0, shl(224, 0x1626ba7e)) return(0, 4) }
        }
        if (mode == 3) revert Refused();
        if (mode == 4) {
            // Exercise EVM gas accounting under the caller's constrained gas budget.
            // This is only used in synthetic local transactions, never as a live signer.
            assembly {
                for {} gt(gas(), 100) {} { pop(gas()) }
            }
        }
        if (digest == approvedDigest && keccak256(signature) == approvedSignatureHash)
            return MAGIC;
        return 0xffffffff;
    }
}
