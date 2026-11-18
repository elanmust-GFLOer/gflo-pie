// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC8004IdentityForBinding {
    function ownerOf(uint256 agentId) external view returns (address);
    function getAgentWallet(uint256 agentId) external view returns (address);
}

interface IPIEForBinding {
    struct Identity { bool exists; uint64 xp; uint8 selectedPath; uint8 tier; }
    function getIdentity(address account) external view returns (Identity memory);
}

interface IOperatorTierGate {
    function effectiveTier(address wallet) external view returns (uint8);
}

/// @title AgentBindingRegistryV01
/// @notice Binds an ERC-8004 agent to the accountable human operator who owns it.
///         An agent's trust is capped by its operator, earned only by verified work,
///         and reset (new epoch) whenever the agent NFT or its wallet changes.
/// @dev PILOT ONLY, not audited. ERC-8004 registries are third-party and upgradeable:
///      every read is wrapped and any failure makes the agent INACTIVE (fail-closed).
///      See docs/DESIGN-003-operator-binding-and-erc8004.md.
contract AgentBindingRegistryV01 {
    uint64 public constant STRIKE_WINDOW = 90 days;
    uint8 public constant STRIKE_LIMIT = 3;

    struct Binding {
        address operator;
        address agentWallet;
        uint64 boundAt;
        uint32 epoch;
        bool suspended;        // mirrors agentSuspended[agentId] in reads; not the source of truth
    }

    IERC8004IdentityForBinding public immutable identity;
    IPIEForBinding public immutable pie;
    IOperatorTierGate public immutable operatorGate;
    address public owner;
    address public xpResolver; // set once; the only caller allowed to record strikes

    mapping(uint256 => Binding) private _bindings;         // agentId => binding (operator == 0: none)
    mapping(uint256 => uint32) public currentEpoch;         // survives unbind; never decreases
    mapping(address => uint256) private _walletAgentPlusOne; // agentWallet => agentId + 1 (agentId 0 is valid)
    mapping(address => uint16) public boundAgentCount;      // bindings held, stale ones included until unbound
    mapping(address => uint64[3]) private _strikeTimes;     // ring buffer of the last STRIKE_LIMIT strikes
    mapping(address => uint8) private _strikeCursor;
    /// @notice Governance suspension, keyed by agentId and independent of the removable binding,
    ///         so unbind + bind can never clear it. Only governance lifts it.
    mapping(uint256 => bool) public agentSuspended;

    error NotOwner();
    error BadSetup();
    error ResolverAlreadySet();
    error NotResolver();
    error NotAgentOwner();
    error NoOperatorIdentity();
    error OperatorSuspended();
    error AgentIsSuspended();
    error InvalidAgentWallet();
    error WalletAlreadyBound();
    error AlreadyBound();
    error NotBound();
    error SlotLimitReached(uint8 tier, uint16 limit);
    error NotAuthorizedToUnbind();
    error EmptyReason();

    event ResolverSet(address indexed resolver);
    event AgentBound(uint256 indexed agentId, address indexed operator, address indexed agentWallet, uint32 epoch);
    event AgentUnbound(uint256 indexed agentId, address indexed operator, address indexed caller, uint32 epoch);
    event AgentSuspended(uint256 indexed agentId, bool suspended, bytes32 reason);
    event StrikeRecorded(address indexed operator, uint64 at, uint8 liveStrikes);

    modifier onlyOwner() { if (msg.sender != owner) revert NotOwner(); _; }

    constructor(address identity_, address pie_, address operatorGate_, address governance) {
        if (identity_.code.length == 0 || pie_.code.length == 0 || operatorGate_.code.length == 0 ||
            governance == address(0)) revert BadSetup();
        identity = IERC8004IdentityForBinding(identity_);
        pie = IPIEForBinding(pie_);
        operatorGate = IOperatorTierGate(operatorGate_);
        owner = governance;
    }

    function setXPResolver(address resolver) external onlyOwner {
        if (xpResolver != address(0)) revert ResolverAlreadySet();
        if (resolver.code.length == 0) revert BadSetup();
        xpResolver = resolver;
        emit ResolverSet(resolver);
    }

    // ── Binding lifecycle ──────────────────────────────────────

    /// @notice Agent slots come from the operator's verified effective tier, never from money.
    function slotLimit(uint8 tier) public pure returns (uint16) {
        return tier >= 2 ? 10 : tier == 1 ? 3 : 1;
    }

    /// @dev Only the ERC-721 owner itself may bind: ERC-8004 approvals and operators are
    ///      not accountable parties. The agent wallet must be a separate, ERC-8004-verified
    ///      wallet (ERC-8004 sets it to the owner on register(); the owner must change it).
    function bind(uint256 agentId) external {
        address operator = msg.sender;
        if (_bindings[agentId].operator != address(0)) revert AlreadyBound();
        if (identity.ownerOf(agentId) != operator) revert NotAgentOwner();
        if (!pie.getIdentity(operator).exists) revert NoOperatorIdentity();
        if (isOperatorStruckOut(operator)) revert OperatorSuspended();
        if (agentSuspended[agentId]) revert AgentIsSuspended();

        address wallet = identity.getAgentWallet(agentId);
        if (wallet == address(0) || wallet == operator) revert InvalidAgentWallet();
        if (_walletAgentPlusOne[wallet] != 0) revert WalletAlreadyBound();
        if (pie.getIdentity(wallet).exists) revert InvalidAgentWallet(); // a human is never an agent

        uint8 tier = operatorGate.effectiveTier(operator); // reverts (fail-closed) if gate is paused
        uint16 limit = slotLimit(tier);
        if (boundAgentCount[operator] >= limit) revert SlotLimitReached(tier, limit);

        uint32 epoch = ++currentEpoch[agentId];
        _bindings[agentId] = Binding(operator, wallet, uint64(block.timestamp), epoch, false);
        _walletAgentPlusOne[wallet] = agentId + 1;
        boundAgentCount[operator] += 1;
        emit AgentBound(agentId, operator, wallet, epoch);
    }

    /// @notice The operator may always unbind. Anyone may clear a binding that is no longer
    ///         backed by ERC-8004 (NFT moved or wallet changed), freeing the old slot.
    function unbind(uint256 agentId) external {
        Binding memory b = _bindings[agentId];
        if (b.operator == address(0)) revert NotBound();
        if (msg.sender != b.operator && _backedByIdentity(agentId, b)) revert NotAuthorizedToUnbind();
        delete _bindings[agentId];
        delete _walletAgentPlusOne[b.agentWallet];
        boundAgentCount[b.operator] -= 1;
        emit AgentUnbound(agentId, b.operator, msg.sender, b.epoch);
    }

    function setSuspended(uint256 agentId, bool suspended, bytes32 reason) external onlyOwner {
        if (reason == bytes32(0)) revert EmptyReason();
        agentSuspended[agentId] = suspended; // allowed for unbound agents too (pre-emptive)
        emit AgentSuspended(agentId, suspended, reason);
    }

    // ── Operator accountability ────────────────────────────────

    /// @dev Called by the agent XP resolver when governance revokes an agent grant for fraud.
    function recordStrike(address operator) external {
        if (msg.sender != xpResolver) revert NotResolver();
        uint8 cursor = _strikeCursor[operator];
        _strikeTimes[operator][cursor] = uint64(block.timestamp);
        _strikeCursor[operator] = uint8((cursor + 1) % STRIKE_LIMIT);
        emit StrikeRecorded(operator, uint64(block.timestamp), liveStrikes(operator));
    }

    function liveStrikes(address operator) public view returns (uint8 count) {
        uint64[3] memory times = _strikeTimes[operator];
        for (uint256 i; i < STRIKE_LIMIT; i++) {
            if (times[i] != 0 && block.timestamp < uint256(times[i]) + STRIKE_WINDOW) count++;
        }
    }

    function isOperatorStruckOut(address operator) public view returns (bool) {
        return liveStrikes(operator) >= STRIKE_LIMIT;
    }

    // ── Reads (fail-closed) ────────────────────────────────────

    function getBinding(uint256 agentId) external view returns (Binding memory b) {
        b = _bindings[agentId];
        b.suspended = agentSuspended[agentId];
    }

    /// @notice True only if the binding exists, is not suspended, the operator is not struck
    ///         out, and ERC-8004 still reports the same owner and the same agent wallet.
    function isActive(uint256 agentId) public view returns (bool) {
        Binding memory b = _bindings[agentId];
        if (b.operator == address(0) || agentSuspended[agentId] || isOperatorStruckOut(b.operator)) return false;
        if (_walletIsHuman(b.agentWallet)) return false; // a human wallet is never an agent, at any time
        return _backedByIdentity(agentId, b);
    }

    /// @notice Resolves an address to its binding, active or not. `bound` is false for
    ///         addresses that are not a bound agent wallet.
    function agentOfWallet(address wallet)
        external view returns (bool bound, uint256 agentId, address operator, uint32 epoch)
    {
        uint256 plusOne = _walletAgentPlusOne[wallet];
        if (plusOne == 0) return (false, 0, address(0), 0);
        agentId = plusOne - 1;
        Binding memory b = _bindings[agentId];
        return (true, agentId, b.operator, b.epoch);
    }

    /// @dev PIE createIdentity() is permissionless, so the human/agent exclusion is re-checked on
    ///      every read, not only at bind time. A failing PIE read counts as human (fail-closed).
    function _walletIsHuman(address wallet) private view returns (bool) {
        try pie.getIdentity(wallet) returns (IPIEForBinding.Identity memory person) {
            return person.exists;
        } catch { return true; }
    }

    function _backedByIdentity(uint256 agentId, Binding memory b) private view returns (bool) {
        try identity.ownerOf(agentId) returns (address currentOwner) {
            if (currentOwner != b.operator) return false;
        } catch { return false; }
        try identity.getAgentWallet(agentId) returns (address currentWallet) {
            return currentWallet == b.agentWallet;
        } catch { return false; }
    }
}
