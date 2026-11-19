const { expect } = require("chai");
const { ethers, network } = require("hardhat");

// DESIGN-004: Paths revived (PathRuleRegistryV01 + XPAttestationResolverV02) and tier steps by
// verified XP + time (TierProgressionV01), with no token, balance or payment anywhere.
const EAS_ART = require("@ethereum-attestation-service/eas-contracts/artifacts/contracts/EAS.sol/EAS.json");
const REG_ART = require("@ethereum-attestation-service/eas-contracts/artifacts/contracts/SchemaRegistry.sol/SchemaRegistry.json");

const coder = ethers.AbiCoder.defaultAbiCoder();
const id = (s) => ethers.id(s);
const DAY = 86400, WEEK = 7 * DAY;
const SOVEREIGN = 1, REFORMER = 2, PRAXIS = 3;
const SOV_RULE = id("sovereign.weekly-consistency");
const REF_RULE = id("reformer.octopush-room-review-accepted");
const PRX_RULE = id("praxis.agent-work-verified");
const UNASSIGNED = id("rule.without.path");

const advance = async (s) => { await network.provider.send("evm_increaseTime", [s]); await network.provider.send("evm_mine"); };
const toWeekStart = async () => { const t = (await ethers.provider.getBlock("latest")).timestamp; await advance(WEEK - (t % WEEK) + 3600); };
const deploy = async (name, ...args) => { const c = await (await ethers.getContractFactory(name)).deploy(...args); await c.waitForDeployment(); return c; };
const addr = (c) => c.getAddress();

