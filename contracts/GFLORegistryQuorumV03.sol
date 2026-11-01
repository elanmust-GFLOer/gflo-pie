// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IGFLORegistryHandoffV03 {
    function acceptGovernance() external;
}

/// @notice EXPERIMENTAL 2-of-3 signer governance with quorum-approved rotation.
/// @dev A signer can be an EOA or smart-account address; this contract does not
///      verify WebAuthn, ERC-1271 signatures or user operations.
///      No recovery is possible if fewer than two valid signers remain.
contract GFLORegistryQuorumV03 {
    address public immutable registry;
    uint8 public constant THRESHOLD = 2;
    uint64 public epoch = 1;
    uint256 public proposalCount;

    address[3] public signers;
    mapping(address => bool) public isSigner;
    mapping(uint256 => mapping(address => bool)) public approvedBy;

    bytes4 private constant PROPOSE_POLICY = bytes4(keccak256("proposePolicy(address,bytes32,address)"));
    bytes4 private constant ACTIVATE_POLICY = bytes4(keccak256("activatePolicy()"));
    bytes4 private constant SET_PAUSED = bytes4(keccak256("setPaused(bool)"));

    // Action 0: registry call, action 1: replace one signer.
    struct Proposal {
        uint64 atEpoch;
        uint8 action;
        uint8 approvals;
        bool executed;
        address oldSigner;
        address newSigner;
        bytes callData;
    }
    mapping(uint256 => Proposal) private proposals;

    error InvalidRegistry();
    error InvalidSigner();
    error DuplicateSigner();
    error NotSigner();
    error InvalidAction();
    error UnknownProposal();
    error AlreadyApproved();
    error AlreadyExecuted();
    error StaleProposal();
    error NotEnoughApprovals();
    error RegistryCallFailed();
    error OnlySelf();

    event Proposed(uint256 indexed id, uint64 indexed epoch, uint8 action);
    event Approved(uint256 indexed id, address indexed signer, uint8 approvals);
    event Executed(uint256 indexed id);
    event SignerReplaced(address indexed oldSigner, address indexed newSigner, uint64 newEpoch);

    modifier onlySigner() {
        if (!isSigner[msg.sender]) revert NotSigner();
        _;
    }

    constructor(address registryAddress, address[3] memory members) {
        if (registryAddress == address(0) || registryAddress.code.length == 0) revert InvalidRegistry();
        registry = registryAddress;
        for (uint256 i; i < 3; ++i) {
            address member = members[i];
            if (member == address(0)) revert InvalidSigner();
            if (isSigner[member]) revert DuplicateSigner();
            signers[i] = member;
            isSigner[member] = true;
        }
    }

    /// @dev Call only after the original registry governance nominates this contract.
    function acceptRegistryGovernance() external onlySigner {
        IGFLORegistryHandoffV03(registry).acceptGovernance();
    }

    /// @dev Explicit ABI length restricts calldata aliasing and unintended trailing bytes.
    function proposeRegistryCall(bytes calldata data) external onlySigner returns (uint256 id) {
        if (data.length < 4) revert InvalidAction();
        bytes4 selector;
        assembly { selector := calldataload(data.offset) }
        if (selector == PROPOSE_POLICY) {
            if (data.length != 100) revert InvalidAction();
        } else if (selector == ACTIVATE_POLICY) {
            if (data.length != 4) revert InvalidAction();
        } else if (selector == SET_PAUSED) {
            if (data.length != 36) revert InvalidAction();
        } else revert InvalidAction();
        id = ++proposalCount;
        Proposal storage p = proposals[id];
        p.atEpoch = epoch;
        p.action = 0;
        p.callData = data;
        p.approvals = 1;
        approvedBy[id][msg.sender] = true;
        emit Proposed(id, epoch, 0);
        emit Approved(id, msg.sender, 1);
    }

    function proposeSignerReplacement(address previousSigner, address replacement)
        external onlySigner returns (uint256 id)
    {
        if (!isSigner[previousSigner]) revert InvalidSigner();
        if (replacement == address(0)) revert InvalidSigner();
        if (isSigner[replacement]) revert DuplicateSigner();
        id = ++proposalCount;
        Proposal storage p = proposals[id];
        p.atEpoch = epoch;
        p.action = 1;
        p.oldSigner = previousSigner;
        p.newSigner = replacement;
        p.approvals = 1;
        approvedBy[id][msg.sender] = true;
        emit Proposed(id, epoch, 1);
        emit Approved(id, msg.sender, 1);
    }

    function approve(uint256 id) external onlySigner {
        Proposal storage p = proposals[id];
        _valid(p);
        if (approvedBy[id][msg.sender]) revert AlreadyApproved();
        approvedBy[id][msg.sender] = true;
        ++p.approvals;
        emit Approved(id, msg.sender, p.approvals);
    }

    function execute(uint256 id) external {
        Proposal storage p = proposals[id];
        _valid(p);
        if (p.approvals < THRESHOLD) revert NotEnoughApprovals();
        p.executed = true;
        if (p.action == 0) {
            (bool ok,) = registry.call(p.callData);
            if (!ok) revert RegistryCallFailed();
        } else {
            _replaceSigner(p.oldSigner, p.newSigner);
        }
        emit Executed(id);
    }

    function _replaceSigner(address oldSigner, address newSigner) private {
        // Revalidate at execution, although stale epochs should already block old proposals.
        if (!isSigner[oldSigner]) revert InvalidSigner();
        if (newSigner == address(0)) revert InvalidSigner();
        if (isSigner[newSigner]) revert DuplicateSigner();
        for (uint256 i; i < 3; ++i) {
            if (signers[i] == oldSigner) { signers[i] = newSigner; break; }
        }
        isSigner[oldSigner] = false;
        isSigner[newSigner] = true;
        ++epoch; // all prior unexecuted proposals become stale
        emit SignerReplaced(oldSigner, newSigner, epoch);
    }

    function _valid(Proposal storage p) private view {
        if (p.atEpoch == 0) revert UnknownProposal();
        if (p.executed) revert AlreadyExecuted();
        if (p.atEpoch != epoch) revert StaleProposal();
    }

    function getProposal(uint256 id) external view returns
        (uint64 atEpoch, uint8 action, uint8 approvals, bool executed, address oldSigner, address newSigner)
    {
        Proposal storage p = proposals[id];
        if (p.atEpoch == 0) revert UnknownProposal();
        return (p.atEpoch, p.action, p.approvals, p.executed, p.oldSigner, p.newSigner);
    }
}
