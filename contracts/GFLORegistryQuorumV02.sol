// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @dev Only used during the explicit registry-governance handoff.
interface IGFLORegistryGovernanceV02 {
    function acceptGovernance() external;
}

/// @title GFLORegistryQuorumV02
/// @notice Experimental 2-of-3 on-chain governance for TrustedXPSourceRegistryV02.
/// @dev Approvals use msg.sender, NOT passkey or ERC-1271 signatures.
///      A registered signer can be a future smart account (e.g. passkey wallet),
///      but its internal authentication is outside this contract's trust boundary.
///      Fixed signer set: NO key recovery, signer rotation or timelock in this pilot.
contract GFLORegistryQuorumV02 {
    address public immutable registry;
    uint8 public constant THRESHOLD = 2;

    bytes4 private constant PROPOSE_POLICY =
        bytes4(keccak256("proposePolicy(address,bytes32,address)"));
    bytes4 private constant ACTIVATE_POLICY =
        bytes4(keccak256("activatePolicy()"));
    bytes4 private constant SET_PAUSED =
        bytes4(keccak256("setPaused(bool)"));

    address[3] public signers;
    mapping(address => bool) public isSigner;
    uint256 public proposalCount;

    struct Proposal {
        bytes callData;
        uint8 approvals;
        bool executed;
        bool exists;
    }

    mapping(uint256 => Proposal) private proposals;
    mapping(uint256 => mapping(address => bool)) public approvedBy;

    error InvalidRegistry();
    error InvalidSigner();
    error DuplicateSigner();
    error NotSigner();
    error InvalidAction();
    error UnknownProposal();
    error AlreadyApproved();
    error AlreadyExecuted();
    error NotEnoughApprovals();
    error RegistryCallFailed();

    event Proposed(uint256 indexed proposalId, address indexed proposer, bytes4 selector);
    event Approved(uint256 indexed proposalId, address indexed signer, uint8 approvals);
    event Executed(uint256 indexed proposalId);

    modifier onlySigner() {
        if (!isSigner[msg.sender]) revert NotSigner();
        _;
    }

    constructor(address registryAddress, address[3] memory initialSigners) {
        if (registryAddress == address(0) || registryAddress.code.length == 0)
            revert InvalidRegistry();
        registry = registryAddress;
        for (uint256 i; i < 3; ++i) {
            address signer = initialSigners[i];
            if (signer == address(0)) revert InvalidSigner();
            if (isSigner[signer]) revert DuplicateSigner();
            isSigner[signer] = true;
            signers[i] = signer;
        }
    }

    /// @notice Complete handoff only after registry governance has nominated this contract.
    /// @dev This method does NOT initiate a transfer or change registry settings.
    function acceptRegistryGovernance() external onlySigner {
        IGFLORegistryGovernanceV02(registry).acceptGovernance();
    }

    /// @notice Create a proposal with its initiator's approval already recorded.
    /// @dev Only the three allowlisted registry functions may be invoked.
    function propose(bytes calldata callData) external onlySigner returns (uint256 id) {
        if (callData.length < 4) revert InvalidAction();
        bytes4 selector;
        assembly { selector := calldataload(callData.offset) }
        if (selector != PROPOSE_POLICY &&
            selector != ACTIVATE_POLICY &&
            selector != SET_PAUSED) revert InvalidAction();

        id = ++proposalCount;
        Proposal storage p = proposals[id];
        p.callData = callData;
        p.approvals = 1;
        p.exists = true;
        approvedBy[id][msg.sender] = true;
        emit Proposed(id, msg.sender, selector);
        emit Approved(id, msg.sender, 1);
    }

    function approve(uint256 id) external onlySigner {
        Proposal storage p = proposals[id];
        if (!p.exists) revert UnknownProposal();
        if (p.executed) revert AlreadyExecuted();
        if (approvedBy[id][msg.sender]) revert AlreadyApproved();
        approvedBy[id][msg.sender] = true;
        ++p.approvals;
        emit Approved(id, msg.sender, p.approvals);
    }

    /// @notice Execution is permissionless after the independent threshold is met.
    /// @dev Mark executed before external call; failure reverts both contracts' changes.
    function execute(uint256 id) external {
        Proposal storage p = proposals[id];
        if (!p.exists) revert UnknownProposal();
        if (p.executed) revert AlreadyExecuted();
        if (p.approvals < THRESHOLD) revert NotEnoughApprovals();
        p.executed = true;
        (bool success,) = registry.call(p.callData);
        if (!success) revert RegistryCallFailed();
        emit Executed(id);
    }

    function getProposal(uint256 id) external view
        returns (bytes memory callData, uint8 approvals, bool executed)
    {
        Proposal storage p = proposals[id];
        if (!p.exists) revert UnknownProposal();
        return (p.callData, p.approvals, p.executed);
    }
}