describe("DESIGN-004 — Paths and tier progression by XP + time (no purchase)", function () {
  async function setup() {
    const [gov, member, sovMember, attester, outsider] = await ethers.getSigners();
    const schemaRegistry = await (new ethers.ContractFactory(REG_ART.abi, REG_ART.bytecode, gov)).deploy();
    const eas = await (new ethers.ContractFactory(EAS_ART.abi, EAS_ART.bytecode, gov)).deploy(await addr(schemaRegistry));
    const core = await deploy("PIECoreIgnitionV01", gov.address);
    const paths = await deploy("PathRuleRegistryV01", gov.address);
    const resolver = await deploy("XPAttestationResolverV02", await addr(eas), await addr(core), await addr(paths), gov.address);
    await schemaRegistry.register(await resolver.SCHEMA(), await addr(resolver), true);
    const registry = await deploy("TrustedXPSourceRegistryV02", await addr(core), gov.address);
    await registry.proposePolicy(await addr(resolver), ethers.keccak256(await ethers.provider.getCode(await addr(resolver))), gov.address);
    await registry.activatePolicy();
    await registry.setPaused(false);
    const gate = await deploy("EffectiveTierGateV01", await addr(core), await addr(registry));
    const progression = await deploy("TierProgressionV01", await addr(core), await addr(registry));
    await core.bindIgnition(await addr(progression)); // replaces burn-for-tier Ignition

    for (const [rule, path] of [[SOV_RULE, SOVEREIGN], [REF_RULE, REFORMER], [PRX_RULE, PRAXIS]]) {
      await resolver.registerRule(rule, 350, 1000);
      await paths.assignRule(rule, path);
    }
    await resolver.registerRule(UNASSIGNED, 350, 1000);
    await resolver.setAttesterLevel(attester.address, 1);
    for (const rule of [SOV_RULE, REF_RULE, PRX_RULE, UNASSIGNED]) await resolver.setRuleAttester(rule, attester.address, true);
    await core.connect(member).createIdentity(REFORMER);     // goal: Reformer (Tier 1)
    await core.connect(sovMember).createIdentity(SOVEREIGN); // goal: stay Sovereign

    const schemaUID = await resolver.schemaUID();
    let n = 0;
    const attestTx = (recipient, rule) => {
      n++;
      const data = coder.encode(["bytes32", "bytes32", "bytes32"], [rule, id("ev" + n), id("evd" + n)]);
      return eas.connect(attester).attest({ schema: schemaUID, data: {
        recipient, expirationTime: 0, revocable: true, refUID: ethers.ZeroHash, data, value: 0 } });
    };
    const attest = async (recipient, rule) => {
      const rc = await (await attestTx(recipient, rule)).wait();
      return rc.logs.map((l) => { try { return eas.interface.parseLog(l); } catch { return null; } })
        .find((l) => l && l.name === "Attested").args.uid;
    };
    // Earn `count` finalized grants of `rule`, at most 3 per day (daily cap with bonus: 3 x 420 = 1260).
    const earn = async (recipient, rule, count) => {
      const uids = [];
      for (let i = 0; i < count; i++) { if (i > 0 && i % 3 === 0) await advance(DAY); uids.push(await attest(recipient, rule)); }
      await advance(3 * DAY);
      for (const u of uids) await resolver.finalize(u);
      return uids;
    };
    return { gov, member, sovMember, attester, outsider, eas, core, paths, resolver, registry, gate, progression, schemaUID,
      attest, attestTx, earn };
  }

  describe("PathRuleRegistryV01", function () {
    it("assigns each rule to one Path, write-once, governance only", async function () {
      const { gov, outsider, paths } = await setup();
      const r = id("new.rule");
      await expect(paths.connect(outsider).assignRule(r, PRAXIS)).to.be.revertedWithCustomError(paths, "NotGovernance");
      await expect(paths.connect(gov).assignRule(r, 0)).to.be.revertedWithCustomError(paths, "InvalidPath");
      await expect(paths.connect(gov).assignRule(r, 4)).to.be.revertedWithCustomError(paths, "InvalidPath");
      await expect(paths.connect(gov).assignRule(r, PRAXIS)).to.emit(paths, "RulePathAssigned").withArgs(r, PRAXIS);
      await expect(paths.connect(gov).assignRule(r, SOVEREIGN)).to.be.revertedWithCustomError(paths, "AlreadyAssigned");
      expect(await paths.effectiveAmount(r, 350, PRAXIS)).to.equal(420n);  // +20% on the selected Path
      expect(await paths.effectiveAmount(r, 350, REFORMER)).to.equal(350n);
      await expect(paths.effectiveAmount(UNASSIGNED, 350, PRAXIS)).to.be.revertedWithCustomError(paths, "UnassignedRule");
    });
  });

  describe("XPAttestationResolverV02", function () {
    it("refuses rules without a Path; pays the bonus only on the member's selected Path", async function () {
      const { member, paths, resolver, attest, attestTx } = await setup();
      await expect(attestTx(member.address, UNASSIGNED)).to.be.revertedWithCustomError(paths, "UnassignedRule");
      const onPath = await attest(member.address, REF_RULE);
      const offPath = await attest(member.address, SOV_RULE);
      expect((await resolver.grants(onPath)).amount).to.equal(420n);
      expect((await resolver.grants(offPath)).amount).to.equal(350n);
      await advance(3 * DAY);
      await resolver.finalize(onPath); await resolver.finalize(offPath);
      expect(await resolver.totalXP(member.address)).to.equal(25n + 420n + 350n);
    });

    it("the bonus counts against the caps: focus never raises the speed limit", async function () {
      const { member, sovMember, resolver, attest, attestTx } = await setup();
      await toWeekStart();
      for (let i = 0; i < 4; i++) await attest(sovMember.address, REF_RULE); // off-Path: 4 x 350 = 1400 <= 1500
      for (let i = 0; i < 3; i++) await attest(member.address, REF_RULE);    // on-Path: 3 x 420 = 1260
      await expect(attestTx(member.address, REF_RULE)).to.be.revertedWithCustomError(resolver, "LimitReached"); // 1680 > 1500
    });

    it("revocation deducts exactly the amount earned, bonus included", async function () {
      const { gov, member, resolver, earn } = await setup();
      const [u] = await earn(member.address, REF_RULE, 1);
      expect(await resolver.totalXP(member.address)).to.equal(445n);
      await resolver.connect(gov).governanceRevoke(u, id("FABRICATED"));
      expect(await resolver.totalXP(member.address)).to.equal(25n);
    });
  });

  describe("TierProgressionV01 — XP + time, no purchase", function () {
    it("earns Tier 1 after the qualification period with sustained growth, and nothing is paid", async function () {
      const { member, core, gate, registry, progression, earn } = await setup();
      await expect(progression.connect(member).start()).to.be.revertedWithCustomError(progression, "InsufficientXP");
      await earn(member.address, REF_RULE, 3);                               // 25 + 1260 = 1285 >= 1000
      expect(await registry.totalXP(member.address)).to.equal(1285n);
      await expect(progression.connect(member).start()).to.emit(progression, "QualificationStarted");
      await expect(progression.connect(member).start()).to.be.revertedWithCustomError(progression, "AlreadyQualifying");
      await expect(progression.connect(member).complete()).to.be.revertedWithCustomError(progression, "TooEarly");
      await earn(member.address, REF_RULE, 1);                               // +420 during the period
      await advance(30 * DAY);
      await expect(progression.connect(member).complete()).to.emit(progression, "TierEarned").withArgs(member.address, 1, 1705);
      expect((await core.getIdentity(member.address)).tier).to.equal(1n);
      expect(await gate.effectiveTier(member.address)).to.equal(1n);
      expect(await ethers.provider.getBalance(await progression.getAddress())).to.equal(0n);
    });

    it("holding the threshold is not enough: XP must grow during the period", async function () {
      const { member, progression, earn } = await setup();
      await earn(member.address, REF_RULE, 3);
      await progression.connect(member).start();
      await advance(30 * DAY);
      await expect(progression.connect(member).complete()).to.be.revertedWithCustomError(progression, "InsufficientSustainedActivity");
    });

    it("revoked XP below the threshold lets anyone cancel the qualification", async function () {
      const { gov, member, outsider, resolver, progression, earn } = await setup();
      const uids = await earn(member.address, REF_RULE, 3);
      await progression.connect(member).start();
      await expect(progression.connect(outsider).cancelIfBelow(member.address)).to.be.revertedWithCustomError(progression, "StillQualified");
      await resolver.connect(gov).governanceRevoke(uids[0], id("FRAUD"));     // 1285 - 420 = 865 < 1000
      await expect(progression.connect(outsider).cancelIfBelow(member.address)).to.emit(progression, "QualificationCancelled");
      await advance(30 * DAY);
      await expect(progression.connect(member).complete()).to.be.revertedWithCustomError(progression, "NotQualifying");
    });

    it("a revocation during the period voids completion even if nobody cancelled", async function () {
      const { gov, member, resolver, progression, earn } = await setup();
      const uids = await earn(member.address, REF_RULE, 3);
      await progression.connect(member).start();
      await resolver.connect(gov).governanceRevoke(uids[0], id("FRAUD"));
      await advance(30 * DAY);
      await expect(progression.connect(member).complete()).to.be.revertedWithCustomError(progression, "QualificationInvalidated");
    });

    it("review fix: a dip below the threshold that recovers before anyone cancels still voids the clock", async function () {
      const { gov, member, resolver, progression, earn } = await setup();
      const uids = await earn(member.address, REF_RULE, 3);                // 1285
      await progression.connect(member).start();
      await resolver.connect(gov).governanceRevoke(uids[0], id("FRAUD"));  // 865 < 1000, nobody cancels
      await earn(member.address, REF_RULE, 2);                              // recovers to 1705
      await advance(30 * DAY);
      await expect(progression.connect(member).complete()).to.be.revertedWithCustomError(progression, "QualificationInvalidated");
      await progression.cancelIfBelow(member.address);                      // anyone can clear a voided qualification
      await expect(progression.connect(member).start()).to.emit(progression, "QualificationStarted"); // fresh clock
    });

    it("requires the next tier to be the member's selected goal", async function () {
      const { sovMember, progression, earn } = await setup();
      await earn(sovMember.address, SOV_RULE, 3);
      await expect(progression.connect(sovMember).start()).to.be.revertedWithCustomError(progression, "GoalNotSelected");
    });

    it("fails closed while the canonical XP registry is paused, and replaces burn-for-tier Ignition", async function () {
      const { gov, member, core, registry, progression, earn } = await setup();
      await earn(member.address, REF_RULE, 3);
      await registry.connect(gov).setPaused(true);
      await expect(progression.connect(member).start()).to.be.reverted;
      await registry.connect(gov).setPaused(false);
      const legacy = await deploy("GFLOFixedSupplyV01", gov.address, ethers.parseEther("1"));
      const ignition = await deploy("GFLOIgnitionV01", await addr(core), await addr(registry), await addr(legacy), 1n, 2n);
      await expect(core.bindIgnition(await addr(ignition))).to.be.revertedWithCustomError(core, "IgnitionAlreadyBound");
    });
  });
});
