// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";

interface IERC8004ReputationForPublisher {
    function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string calldata tag1,
        string calldata tag2, string calldata endpoint, string calldata feedbackURI, bytes32 feedbackHash) external;
    function revokeFeedback(uint256 agentId, uint64 feedbackIndex) external;
    function getLastIndex(uint256 agentId, address clientAddress) external view returns (uint64);
    function getIdentityRegistry() external view returns (address);
}

interface IAgentXPForPublisher {
    function binding() external view returns (address);
    function grants(bytes32 uid) external view returns (uint256 agentId, uint32 epoch, address operator,
        address attester, bytes32 ruleId, uint16 amount, uint64 finalizesAt, uint8 status);
}

/// @dev Same layout as the 8 return values of AgentXPResolverV01.grants(uid).
struct GrantView {
    uint256 agentId; uint32 epoch; address operator; address attester;
    bytes32 ruleId; uint16 amount; uint64 finalizesAt; uint8 status;
}

interface IAgentBindingForPublisher {
    struct Binding { address operator; address agentWallet; uint64 boundAt; uint32 epoch; bool suspended; }
    function identity() external view returns (address);
    function isActive(uint256 agentId) external view returns (bool);
    function getBinding(uint256 agentId) external view returns (Binding memory);
}

/// @title GFLOReputationPublisherV01
/// @notice Mirrors GFLO-verified agent work into the ERC-8004 Reputation Registry as ONE fixed
///         client address. A consumer that trusts GFLO reads:
///           getSummary(agentId, [publisher], "gflo.verified", publisher.currentEpochTag(agentId))
///         `count` = live, verified tasks of the agent's CURRENT binding epoch.
/// @dev PILOT ONLY, not audited. DESIGN-003 §7.
///      - Feedback is keyed to the ERC-8004 agentId, which survives transfers. Every entry is
///        tagged with its GFLO epoch, so a new owner never inherits the old owner's record, and
///        entries of an ended epoch can be revoked by anyone.
///      - Permissionless and state-mirroring: publish/unpublish only copy what the resolver and
///        binding registry prove. A failing or upgraded ERC-8004 registry can block mirroring,
///        never GFLO XP or tiers.
///      - An entry is live exactly while its grant is "eligible": VALID, agent active, same epoch.
///        If eligibility returns (e.g. a lifted suspension), it can be published again.
contract GFLOReputationPublisherV01 {
    string public constant TAG1 = "gflo.verified";
    int128 public constant VERIFIED_VALUE = 100; // 1 entry = 1 verified task; average stays meaningful
    uint8 private constant STATUS_VALID = 2;    // AgentXPResolverV01.Status.VALID

    IERC8004ReputationForPublisher public immutable reputation;
    IAgentXPForPublisher public immutable agentXP;
    IAgentBindingForPublisher public immutable binding;
    address public owner;
    bool public paused;                          // blocks publish only; unpublish always works
    bool private _entered;

    /// @notice EAS UID => live ERC-8004 feedback index (0 = not live).
    mapping(bytes32 => uint64) public feedbackIndex;

    error NotOwner();
    error BadSetup();
    error Paused();
    error Reentrancy();
    error NotEligible();
    error AlreadyLive();
    error NotLive();
    error StillEligible();

    event Published(bytes32 indexed uid, uint256 indexed agentId, uint32 epoch, uint64 feedbackIndex);
    event Unpublished(bytes32 indexed uid, uint256 indexed agentId, uint64 feedbackIndex);
    event PausedChanged(bool state);

    modifier onlyOwner() { if (msg.sender != owner) revert NotOwner(); _; }
    modifier nonReentrant() { if (_entered) revert Reentrancy(); _entered = true; _; _entered = false; }

    constructor(address reputation_, address agentXP_, address governance) {
        if (reputation_.code.length == 0 || agentXP_.code.length == 0 || governance == address(0)) revert BadSetup();
        address binding_ = IAgentXPForPublisher(agentXP_).binding();
        if (IERC8004ReputationForPublisher(reputation_).getIdentityRegistry() !=
            IAgentBindingForPublisher(binding_).identity()) revert BadSetup();
        reputation = IERC8004ReputationForPublisher(reputation_);
        agentXP = IAgentXPForPublisher(agentXP_);
        binding = IAgentBindingForPublisher(binding_);
        owner = governance;
    }

    function setPaused(bool state) external onlyOwner { paused = state; emit PausedChanged(state); }

    // ── Mirroring (permissionless) ─────────────────────────────

    function publish(bytes32 uid) external nonReentrant {
        if (paused) revert Paused();
        if (feedbackIndex[uid] != 0) revert AlreadyLive();
        (uint256 agentId, uint32 epoch, bool ok) = _eligibility(uid);
        if (!ok) revert NotEligible();
        reputation.giveFeedback(agentId, VERIFIED_VALUE, 0, TAG1, epochTag(epoch), "", feedbackURI(uid), uid);
        uint64 index = reputation.getLastIndex(agentId, address(this));
        if (index == 0) revert BadSetup();
        feedbackIndex[uid] = index;
        emit Published(uid, agentId, epoch, index);
    }

    /// @notice Anyone may retract a live entry once its grant is no longer eligible
    ///         (revoked, agent inactive, or its epoch ended).
    function unpublish(bytes32 uid) external nonReentrant {
        uint64 index = feedbackIndex[uid];
        if (index == 0) revert NotLive();
        (uint256 agentId, , bool ok) = _eligibility(uid);
        if (ok) revert StillEligible();
        feedbackIndex[uid] = 0;
        reputation.revokeFeedback(agentId, index);
        emit Unpublished(uid, agentId, index);
    }

    // ── Reads ──────────────────────────────────────────────────

    function canPublish(bytes32 uid) external view returns (bool) {
        if (paused || feedbackIndex[uid] != 0) return false;
        (, , bool ok) = _eligibility(uid);
        return ok;
    }

    function canUnpublish(bytes32 uid) external view returns (bool) {
        if (feedbackIndex[uid] == 0) return false;
        (, , bool ok) = _eligibility(uid);
        return !ok;
    }

    /// @notice tag2 to pass to ERC-8004 getSummary for the agent's current binding epoch.
    ///         For an unbound agent it returns the epoch-0 tag, which matches no entry.
    function currentEpochTag(uint256 agentId) external view returns (string memory) {
        return epochTag(binding.getBinding(agentId).epoch);
    }

    function epochTag(uint32 epoch) public pure returns (string memory) {
        return string.concat("gflo-epoch:", Strings.toString(epoch));
    }

    function feedbackURI(bytes32 uid) public view returns (string memory) {
        return string.concat("eas:", Strings.toString(block.chainid), ":", Strings.toHexString(uint256(uid), 32));
    }

    /// @dev Eligible = VALID grant, agent currently active, and the grant belongs to the current epoch.
    ///      Any failing read makes the grant ineligible (fail-closed for publish, open for unpublish).
    function _eligibility(bytes32 uid) private view returns (uint256 agentId, uint32 epoch, bool ok) {
        (bool success, bytes memory data) =
            address(agentXP).staticcall(abi.encodeCall(IAgentXPForPublisher.grants, (uid)));
        if (!success || data.length != 256) return (0, 0, false);
        GrantView memory g = abi.decode(data, (GrantView));
        (agentId, epoch) = (g.agentId, g.epoch);
        if (g.status != STATUS_VALID) return (agentId, epoch, false);
        try binding.isActive(agentId) returns (bool active) {
            if (!active) return (agentId, epoch, false);
        } catch { return (agentId, epoch, false); }
        try binding.getBinding(agentId) returns (IAgentBindingForPublisher.Binding memory b) {
            ok = b.epoch == epoch;
        } catch { ok = false; }
    }
}
