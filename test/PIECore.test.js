const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PIECore", function () {
  it("Should create identity and add XP", async function () {
    const [owner, user] = await ethers.getSigners();
    const PIECore = await ethers.getContractFactory("PIECore");
    const pie = await PIECore.deploy();
    await pie.waitForDeployment();

    // Authorize the owner to add XP
    await pie.authorizeCaller(owner.address);

    // Add XP to user
    await pie.addXP(user.address, 1000);

    const xp = await pie.getIdentity(user.address);
    expect(xp[0]).to.equal(1000);
  });

  it("Should enforce epoch cap", async function () {
    const [owner, user] = await ethers.getSigners();
    const PIECore = await ethers.getContractFactory("PIECore");
    const pie = await PIECore.deploy();
    await pie.waitForDeployment();

    await pie.authorizeCaller(owner.address);

    // Add XP up to cap
    await pie.addXP(user.address, 1000 * 10**18); // 1000 XP
    // Next should revert
    await expect(pie.addXP(user.address, 1)).to.be.revertedWith("Epoch cap exceeded");
  });

  it("Should allow path change after cooldown", async function () {
    const [owner, user] = await ethers.getSigners();
    const PIECore = await ethers.getContractFactory("PIECore");
    const pie = await PIECore.deploy();
    await pie.waitForDeployment();

    await pie.authorizeCaller(owner.address);

    // Give enough XP
    await pie.addXP(user.address, 1000 * 10**18); // 1000 XP

    // Change path
    await pie.connect(user).changePath(1); // Sovereign

    // Check path
    const identity = await pie.getIdentity(user.address);
    expect(identity[1]).to.equal(1); // Path.Sovereign
  });
});
