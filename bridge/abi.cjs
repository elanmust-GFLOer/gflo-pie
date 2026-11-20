"use strict";
// Human-readable ABIs used by run.cjs; verified against the compiled contracts in
// tests-v02/test/BridgeWorker.cjs. Dependency-free so tests can load it without ethers here.
const ABI = {
  eas: [
    "function attest((bytes32 schema,(address recipient,uint64 expirationTime,bool revocable,bytes32 refUID,bytes data,uint256 value) data)) payable returns (bytes32)",
    "function revoke((bytes32 schema,(bytes32 uid,uint256 value) data)) payable",
    "function getAttestation(bytes32 uid) view returns ((bytes32 uid,bytes32 schema,uint64 time,uint64 expirationTime,uint64 revocationTime,bytes32 refUID,address recipient,address attester,bool revocable,bytes data))",
    "event Attested(address indexed recipient, address indexed attester, bytes32 uid, bytes32 indexed schemaUID)",
    "event Revoked(address indexed recipient, address indexed attester, bytes32 uid, bytes32 indexed schemaUID)",
  ],
  resolver: [
    "function schemaUID() view returns (bytes32)",
    "function usedEvents(bytes32) view returns (bool)",
    "function grants(bytes32) view returns (address recipient, bytes32 ruleId, uint16 amount, uint64 finalizesAt, address attester, uint8 status)",
    "function finalize(bytes32 uid)",
    "event GrantPending(bytes32 indexed uid, address indexed recipient, address indexed attester, uint16 amount, uint64 finalizesAt)",
    "error Paused()", "error WrongSchema()", "error InvalidAttestation()", "error InvalidRule()",
    "error InvalidAttester()", "error InvalidIdentity()", "error Replay()", "error LimitReached()",
  ],
  core: ["function getIdentity(address account) view returns ((bool exists,uint64 xp,uint8 selectedPath,uint8 tier))"],
  gate: ["function effectiveTier(address wallet) view returns (uint8)", "error NoIdentity()"],
};

module.exports = { ABI };
