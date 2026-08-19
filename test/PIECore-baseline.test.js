const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PIECore Baseline - Security & Functionality", function () {
  let pieCore;
  let mockGFLO;
  let owner, authorized, user1, user2, user3;

  beforeEach(async function () {
    [owner, authorized, user1, user2, user3] = await ethers.getSigners();

    // Deploy mock GFLO token
    const MockGFLO = await ethers.getContractFactory("MockGFLO");
    mockGFLO = await MockGFLO.deploy();
    await mockGFLO.waitForDeployment();

    // Deploy PIECore with mock GFLO
    const PIECore = await ethers.getContractFactory("PIECore");
    pieCore = await PIECore.deploy(mockGFLO.getAddress());
    await pieCore.waitForDeployment();

    // Setup: authorize a caller
    await pieCore.setAuthorizedCaller(authorized.address, true);

    // Mint tokens for test users
    const mintAmount = ethers.parseEther("100000");
    await mockGFLO.mint(user1.address, mintAmount);
    await mockGFLO.mint(user2.address, mintAmount);
    await mockGFLO.mint(user3.address, mintAmount);
  });

  // ========== DEPLOYMENT & SETUP ==========
  describe("Deployment", function () {
    it("Should deploy with correct GFLO address", async function () {
      expect(await pieCore.gfloToken()).to.equal(mockGFLO.getAddress());
    });

    it("Should set owner correctly", async function () {
      expect(await pieCore.owner()).to.equal(owner.address);
    });

    it("Should initialize identity as empty", async function () {
      const identity = await pieCore.identities(user1.address);
      expect(identity.xp).to.equal(0);
      expect(identity.path).to.equal(0); // Path.None
      expect(identity.tier).to.equal(0);
    });
  });

  // ========== choosePath() TESTS ==========
  describe("choosePath()", function () {
    it("Should allow user to choose a valid path", async function () {
      const tx = await pieCore.connect(user1).choosePath(1); // Path.Sovereign
      await expect(tx)
        .to.emit(pieCore, "PathChosen")
        .withArgs(user1.address, 1);

      const identity = await pieCore.identities(user1.address);
      expect(identity.path).to.equal(1);
      expect(identity.tier).to.equal(0);
    });

    it("Should reject Path.None", async function () {
      await expect(pieCore.connect(user1).choosePath(0))
        .to.be.revertedWith("Invalid path");
    });

    it("Should prevent choosing path twice", async function () {
      await pieCore.connect(user1).choosePath(1); // Sovereign
      await expect(pieCore.connect(user1).choosePath(2)) // Reformer
        .to.be.revertedWith("Already chosen");
    });

    it("Should allow each user to choose independently", async function () {
      await pieCore.connect(user1).choosePath(1); // Sovereign
      await pieCore.connect(user2).choosePath(2); // Reformer

      const id1 = await pieCore.identities(user1.address);
      const id2 = await pieCore.identities(user2.address);
      expect(id1.path).to.equal(1);
      expect(id2.path).to.equal(2);
    });
  });

  // ========== gainXP() TESTS ==========
  describe("gainXP() - Base Functionality", function () {
    beforeEach(async function () {
      // User must choose path first
      await pieCore.connect(user1).choosePath(1); // Sovereign
    });

    it("Should allow user to gain XP after choosing path", async function () {
      const tx = await pieCore.connect(user1).gainXP(500);
      await expect(tx)
        .to.emit(pieCore, "XPGained")
        .withArgs(user1.address, 500);

      const identity = await pieCore.identities(user1.address);
      expect(identity.xp).to.equal(500);
    });

    it("Should accumulate XP correctly", async function () {
      await pieCore.connect(user1).gainXP(100);
      await pieCore.connect(user1).gainXP(200);
      await pieCore.connect(user1).gainXP(150);

      const identity = await pieCore.identities(user1.address);
      expect(identity.xp).to.equal(450);
    });

    it("Should reject gainXP() without choosing path first", async function () {
      await expect(pieCore.connect(user2).gainXP(100))
        .to.be.revertedWith("Choose path first");
    });

    it("Should allow user1 to call gainXP for their own address", async function () {
      await pieCore.connect(user1).gainXP(1000);
      const identity = await pieCore.identities(user1.address);
      expect(identity.xp).to.equal(1000);
    });
  });

  // ========== SECURITY TEST: UNAUTHORIZED gainXP() ==========
  describe("gainXP() - SECURITY: Arbitrary XP Increase", function () {
    beforeEach(async function () {
      await pieCore.connect(user1).choosePath(1); // User1 chooses path
      await pieCore.connect(user2).choosePath(1); // User2 chooses path
    });

    it("SECURITY FINDING: User can arbitrarily increase own XP via gainXP()", async function () {
      // This test DEMONSTRATES the vulnerability
      // A normal user can call gainXP() and arbitrarily increase their own XP
      // without any authorization check or external verification
      
      await pieCore.connect(user1).gainXP(1000000); // Arbitrary large amount
      const identity = await pieCore.identities(user1.address);
      
      // This should NOT be allowed - users should not control their own XP
      expect(identity.xp).to.equal(1000000);
    });

    it("SECURITY FINDING: User cannot manipulate another user's XP via gainXP()", async function () {
      // gainXP() always updates msg.sender, so direct manipulation isn't possible
      // However, any user can increase their own XP without control
      
      const xpBefore = (await pieCore.identities(user2.address)).xp;
      await pieCore.connect(user1).gainXP(9999999); // User1 gains massive XP
      const xpAfter = (await pieCore.identities(user2.address)).xp;
      
      // User2's XP unchanged
      expect(xpAfter).to.equal(xpBefore);
      expect((await pieCore.identities(user1.address)).xp).to.equal(9999999);
    });

    it("Should demonstrate XP inflation scenario", async function () {
      // Simulate attack: multiple calls to inflate XP
      for (let i = 0; i < 10; i++) {
        await pieCore.connect(user1).gainXP(100000);
      }
      
      const identity = await pieCore.identities(user1.address);
      expect(identity.xp).to.equal(1000000); // 10 * 100,000
    });
  });

  // ========== addXP() TESTS ==========
  describe("addXP() - Authorized Only", function () {
    beforeEach(async function () {
      await pieCore.connect(user1).choosePath(1); // Sovereign
    });

    it("Should allow authorized caller to add XP", async function () {
      const tx = await pieCore.connect(authorized).addXP(user1.address, 500);
      await expect(tx)
        .to.emit(pieCore, "XPGained")
        .withArgs(user1.address, 500);

      const identity = await pieCore.identities(user1.address);
      expect(identity.xp).to.equal(500);
    });

    it("Should allow owner to add XP", async function () {
      await pieCore.connect(owner).addXP(user1.address, 750);
      const identity = await pieCore.identities(user1.address);
      expect(identity.xp).to.equal(750);
    });

    it("Should reject unauthorized caller", async function () {
      await expect(pieCore.connect(user2).addXP(user1.address, 100))
        .to.be.revertedWith("Not authorized");
    });

    it("Should work even if user hasn't chosen path", async function () {
      // addXP() doesn't check path requirement
      await pieCore.connect(authorized).addXP(user3.address, 1000);
      const identity = await pieCore.identities(user3.address);
      expect(identity.xp).to.equal(1000);
    });
  });

  // ========== upgradeToReformer() TESTS ==========
  describe("upgradeToReformer()", function () {
    beforeEach(async function () {
      // Setup: user1 is Sovereign
      await pieCore.connect(user1).choosePath(1); // Path.Sovereign
      
      // Give user1 sufficient XP
      await pieCore.connect(authorized).addXP(user1.address, 1000);
      
      // Approve GFLO tokens
      const burnAmount = await pieCore.REFORMER_BURN_AMOUNT();
      await mockGFLO.connect(user1).approve(pieCore.getAddress(), burnAmount);
    });

    it("Should reject if not Sovereign", async function () {
      await pieCore.connect(user2).choosePath(2); // Reformer
      await pieCore.connect(authorized).addXP(user2.address, 1000);
      await mockGFLO.connect(user2).approve(pieCore.getAddress(), ethers.parseEther("5000"));
      
      await expect(pieCore.connect(user2).upgradeToReformer())
        .to.be.revertedWith("Must be Sovereign first");
    });

    it("Should reject if insufficient XP", async function () {
      // Create new user with insufficient XP
      const user3Sovereign = user3;
      await pieCore.connect(user3Sovereign).choosePath(1);
      await pieCore.connect(authorized).addXP(user3Sovereign.address, 500); // Insufficient
      
      const burnAmount = await pieCore.REFORMER_BURN_AMOUNT();
      await mockGFLO.connect(user3Sovereign).approve(pieCore.getAddress(), burnAmount);
      
      await expect(pieCore.connect(user3Sovereign).upgradeToReformer())
        .to.be.revertedWith("Insufficient XP");
    });

    it("Should reject if insufficient GFLO allowance", async function () {
      // Don't approve enough tokens
      await mockGFLO.connect(user1).approve(pieCore.getAddress(), ethers.parseEther("1000"));
      
      await expect(pieCore.connect(user1).upgradeToReformer())
        .to.be.revertedWith("Transfer failed");
    });

    it("Should reject if insufficient GFLO balance", async function () {
      // Create new user with no tokens
      const poorUser = user2;
      await pieCore.connect(poorUser).choosePath(1);
      await pieCore.connect(authorized).addXP(poorUser.address, 1000);
      
      const burnAmount = await pieCore.REFORMER_BURN_AMOUNT();
      await mockGFLO.connect(poorUser).approve(pieCore.getAddress(), burnAmount);
      
      // Transfer out balance
      const balance = await mockGFLO.balanceOf(poorUser.address);
      await mockGFLO.connect(poorUser).transfer(owner.address, balance);
      
      await expect(pieCore.connect(poorUser).upgradeToReformer())
        .to.be.revertedWith("Transfer failed");
    });

    it("Should successfully upgrade to Reformer", async function () {
      const burnAmount = await pieCore.REFORMER_BURN_AMOUNT();
      
      const tx = await pieCore.connect(user1).upgradeToReformer();
      await expect(tx)
        .to.emit(pieCore, "CommitmentBurned")
        .withArgs(user1.address, burnAmount);
      await expect(tx)
        .to.emit(pieCore, "PathChosen")
        .withArgs(user1.address, 2); // Path.Reformer
      
      const identity = await pieCore.identities(user1.address);
      expect(identity.path).to.equal(2); // Reformer
      expect(identity.tier).to.equal(1);
      // XP should remain unchanged
      expect(identity.xp).to.equal(1000);
    });

    it("Should burn GFLO tokens", async function () {
      const balanceBefore = await mockGFLO.balanceOf(user1.address);
      const burnAmount = await pieCore.REFORMER_BURN_AMOUNT();
      
      await pieCore.connect(user1).upgradeToReformer();
      
      const balanceAfter = await mockGFLO.balanceOf(user1.address);
      expect(balanceBefore - balanceAfter).to.equal(burnAmount);
    });
  });

  // ========== upgradeToPraxis() TESTS ==========
  describe("upgradeToPraxis()", function () {
    beforeEach(async function () {
      // Setup: user1 is Reformer with sufficient XP
      await pieCore.connect(user1).choosePath(1); // Sovereign
      await pieCore.connect(authorized).addXP(user1.address, 1000);
      
      // Upgrade to Reformer
      const reformerBurnAmount = await pieCore.REFORMER_BURN_AMOUNT();
      await mockGFLO.connect(user1).approve(pieCore.getAddress(), reformerBurnAmount);
      await pieCore.connect(user1).upgradeToReformer();
      
      // Prep for Praxis
      await pieCore.connect(authorized).addXP(user1.address, 4000); // Total 5000
      const praxisBurnAmount = ethers.parseEther("10000");
      await mockGFLO.connect(user1).approve(pieCore.getAddress(), praxisBurnAmount);
    });

    it("Should reject if not Reformer", async function () {
      await pieCore.connect(user2).choosePath(1); // Sovereign
      await pieCore.connect(authorized).addXP(user2.address, 5000);
      const burnAmount = ethers.parseEther("10000");
      await mockGFLO.connect(user2).approve(pieCore.getAddress(), burnAmount);
      
      await expect(pieCore.connect(user2).upgradeToPraxis())
        .to.be.revertedWith("Must be Reformer first");
    });

    it("Should reject if insufficient XP (< 5000)", async function () {
      const newReformer = user2;
      await pieCore.connect(newReformer).choosePath(1);
      await pieCore.connect(authorized).addXP(newReformer.address, 1000);
      const reformerBurnAmount = await pieCore.REFORMER_BURN_AMOUNT();
      await mockGFLO.connect(newReformer).approve(pieCore.getAddress(), reformerBurnAmount);
      await pieCore.connect(newReformer).upgradeToReformer();
      
      // Only 1000 XP, need 5000
      const praxisBurnAmount = ethers.parseEther("10000");
      await mockGFLO.connect(newReformer).approve(pieCore.getAddress(), praxisBurnAmount);
      
      await expect(pieCore.connect(newReformer).upgradeToPraxis())
        .to.be.revertedWith("Insufficient XP for Praxis");
    });

    it("Should reject if insufficient GFLO", async function () {
      // Approve only 1000 tokens instead of 10000
      await mockGFLO.connect(user1).approve(pieCore.getAddress(), ethers.parseEther("1000"));
      
      await expect(pieCore.connect(user1).upgradeToPraxis())
        .to.be.revertedWith("Transfer failed");
    });

    it("Should successfully upgrade to Praxis", async function () {
      const tx = await pieCore.connect(user1).upgradeToPraxis();
      await expect(tx)
        .to.emit(pieCore, "CommitmentBurned")
        .withArgs(user1.address, ethers.parseEther("10000"));
      await expect(tx)
        .to.emit(pieCore, "PathChosen")
        .withArgs(user1.address, 3); // Path.Praxis
      
      const identity = await pieCore.identities(user1.address);
      expect(identity.path).to.equal(3); // Praxis
      expect(identity.tier).to.equal(2);
    });
  });

  // ========== VIEW FUNCTIONS ==========
  describe("View Functions", function () {
    beforeEach(async function () {
      await pieCore.connect(user1).choosePath(1);
      await pieCore.connect(authorized).addXP(user1.address, 2500);
    });

    it("getXP() should return correct XP", async function () {
      const xp = await pieCore.getXP(user1.address);
      expect(xp).to.equal(2500);
    });

    it("getTier() should return correct tier", async function () {
      const tier = await pieCore.getTier(user1.address);
      expect(tier).to.equal(0); // Still tier 0 (Sovereign)
    });

    it("getTier() should update after upgrade", async function () {
      const reformerBurn = await pieCore.REFORMER_BURN_AMOUNT();
      await mockGFLO.connect(user1).approve(pieCore.getAddress(), reformerBurn);
      await pieCore.connect(user1).upgradeToReformer();
      
      const tier = await pieCore.getTier(user1.address);
      expect(tier).to.equal(1); // Reformer tier
    });
  });

  // ========== AUTHORIZATION TESTS ==========
  describe("Authorization Control", function () {
    it("Should set authorized caller", async function () {
      await pieCore.setAuthorizedCaller(user2.address, true);
      const status = await pieCore.authorizedCallers(user2.address);
      expect(status).to.equal(true);
    });

    it("Should revoke authorization", async function () {
      await pieCore.setAuthorizedCaller(authorized.address, false);
      const status = await pieCore.authorizedCallers(authorized.address);
      expect(status).to.equal(false);
    });

    it("Should reject setAuthorizedCaller from non-owner", async function () {
      await expect(pieCore.connect(user1).setAuthorizedCaller(user2.address, true))
        .to.be.revertedWith("Not owner");
    });
  });

  // ========== EVENT EMISSION ==========
  describe("Event Emission", function () {
    it("Should emit PathChosen on choosePath()", async function () {
      const tx = await pieCore.connect(user1).choosePath(1);
      await expect(tx)
        .to.emit(pieCore, "PathChosen")
        .withArgs(user1.address, 1);
    });

    it("Should emit XPGained on gainXP()", async function () {
      await pieCore.connect(user1).choosePath(1);
      const tx = await pieCore.connect(user1).gainXP(100);
      await expect(tx)
        .to.emit(pieCore, "XPGained")
        .withArgs(user1.address, 100);
    });

    it("Should emit CommitmentBurned on path transition", async function () {
      await pieCore.connect(user1).choosePath(1);
      await pieCore.connect(authorized).addXP(user1.address, 1000);
      const reformerBurn = await pieCore.REFORMER_BURN_AMOUNT();
      await mockGFLO.connect(user1).approve(pieCore.getAddress(), reformerBurn);
      
      const tx = await pieCore.connect(user1).upgradeToReformer();
      await expect(tx)
        .to.emit(pieCore, "CommitmentBurned");
    });
  });

  // ========== EDGE CASES ==========
  describe("Edge Cases", function () {
    it("Should handle large XP amounts", async function () {
      await pieCore.connect(user1).choosePath(1);
      const largeAmount = ethers.parseEther("999999999");
      await pieCore.connect(user1).gainXP(largeAmount);
      
      const xp = await pieCore.getXP(user1.address);
      expect(xp).to.equal(largeAmount);
    });

    it("Should handle multiple users independently", async function () {
      await pieCore.connect(user1).choosePath(1);
      await pieCore.connect(user2).choosePath(2);
      
      await pieCore.connect(user1).gainXP(100);
      await pieCore.connect(user2).gainXP(200);
      
      const xp1 = await pieCore.getXP(user1.address);
      const xp2 = await pieCore.getXP(user2.address);
      
      expect(xp1).to.equal(100);
      expect(xp2).to.equal(200);
    });
  });
});
