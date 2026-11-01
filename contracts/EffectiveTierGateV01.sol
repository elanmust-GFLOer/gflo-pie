// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IPIEGateCore {
    struct Identity { bool exists; uint64 xp; uint8 selectedPath; uint8 tier; }
    function getIdentity(address wallet) external view returns(Identity memory);
}
interface IXPRegistryGate {
    function pieCore() external view returns(address);
    function totalXP(address wallet) external view returns(uint64);
}

/// @notice Achieved Core tier is historical. Only effective tier conveys privilege.
/// @dev A paused/reverting Registry causes fail-closed authorization.
contract EffectiveTierGateV01 {
    IPIEGateCore public immutable core;
    IXPRegistryGate public immutable registry;
    error InvalidSetup();
    error NoIdentity();
    error InsufficientEffectiveTier(uint8 actual,uint8 required);

    constructor(address core_,address registry_) {
        if(core_.code.length==0 || registry_.code.length==0 ||
           IXPRegistryGate(registry_).pieCore()!=core_) revert InvalidSetup();
        core=IPIEGateCore(core_);
        registry=IXPRegistryGate(registry_);
    }
    function effectiveTier(address wallet) public view returns(uint8) {
        IPIEGateCore.Identity memory person=core.getIdentity(wallet);
        if(!person.exists) revert NoIdentity();
        uint64 xp=registry.totalXP(wallet); // propagate RegistryInactive etc
        uint8 cap=xp>=5000 ? 2 : xp>=1000 ? 1 : 0;
        return person.tier<cap ? person.tier : cap;
    }
    function requireEffectiveTier(address wallet,uint8 minTier) external view {
        uint8 current=effectiveTier(wallet);
        if(current<minTier) revert InsufficientEffectiveTier(current,minTier);
    }
}
