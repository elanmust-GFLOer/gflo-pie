const { expect } = require("chai");
const { ethers } = require("hardhat");

const NONE = 0n, SOVEREIGN = 1n, REFORMER = 2n, PRAXIS = 3n;

describe("PIECoreV02 — Genesis Identity", function () {
  let pie, alice, bob;
  beforeEach(async function () {
    [, alice, bob] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("PIECoreV02");
    pie = await Factory.deploy();
    await pie.waitForDeployment();
  });

  it("returns an empty identity and None current path before Genesis", async function () {
    const id = await pie.getIdentity(alice.address);
    expect(id.exists).to.equal(false);
    expect(id.xp).to.equal(0n);
    expect(await pie.getCurrentPath(alice.address)).to.equal(NONE);
  });

  it("starts as Sovereign/Tier 0 with 25 XP even when targeting Praxis", async function () {
    await expect(pie.connect(alice).createIdentity(PRAXIS))
      .to.emit(pie, "IdentityCreated").withArgs(alice.address, PRAXIS, 25n);
    const id = await pie.getIdentity(alice.address);
    expect(id.exists).to.equal(true);
    expect(id.xp).to.equal(25n);
    expect(id.selectedPath).to.equal(PRAXIS);
    expect(id.tier).to.equal(0n);
    expect(await pie.getCurrentPath(alice.address)).to.equal(SOVEREIGN);
  });

  it("rejects None and out-of-range target Paths", async function () {
    await expect(pie.connect(alice).createIdentity(NONE))
      .to.be.revertedWithCustomError(pie, "InvalidTargetPath");
    await expect(pie.connect(alice).createIdentity(4))
      .to.be.reverted; // Solidity ABI enum bounds checking
  });

  it("rejects a second Genesis regardless of selected target", async function () {
    await pie.connect(alice).createIdentity(SOVEREIGN);
    await expect(pie.connect(alice).createIdentity(PRAXIS))
      .to.be.revertedWithCustomError(pie, "IdentityAlreadyExists");
    expect((await pie.getIdentity(alice.address)).xp).to.equal(25n);
  });

  it("keeps different wallet identities independent", async function () {
    await pie.connect(alice).createIdentity(REFORMER);
    await pie.connect(bob).createIdentity(PRAXIS);
    expect((await pie.getIdentity(alice.address)).selectedPath).to.equal(REFORMER);
    expect((await pie.getIdentity(bob.address)).selectedPath).to.equal(PRAXIS);
  });

  it("rejects target changes before Genesis", async function () {
    await expect(pie.connect(alice).setSelectedPath(PRAXIS))
      .to.be.revertedWithCustomError(pie, "IdentityDoesNotExist");
  });

  it("changes only the selected target, never XP or earned Tier", async function () {
    await pie.connect(alice).createIdentity(SOVEREIGN);
    await expect(pie.connect(alice).setSelectedPath(PRAXIS))
      .to.emit(pie, "TargetPathChanged")
      .withArgs(alice.address, SOVEREIGN, PRAXIS);
    let id = await pie.getIdentity(alice.address);
    expect(id.selectedPath).to.equal(PRAXIS);
    expect(id.xp).to.equal(25n);
    expect(id.tier).to.equal(0n);
    expect(await pie.getCurrentPath(alice.address)).to.equal(SOVEREIGN);
    await pie.connect(alice).setSelectedPath(REFORMER);
    id = await pie.getIdentity(alice.address);
    expect(id.selectedPath).to.equal(REFORMER);
    expect(id.tier).to.equal(0n);
  });

  it("rejects invalid target updates after Genesis", async function () {
    await pie.connect(alice).createIdentity(SOVEREIGN);
    await expect(pie.connect(alice).setSelectedPath(NONE))
      .to.be.revertedWithCustomError(pie, "InvalidTargetPath");
  });
});

describe("PIECoreV02 — Pure Path State Machine", function () {
  let pie;
  beforeEach(async function () {
    pie = await (await ethers.getContractFactory("PIECoreV02")).deploy();
    await pie.waitForDeployment();
  });
  it("permits only adjacent upward Tier changes", async function () {
    for (const [from, to] of [[0,1],[1,2]]) {
      expect(await pie.isValidTransition(from,to)).to.equal(true);
    }
    for (const [from, to] of [[0,0],[0,2],[1,0],[1,1],[2,0],[2,1],[2,2],[2,3],[3,4],[255,0]]) {
      expect(await pie.isValidTransition(from,to), `${from}->${to}`).to.equal(false);
    }
  });
  it("returns the next Tier, but rejects going beyond Praxis", async function () {
    expect(await pie.nextTier(0)).to.equal(1n);
    expect(await pie.nextTier(1)).to.equal(2n);
    await expect(pie.nextTier(2)).to.be.revertedWith("Max tier reached");
    await expect(pie.nextTier(255)).to.be.revertedWith("Max tier reached");
  });
  it("does not expose any public/admin XP or Tier mutation entrypoint", async function () {
    const names = pie.interface.fragments.filter(f => f.type === "function").map(f => f.name);
    for (const forbidden of ["addXP","awardXP","upgradeTier","upgrade","upgradeToReformer","upgradeToPraxis"]) {
      expect(names, `Unexpected entrypoint ${forbidden}`).not.to.include(forbidden);
    }
  });
});
