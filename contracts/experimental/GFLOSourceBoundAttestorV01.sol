// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// RT6D.5 EXPERIMENTAL. Do not deploy or bind to XPPolicyV03 before audit.
// ERC-1271 source-bound attestor: the verifier has no generic sign-anything key.
// Source issuer approval is an independent EIP-712 signature over the exact PIE proofDigest.
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/interfaces/IERC1271.sol";

contract GFLOSourceBoundAttestorV01 is EIP712, IERC1271 {
    bytes4 private constant MAGIC = 0x1626ba7e;
    bytes4 private constant INVALID = 0xffffffff;
    bytes32 public constant SOURCE_AUTH_TYPEHASH =
        keccak256("SourceAuthorization(bytes32 proofDigest,bytes32 sourceEventKey,uint64 validUntil)");
    uint64 public constant MAX_AUTH_TTL = 7 days;

    address public governance;
    mapping(address => bool) public sourceIssuers;
    mapping(bytes32 => bool) public consumedEventKeys;
    struct Approval { address issuer; uint64 validUntil; bool revoked; }
    mapping(bytes32 => Approval) public approvals;
    bool public paused;

    error Unauthorized();
    error InvalidAuthorization();
    error AlreadyConsumed();
    error ExpiredAuthorization();

    event SourceApproved(bytes32 indexed proofDigest,bytes32 indexed eventKey,address indexed issuer,uint64 validUntil);
    event ApprovalRevoked(bytes32 indexed proofDigest);
    event IssuerChanged(address indexed issuer,bool allowed);
    event PauseChanged(bool paused);

    constructor(address initialGovernance) EIP712("GFLO Source Authorization","1") {
        if(initialGovernance == address(0)) revert InvalidAuthorization();
        governance = initialGovernance;
    }
    modifier onlyGovernance() { if(msg.sender != governance) revert Unauthorized(); _; }
    function setIssuer(address issuer,bool enabled) external onlyGovernance {
        if(issuer == address(0)) revert InvalidAuthorization();
        sourceIssuers[issuer]=enabled;
        emit IssuerChanged(issuer,enabled);
    }
    function setPaused(bool value) external onlyGovernance {
        paused=value;
        emit PauseChanged(value);
    }
    function revoke(bytes32 digest) external onlyGovernance {
        approvals[digest].revoked=true;
        emit ApprovalRevoked(digest);
    }
    // Anyone may relay a SOURCE issuer's approval, but cannot forge its ECDSA signature.
    function registerApproval(
        bytes32 proofDigest,bytes32 sourceEventKey,uint64 validUntil,
        address issuer,bytes calldata sourceSignature
    ) external {
        if(paused || proofDigest==bytes32(0) || sourceEventKey==bytes32(0) || !sourceIssuers[issuer])
            revert InvalidAuthorization();
        if(validUntil<=block.timestamp || uint256(validUntil)>block.timestamp+MAX_AUTH_TTL)
            revert ExpiredAuthorization();
        if(consumedEventKeys[sourceEventKey] || approvals[proofDigest].issuer != address(0))
            revert AlreadyConsumed();
        bytes32 authDigest = _hashTypedDataV4(keccak256(abi.encode(
            SOURCE_AUTH_TYPEHASH,proofDigest,sourceEventKey,validUntil
        )));
        if(ECDSA.recover(authDigest,sourceSignature)!=issuer) revert InvalidAuthorization();
        consumedEventKeys[sourceEventKey]=true;
        approvals[proofDigest]=Approval(issuer,validUntil,false);
        emit SourceApproved(proofDigest,sourceEventKey,issuer,validUntil);
    }
    // XPPolicyV03 calls SignatureChecker.isValidSignatureNow(this, proofDigest, signature).
    // The bytes argument is intentionally NOT an arbitrary authentication channel.
    function isValidSignature(bytes32 proofDigest,bytes memory signature)
        external view override returns(bytes4)
    {
        Approval memory a=approvals[proofDigest];
        return (!paused && signature.length==0 && a.issuer!=address(0)
            && sourceIssuers[a.issuer] && !a.revoked && a.validUntil>block.timestamp)
            ? MAGIC : INVALID;
    }
}
