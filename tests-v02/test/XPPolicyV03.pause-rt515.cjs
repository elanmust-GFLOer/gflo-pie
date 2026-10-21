const { expect } = require("chai");
const { ethers } = require("hardhat");

// RT5-15: policy emergency pause must fail closed for every privilege gate,
// even if the governance-approved Registry remains unpaused.
describe("RT5-15 — XPPolicyV03 pause and effective Tier fail-closed", function () {
  async function setup() {
    const [owner, alice] = await ethers.getSigners();
    const core = await (await ethers.getContractFactory("PIECoreIgnitionV01")).deploy(owner.address);
    await core.waitForDeployment();
    await core.connect(alice).createIdentity(1); // Sovereign target, achieved Tier 0, Genesis 25 XP.
    const policy = await (await ethers.getContractFactory("XPPolicyV03")).deploy(
      await core.getAddress(), owner.address
    );
    await policy.waitForDeployment();
    const registry = await (await ethers.getContractFactory("TrustedXPSourceRegistryV02")).deploy(
      await core.getAddress(), owner.address
    );
    await registry.waitForDeployment();
    const policyCode = await ethers.provider.getCode(await policy.getAddress());
    await registry.proposePolicy(await policy.getAddress(), ethers.keccak256(policyCode), owner.address);
    await registry.activatePolicy();
    await registry.setPaused(false);
    const gate = await (await ethers.getContractFactory("EffectiveTierGateV01")).deploy(
      await core.getAddress(), await registry.getAddress()
    );
    await gate.waitForDeployment();
    return { owner, alice, core, policy, registry, gate };
  }

  it("keeps baseline reads and Tier 0 authorization functional when unpaused", async function () {
    const { alice, policy, registry, gate } = await setup();
    expect(await policy.totalXP(alice.address)).to.equal(25n);
    expect(await registry.totalXP(alice.address)).to.equal(25n);
    expect(await gate.effectiveTier(alice.address)).to.equal(0n);
    await expect(gate.requireEffectiveTier(alice.address, 0)).not.to.be.reverted;
  });

  it("denies policy, registry, and Tier gate reads on policy-only pause", async function () {
    const { alice, policy, registry, gate } = await setup();
    await policy.setPaused(true);
    expect(await registry.paused()).to.equal(false); // isolate policy emergency stop.
    await expect(policy.totalXP(alice.address)).to.be.revertedWithCustomError(policy, "Paused");
    await expect(registry.totalXP(alice.address)).to.be.revertedWithCustomError(policy, "Paused");
    await expect(gate.effectiveTier(alice.address)).to.be.revertedWithCustomError(policy, "Paused");
    await expect(gate.requireEffectiveTier(alice.address, 0)).to.be.revertedWithCustomError(policy, "Paused");
  });

  it("resumes normal reads after owner unpauses policy", async function () {
    const { alice, policy, registry, gate } = await setup();
    await policy.setPaused(true);
    await policy.setPaused(false);
    expect(await registry.totalXP(alice.address)).to.equal(25n);
    await expect(gate.requireEffectiveTier(alice.address, 0)).not.to.be.reverted;
  });

  it("keeps Registry stop independent of policy stop", async function () {
    const { alice, policy, registry, gate } = await setup();
    expect(await policy.paused()).to.equal(false);
    await registry.setPaused(true);
    await expect(registry.totalXP(alice.address)).to.be.revertedWithCustomError(registry, "RegistryInactive");
    await expect(gate.requireEffectiveTier(alice.address, 0)).to.be.revertedWithCustomError(registry, "RegistryInactive");
  });
});
