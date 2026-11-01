// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

interface IPIEV05 {
    struct Identity { bool exists; uint64 xp; uint8 selectedPath; uint8 tier; }
    function getIdentity(address account) external view returns (Identity memory);
}

/// @notice AR01-05A candidate only. Two independent source control groups required.
/// @dev Signatures authenticate assertions, not the underlying real-world event.
contract XPPolicyV05MultiSource is EIP712 {
    uint16 public constant MIN_REWARD = 25;
    uint16 public constant MAX_REWARD = 1000;
    uint16 public constant HIGH_TRUST_FROM = 500;
    uint32 public constant DAILY_CAP = 1500;
    uint32 public constant WEEKLY_CAP = 3000;
    uint64 public constant CHALLENGE_PERIOD = 3 days;

    bytes32 public constant PROOF_TYPEHASH = keccak256("GFLOEvidence(address recipient,bytes32 ruleId,bytes32 eventId,bytes32 evidenceDigest,uint256 nonce,uint64 issuedAt,uint64 validUntil)");
    bytes32 public constant SOURCE_TYPEHASH = keccak256("GFLOSourceApproval(bytes32 sourceId,address recipient,bytes32 ruleId,bytes32 eventId,bytes32 evidenceDigest,uint256 nonce,uint64 issuedAt,uint64 validUntil,uint64 epoch)");

    enum Status { NONE, PENDING, VALID, REVOKED }
    struct Proof {
        address recipient;
        bytes32 ruleId;
        bytes32 eventId;
        bytes32 evidenceDigest;
        uint256 nonce;
        uint64 issuedAt;
        uint64 validUntil;
    }
    struct SourceApproval { bytes32 sourceId; uint64 epoch; bytes signature; }
    struct SourceConfig { address issuer; bytes32 controlGroup; uint64 epoch; bool active; }
    struct Rule { uint16 amount; uint32 maxClaims; bool active; }
    struct Grant {
        address recipient;
        bytes32 ruleId;
        uint16 amount;
        uint64 finalizesAt;
        Status status;
        bytes32[2] sourceIds;
        uint64[2] epochs;
        uint64 reservedDay;
        uint64 reservedWeek;
        bool revokedWhilePending;
        bool quotaReleased;
    }

    IPIEV05 public immutable pie;
    address public immutable owner;
    bool public paused;
    mapping(address => uint8) public verifierRoles;
    mapping(bytes32 => Rule) public rules;
    mapping(bytes32 => mapping(address => bool)) public ruleAttestors;
    mapping(bytes32 => mapping(bytes32 => SourceConfig)) public sources;
    mapping(bytes32 => Grant) private _grants;
    mapping(bytes32 => bool) public usedEvents;
    mapping(bytes32 => bool) public usedEvidence;
    mapping(bytes32 => bool) public usedProofNonces;
    mapping(address => uint64) public validEarnedXP;
    mapping(address => mapping(bytes32 => uint32)) public claimsPerRule;
    mapping(address => mapping(uint256 => uint32)) public dailyXP;
    mapping(address => mapping(uint256 => uint32)) public weeklyXP;

    error Unauthorized();
    error InvalidSetup();
    error InvalidRule();
    error InvalidProof();
    error InvalidQuorum();
    error Replay();
    error LimitReached();
    error InvalidGrant();
    error TooEarly();
    error InvalidRecovery();
    error Paused();

    event SourceConfigured(bytes32 indexed ruleId,bytes32 indexed sourceId,address issuer,bytes32 controlGroup,uint64 epoch,bool active);
    event GrantPending(bytes32 indexed claimId,address indexed recipient,uint16 amount,uint64 finalizesAt);
    event GrantFinalized(bytes32 indexed claimId,address indexed recipient,uint16 amount);
    event GrantRevoked(bytes32 indexed claimId,address indexed recipient,uint16 amount,bytes32 reason);
    event PendingQuotaReleased(bytes32 indexed claimId,address indexed recipient,bytes32 indexed ruleId,uint16 amount);

    modifier onlyOwner() { if(msg.sender!=owner) revert Unauthorized(); _; }
    constructor(address core,address safeOwner) EIP712("GFLO XP Evidence","5") {
        if(core.code.length==0 || safeOwner==address(0)) revert InvalidSetup();
        pie=IPIEV05(core);
        owner=safeOwner;
    }
    function setPaused(bool value) external onlyOwner { paused=value; }
    function setVerifierRole(address verifier,uint8 role) external onlyOwner {
        if(verifier==address(0)||role>2) revert InvalidSetup();
        verifierRoles[verifier]=role;
    }
    function registerRule(bytes32 ruleId,uint16 amount,uint32 maxClaims) external onlyOwner {
        if(ruleId==bytes32(0)||amount<MIN_REWARD||amount>MAX_REWARD||maxClaims==0||rules[ruleId].maxClaims!=0) revert InvalidRule();
        rules[ruleId]=Rule(amount,maxClaims,true);
    }
    function setAttestor(bytes32 ruleId,address attestor,bool allowed) external onlyOwner {
        if(rules[ruleId].maxClaims==0||attestor==address(0)) revert InvalidSetup();
        ruleAttestors[ruleId][attestor]=allowed;
    }
    function configureSource(bytes32 ruleId,bytes32 sourceId,address issuer,bytes32 controlGroup,bool active) external onlyOwner {
        if(rules[ruleId].maxClaims==0||sourceId==bytes32(0)||issuer==address(0)||controlGroup==bytes32(0)) revert InvalidSetup();
        SourceConfig storage cfg=sources[ruleId][sourceId];
        if(cfg.epoch==type(uint64).max) revert InvalidSetup();
        cfg.epoch++;
        cfg.issuer=issuer;
        cfg.controlGroup=controlGroup;
        cfg.active=active;
        emit SourceConfigured(ruleId,sourceId,issuer,controlGroup,cfg.epoch,active);
    }
    function proofDigest(Proof calldata p) public view returns(bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(PROOF_TYPEHASH,p.recipient,p.ruleId,p.eventId,p.evidenceDigest,p.nonce,p.issuedAt,p.validUntil)));
    }
    function sourceDigest(Proof calldata p,bytes32 sourceId,uint64 epoch) public view returns(bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(SOURCE_TYPEHASH,sourceId,p.recipient,p.ruleId,p.eventId,p.evidenceDigest,p.nonce,p.issuedAt,p.validUntil,epoch)));
    }
    function _checkQuorum(Proof calldata p,address attestor,SourceApproval[2] calldata approvals) private view {
        if(approvals[0].sourceId>=approvals[1].sourceId) revert InvalidQuorum();
        SourceConfig memory a=sources[p.ruleId][approvals[0].sourceId];
        SourceConfig memory b=sources[p.ruleId][approvals[1].sourceId];
        if(!a.active||!b.active||a.epoch!=approvals[0].epoch||b.epoch!=approvals[1].epoch||
           a.issuer==address(0)||b.issuer==address(0)||a.issuer==b.issuer||
           a.controlGroup==bytes32(0)||a.controlGroup==b.controlGroup||
           a.issuer==attestor||b.issuer==attestor||a.issuer==msg.sender||b.issuer==msg.sender) revert InvalidQuorum();
        if(!SignatureChecker.isValidSignatureNow(a.issuer,sourceDigest(p,approvals[0].sourceId,a.epoch),approvals[0].signature)||
           !SignatureChecker.isValidSignatureNow(b.issuer,sourceDigest(p,approvals[1].sourceId,b.epoch),approvals[1].signature)) revert InvalidQuorum();
    }
    function _reserve(Proof calldata p,Rule memory rule) private {
        uint256 dayId=block.timestamp/1 days;
        uint256 weekId=block.timestamp/7 days;
        if(claimsPerRule[p.recipient][p.ruleId]>=rule.maxClaims||
           uint256(dailyXP[p.recipient][dayId])+rule.amount>DAILY_CAP||
           uint256(weeklyXP[p.recipient][weekId])+rule.amount>WEEKLY_CAP) revert LimitReached();
        claimsPerRule[p.recipient][p.ruleId]++;
        dailyXP[p.recipient][dayId]+=rule.amount;
        weeklyXP[p.recipient][weekId]+=rule.amount;
    }
    function submit(Proof calldata p,address attestor,bytes calldata attestorSignature,SourceApproval[2] calldata approvals) external returns(bytes32 claimId) {
        if(paused) revert Paused();
        Rule memory rule=rules[p.ruleId];
        if(!rule.active||rule.maxClaims==0) revert InvalidRule();
        if(verifierRoles[msg.sender]<(rule.amount>=HIGH_TRUST_FROM?2:1)||
           attestor==msg.sender||!ruleAttestors[p.ruleId][attestor]) revert Unauthorized();
        if(p.recipient==address(0)||p.eventId==bytes32(0)||p.evidenceDigest==bytes32(0)||
           p.issuedAt>block.timestamp||p.validUntil<block.timestamp||p.validUntil<=p.issuedAt||
           !pie.getIdentity(p.recipient).exists) revert InvalidProof();
        bytes32 digest=proofDigest(p);
        if(!SignatureChecker.isValidSignatureNow(attestor,digest,attestorSignature)) revert InvalidProof();
        _checkQuorum(p,attestor,approvals);
        claimId=keccak256(abi.encode(digest,attestor));
        bytes32 eventKey=keccak256(abi.encode(p.eventId));
        bytes32 evidenceKey=keccak256(abi.encode(p.evidenceDigest));
        bytes32 nonceKey=keccak256(abi.encode(attestor,p.nonce));
        if(_grants[claimId].status!=Status.NONE||usedEvents[eventKey]||usedEvidence[evidenceKey]||usedProofNonces[nonceKey]) revert Replay();
        _reserve(p,rule);
        usedEvents[eventKey]=true;
        usedEvidence[evidenceKey]=true;
        usedProofNonces[nonceKey]=true;
        Grant storage g=_grants[claimId];
        g.recipient=p.recipient; g.ruleId=p.ruleId; g.amount=rule.amount;
        g.finalizesAt=uint64(block.timestamp+CHALLENGE_PERIOD); g.status=Status.PENDING;
        g.reservedDay=uint64(block.timestamp/1 days);
        g.reservedWeek=uint64(block.timestamp/7 days);
        for(uint256 i=0;i<2;i++){g.sourceIds[i]=approvals[i].sourceId;g.epochs[i]=approvals[i].epoch;}
        emit GrantPending(claimId,p.recipient,rule.amount,g.finalizesAt);
    }
    function finalize(bytes32 claimId) external {
        if(paused) revert Paused();
        Grant storage g=_grants[claimId];
        if(g.status!=Status.PENDING) revert InvalidGrant();
        if(block.timestamp<g.finalizesAt) revert TooEarly();
        for(uint256 i=0;i<2;i++){
            SourceConfig memory cfg=sources[g.ruleId][g.sourceIds[i]];
            if(!cfg.active||cfg.epoch!=g.epochs[i]) revert InvalidQuorum();
        }
        SourceConfig memory a=sources[g.ruleId][g.sourceIds[0]];
        SourceConfig memory b=sources[g.ruleId][g.sourceIds[1]];
        if(a.issuer==b.issuer||a.controlGroup==b.controlGroup) revert InvalidQuorum();
        g.status=Status.VALID;
        validEarnedXP[g.recipient]+=g.amount;
        emit GrantFinalized(claimId,g.recipient,g.amount);
    }
    function revoke(bytes32 claimId,bytes32 reason) external onlyOwner {
        Grant storage g=_grants[claimId];
        if(reason==bytes32(0)||(g.status!=Status.PENDING&&g.status!=Status.VALID)) revert InvalidGrant();
        if(g.status==Status.VALID) validEarnedXP[g.recipient]-=g.amount;
        else g.revokedWhilePending=true;
        g.status=Status.REVOKED;
        emit GrantRevoked(claimId,g.recipient,g.amount,reason);
    }
    /// @notice Safe-only one-time release of a reservation revoked while PENDING.
    /// @dev Replay nullifiers are deliberately permanent. The original day/week
    ///      buckets are decremented, never the current block's buckets.
    function releaseRevokedPendingQuota(bytes32 claimId) external onlyOwner {
        Grant storage g=_grants[claimId];
        if(g.status!=Status.REVOKED||!g.revokedWhilePending||g.quotaReleased) revert InvalidRecovery();
        g.quotaReleased=true;
        claimsPerRule[g.recipient][g.ruleId]-=1;
        dailyXP[g.recipient][g.reservedDay]-=g.amount;
        weeklyXP[g.recipient][g.reservedWeek]-=g.amount;
        emit PendingQuotaReleased(claimId,g.recipient,g.ruleId,g.amount);
    }

    /// @notice Canonical XP interface required by TrustedXPSourceRegistryV02.
    /// @dev Genesis identity XP plus finalized and non-revoked policy XP.
    function totalXP(address wallet) external view returns (uint64) {
        IPIEV05.Identity memory identity = pie.getIdentity(wallet);
        if (!identity.exists) return 0;
        return identity.xp + validEarnedXP[wallet];
    }

    function grantStatus(bytes32 claimId) external view returns(Status) { return _grants[claimId].status; }
    function grantSources(bytes32 claimId) external view returns(bytes32[2] memory,uint64[2] memory) {
        Grant storage g=_grants[claimId];
        return (g.sourceIds,g.epochs);
    }
}
