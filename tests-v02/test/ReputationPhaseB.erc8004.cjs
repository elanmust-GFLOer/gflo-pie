const { expect } = require("chai");
const { ethers, network } = require("hardhat");

// DESIGN-003 Phase B: GFLO as a trusted ERC-8004 reputation client, plus the agent keeper.
// Official ERC-8004 Identity + Reputation registries (vendored, pinned), real EAS. No mocks.
const { setup, deploy, addr, advance, id, DAY, FQ } = require("../fixtures/agent-stack.cjs");
const keeper = require("../../keeper/agent-keeper.cjs");

const TAG1 = "gflo.verified";

describe("DESIGN-003 Phase B — ERC-8004 reputation publisher and agent keeper", function () {
  async function setupB() {
    const ctx = await setup();
    const publisher = await deploy("GFLOReputationPublisherV01", await addr(ctx.reputation), await addr(ctx.agentRes), ctx.gov.address);
    // A finalized (VALID) grant for a bound agent.
    const finalizedGrant = async (agentId, wallet, attester = ctx.attCI) => {
      const uid = await ctx.attest(attester, agentId, wallet.address);
      await advance(3 * DAY);
      await ctx.agentRes.finalize(uid);
      return uid;
    };
    const summary = async (agentId, tag2) => {
      const [count, value, decimals] = await ctx.reputation.getSummary(agentId, [await addr(publisher)], TAG1,
        tag2 ?? await publisher.currentEpochTag(agentId));
      return { count, value, decimals };
    };
    return { ...ctx, publisher, finalizedGrant, summary };
  }

  describe("publisher", function () {
    it("refuses a reputation registry bound to a different identity registry", async function () {
      const { gov, identity, agentRes } = await setupB();
      await expect(deploy("GFLOReputationPublisherV01", await addr(identity), await addr(agentRes), gov.address)).to.be.reverted;
    });

    it("mirrors only finalized grants, once, with an epoch tag and an EAS reference", async function () {
      const { op, w1, attCI, agentRes, reputation, publisher, newBoundAgent, attest, finalizedGrant, summary } = await setupB();
      const a = await newBoundAgent(op, w1);
      const pending = await attest(attCI, a, w1.address);
      expect(await publisher.canPublish(pending)).to.equal(false);
      await expect(publisher.publish(pending)).to.be.revertedWithCustomError(publisher, "NotEligible");

      const uid = await finalizedGrant(a, w1);
      expect(await publisher.canPublish(uid)).to.equal(true);
      const { chainId } = await ethers.provider.getNetwork();
      await expect(publisher.publish(uid))
        .to.emit(reputation, "NewFeedback")
        .withArgs(a, await addr(publisher), 1, 100, 0, TAG1, TAG1, "gflo-epoch:1", "",
          `eas:${chainId}:${uid.toLowerCase()}`, uid);
      expect(await publisher.feedbackIndex(uid)).to.equal(1n);
      expect(await summary(a)).to.deep.equal({ count: 1n, value: 100n, decimals: 0 });
      await expect(publisher.publish(uid)).to.be.revertedWithCustomError(publisher, "AlreadyLive");
      expect(await agentRes.totalAgentXP(a)).to.equal(400n); // mirroring never touches XP
    });

    it("a new owner never inherits the old owner's record (epoch tag), and the old entry can be retracted", async function () {
      const { op, op2, w1, w2, outsider, identity, binding, publisher, newBoundAgent, setWallet, finalizedGrant, summary } = await setupB();
      const a = await newBoundAgent(op, w1);
      const uid = await finalizedGrant(a, w1);
      await publisher.publish(uid);
      expect((await summary(a)).count).to.equal(1n);

      await identity.connect(op).transferFrom(op.address, op2.address, a); // sold
      expect(await publisher.canUnpublish(uid)).to.equal(true);
      await binding.connect(outsider).unbind(a);
      await setWallet(op2, a, w2);
      await binding.connect(op2).bind(a); // epoch 2
      expect(await publisher.currentEpochTag(a)).to.equal("gflo-epoch:2");
      expect((await summary(a)).count).to.equal(0n);         // isolated by the tag even before retraction
      await publisher.connect(outsider).unpublish(uid);       // permissionless
      expect((await summary(a, "gflo-epoch:1")).count).to.equal(0n);
      await expect(publisher.publish(uid)).to.be.revertedWithCustomError(publisher, "NotEligible"); // epoch ended
    });

    it("retracts revoked grants; a lifted suspension can be published again", async function () {
      const { gov, op, w1, attCI, eas, schemaUID, binding, publisher, outsider, newBoundAgent, finalizedGrant, summary } = await setupB();
      const a = await newBoundAgent(op, w1);
      const u1 = await finalizedGrant(a, w1);
      const u2 = await finalizedGrant(a, w1);
      await publisher.publish(u1); await publisher.publish(u2);
      expect((await summary(a)).count).to.equal(2n);
      await expect(publisher.connect(outsider).unpublish(u1)).to.be.revertedWithCustomError(publisher, "StillEligible");

      await eas.connect(attCI).revoke({ schema: schemaUID, data: { uid: u1, value: 0 } });
      await publisher.connect(outsider).unpublish(u1);
      expect((await summary(a)).count).to.equal(1n);
      await expect(publisher.publish(u1)).to.be.revertedWithCustomError(publisher, "NotEligible");

      await binding.connect(gov).setSuspended(a, true, id("INCIDENT"));
      await publisher.connect(outsider).unpublish(u2);
      expect((await summary(a)).count).to.equal(0n);
      await binding.connect(gov).setSuspended(a, false, id("CLEARED"));
      await publisher.publish(u2);
      expect(await publisher.feedbackIndex(u2)).to.equal(3n); // new ERC-8004 entry
      expect((await summary(a)).count).to.equal(1n);
    });

    it("ERC-8004 self-feedback rule: an operator who approves the publisher only blocks their own mirroring", async function () {
      const { op, w1, identity, agentRes, publisher, newBoundAgent, finalizedGrant } = await setupB();
      const a = await newBoundAgent(op, w1);
      const uid = await finalizedGrant(a, w1);
      await identity.connect(op).setApprovalForAll(await addr(publisher), true);
      await expect(publisher.publish(uid)).to.be.revertedWith("Self-feedback not allowed");
      expect(await publisher.feedbackIndex(uid)).to.equal(0n);
      expect(await agentRes.totalAgentXP(a)).to.equal(400n);
    });

    it("pause blocks publishing only; a broken ERC-8004 upgrade never touches GFLO XP or tiers", async function () {
      const { gov, op, w1, attCI, eas, schemaUID, agentRes, tierGate, repAsOwner, publisher, newBoundAgent, finalizedGrant } = await setupB();
      const a = await newBoundAgent(op, w1);
      const u1 = await finalizedGrant(a, w1);
      const u2 = await finalizedGrant(a, w1);
      await publisher.publish(u1);
      await expect(publisher.connect(op).setPaused(true)).to.be.revertedWithCustomError(publisher, "NotOwner");
      await publisher.connect(gov).setPaused(true);
      await expect(publisher.publish(u2)).to.be.revertedWithCustomError(publisher, "Paused");
      expect(await publisher.canPublish(u2)).to.equal(false);
      await eas.connect(attCI).revoke({ schema: schemaUID, data: { uid: u1, value: 0 } });
      await publisher.unpublish(u1); // still allowed while paused
      await publisher.connect(gov).setPaused(false);

      const xpBefore = await agentRes.totalAgentXP(a);
      const tierBefore = await tierGate.agentTier(a);
      const broken = await deploy(FQ + "MinimalUUPS.sol:MinimalUUPS");
      await repAsOwner.upgradeToAndCall(await addr(broken), "0x"); // ERC-8004 owner ships a broken upgrade
      await expect(publisher.publish(u2)).to.be.reverted;
      expect(await agentRes.totalAgentXP(a)).to.equal(xpBefore);
      expect(await tierGate.agentTier(a)).to.equal(tierBefore);
    });
  });

  describe("keeper", function () {
    it("publishes finalized grants; after a sale it ends the stale binding and retracts the entry", async function () {
      const { op, op2, w1, outsider, identity, binding, agentRes, publisher, newBoundAgent, finalizedGrant, summary } = await setupB();
      const k = { identity: identity.connect(outsider), binding: binding.connect(outsider),
        agentXP: agentRes.connect(outsider), publisher: publisher.connect(outsider) };
      const a = await newBoundAgent(op, w1);
      const uid = await finalizedGrant(a, w1);

      const dry = await keeper.tick({ ...k, dryRun: true });
      expect(dry.map((x) => [x.type, x.sent])).to.deep.equal([["publish", false]]);
      expect(await publisher.feedbackIndex(uid)).to.equal(0n);

      const first = await keeper.tick(k);
      expect(first.map((x) => x.type)).to.deep.equal(["publish"]);
      expect((await summary(a)).count).to.equal(1n);
      expect(await keeper.tick(k)).to.deep.equal([]); // idempotent

      await identity.connect(op).transferFrom(op.address, op2.address, a);
      const after = await keeper.tick(k);
      expect(after.map((x) => x.type)).to.deep.equal(["unbind", "unpublish"]);
      expect((await binding.getBinding(a)).operator).to.equal(ethers.ZeroAddress);
      expect(await publisher.feedbackIndex(uid)).to.equal(0n);
    });

    it("reports a wallet flip-back it cannot unbind, and retracts the entry while the agent is inactive", async function () {
      const { op, w1, w2, outsider, identity, binding, agentRes, publisher, newBoundAgent, setWallet, finalizedGrant } = await setupB();
      const k = { identity: identity.connect(outsider), binding: binding.connect(outsider),
        agentXP: agentRes.connect(outsider), publisher: publisher.connect(outsider) };
      const a = await newBoundAgent(op, w1);
      const uid = await finalizedGrant(a, w1);
      await keeper.tick(k);
      expect(await publisher.feedbackIndex(uid)).to.equal(1n);

      await setWallet(op, a, w2);                       // binding stale: keeper unpublishes...
      const during = await keeper.tick(k);
      expect(during.map((x) => x.type)).to.include("unpublish");
      // ...it also unbinds, which ends the epoch for good; replay the flip-back without a tick in between:
      const b = await newBoundAgent(op, w2);            // fresh agent on a fresh wallet... (w2 freed by unbind)
      const uid2 = await finalizedGrant(b, w2);
      await keeper.tick(k);
      await setWallet(op, b, w1);
      await setWallet(op, b, w2);                       // W2 -> W1 -> W2 before the keeper runs
      expect(await binding.isActive(b)).to.equal(true); // backed again: nobody but the operator can unbind
      const flip = await keeper.tick(k);
      expect(flip.filter((x) => x.type === "flipback").map((x) => x.agentId)).to.deep.equal([b]);
      expect(await publisher.feedbackIndex(uid2)).to.equal(1n); // still eligible, stays live until governance acts
    });

    it("review fix: a transfer in the same block as the bind is still seen as a later change", async function () {
      const { op, op2, w1, outsider, identity, binding, agentRes, publisher, register, setWallet } = await setupB();
      const k = { identity: identity.connect(outsider), binding: binding.connect(outsider),
        agentXP: agentRes.connect(outsider), publisher: publisher.connect(outsider) };
      const a = await register(op);
      await setWallet(op, a, w1);
      const nonce = await ethers.provider.getTransactionCount(op.address);
      await network.provider.send("evm_setAutomine", [false]);
      const t1 = await binding.connect(op).bind(a, { gasLimit: 500000, nonce });
      const t2 = await identity.connect(op).transferFrom(op.address, op2.address, a, { gasLimit: 500000, nonce: nonce + 1 });
      await network.provider.send("evm_mine");
      await network.provider.send("evm_setAutomine", [true]);
      const [r1, r2] = [await ethers.provider.getTransactionReceipt(t1.hash), await ethers.provider.getTransactionReceipt(t2.hash)];
      expect([r1.status, r2.status]).to.deep.equal([1, 1]);
      expect(r1.blockNumber).to.equal(r2.blockNumber); // same block, same timestamp
      expect((await binding.getBinding(a)).operator).to.equal(op.address);
      const acts = await keeper.tick(k);
      expect(acts.map((x) => x.type)).to.deep.equal(["unbind"]);
      expect((await binding.getBinding(a)).operator).to.equal(ethers.ZeroAddress);
    });

    it("review fix: re-setting the same wallet is not a flip-back; a suspended agent is not re-alerted", async function () {
      const { gov, op, w1, w2, outsider, identity, binding, agentRes, publisher, newBoundAgent, setWallet } = await setupB();
      const k = { identity: identity.connect(outsider), binding: binding.connect(outsider),
        agentXP: agentRes.connect(outsider), publisher: publisher.connect(outsider) };
      const a = await newBoundAgent(op, w1);
      await setWallet(op, a, w1); // idempotent ERC-8004 update: MetadataSet, no change
      expect(await keeper.tick(k)).to.deep.equal([]);
      await setWallet(op, a, w2); await setWallet(op, a, w1); // genuine flip-back
      expect((await keeper.tick(k)).map((x) => x.type)).to.deep.equal(["flipback"]);
      await binding.connect(gov).setSuspended(a, true, id("FLIPBACK"));
      expect(await keeper.tick(k)).to.deep.equal([]); // governance acted: no repeated alert
    });
  });
});
