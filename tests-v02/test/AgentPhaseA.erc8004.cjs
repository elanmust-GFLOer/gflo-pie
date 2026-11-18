const { expect } = require("chai");
const { ethers, network } = require("hardhat");

// DESIGN-003 Phase A: operator binding, agent XP and agent tier against
//  - the official ERC-8004 IdentityRegistryUpgradeable, deployed through its official
//    path (ERC1967Proxy -> MinimalUUPS -> upgradeToAndCall), vendored and SHA-256 pinned,
//  - the real EAS 1.9.0 contracts,
//  - the real human stack (PIE core, human XP resolver, Registry, EffectiveTierGate,
//    fixed-supply GFLO burn through Ignition). No mocks.
const EAS_ART = require("@ethereum-attestation-service/eas-contracts/artifacts/contracts/EAS.sol/EAS.json");
const REG_ART = require("@ethereum-attestation-service/eas-contracts/artifacts/contracts/SchemaRegistry.sol/SchemaRegistry.json");

const FQ = ".sources/contracts/test/erc8004/";
const ERC8004_BOOTSTRAP_OWNER = "0x547289319C3e6aedB179C0b8e8aF0B5ACd062603"; // hard-coded in MinimalUUPS
const coder = ethers.AbiCoder.defaultAbiCoder();
const id = (s) => ethers.id(s);
const DAY = 86400, WEEK = 7 * DAY;
const RULE = id("agent.pr-merged-ci-green");        // 400 XP, standard attester
const HUMAN_RULE = id("human.review.high-trust");   // 1000 XP, level-2 attester
const BURN1 = ethers.parseEther("100");

async function deployArt(art, signer, ...args) {
  const c = await new ethers.ContractFactory(art.abi, art.bytecode, signer).deploy(...args);
  await c.waitForDeployment(); return c;
}
const deploy = async (name, ...args) => {
  const c = await (await ethers.getContractFactory(name)).deploy(...args);
  await c.waitForDeployment(); return c;
};
const addr = (c) => c.getAddress();
const now = async () => (await ethers.provider.getBlock("latest")).timestamp;
const advance = async (s) => { await network.provider.send("evm_increaseTime", [s]); await network.provider.send("evm_mine"); };
const toWeekStart = async () => { const t = await now(); await advance(WEEK - (t % WEEK) + 3600); };
const event = (rc, iface, name) => rc.logs.map((l) => { try { return iface.parseLog(l); } catch { return null; } })
  .find((l) => l && l.name === name);

async function deployERC8004Identity(deployer) {
  const boot = await deploy(FQ + "MinimalUUPS.sol:MinimalUUPS");
  const proxy = await deploy(FQ + "ERC1967Proxy.sol:ERC1967Proxy", await addr(boot),
    boot.interface.encodeFunctionData("initialize", [ethers.ZeroAddress]));
  await network.provider.send("hardhat_setBalance", [ERC8004_BOOTSTRAP_OWNER, "0xde0b6b3a7640000"]);
  const owner8004 = await ethers.getImpersonatedSigner(ERC8004_BOOTSTRAP_OWNER);
  const impl = await deploy(FQ + "IdentityRegistryUpgradeable.sol:IdentityRegistryUpgradeable");
  const asBoot = boot.attach(await addr(proxy)).connect(owner8004);
  await asBoot.upgradeToAndCall(await addr(impl), impl.interface.encodeFunctionData("initialize"));
  const identity = impl.attach(await addr(proxy));
  expect(await identity.getVersion()).to.equal("2.0.0");
  return { identity, owner8004, asBoot };
}

describe("DESIGN-003 Phase A — operator binding, agent XP, agent tier (ERC-8004 + EAS)", function () {
  async function setup() {
    const s = await ethers.getSigners();
    const [gov, op, op2, attCI, attCI2, attHuman, w1, w2, w3, w4, buyer, outsider, humanWallet] = s;

    const schemaRegistry = await deployArt(REG_ART, gov);
    const eas = await deployArt(EAS_ART, gov, await addr(schemaRegistry));

    // Human stack.
    const core = await deploy("PIECoreIgnitionV01", gov.address);
    const humanRes = await deploy("XPAttestationResolverV01", await addr(eas), await addr(core), gov.address);
    await schemaRegistry.register(await humanRes.SCHEMA(), await addr(humanRes), true);
    const registry = await deploy("TrustedXPSourceRegistryV02", await addr(core), gov.address);
    await registry.proposePolicy(await addr(humanRes), ethers.keccak256(await ethers.provider.getCode(await addr(humanRes))), gov.address);
    await registry.activatePolicy();
    await registry.setPaused(false);
    const opGate = await deploy("EffectiveTierGateV01", await addr(core), await addr(registry));
    const token = await deploy("GFLOFixedSupplyV01", gov.address, ethers.parseEther("1000000"));
    const ignition = await deploy("GFLOIgnitionV01", await addr(core), await addr(registry), await addr(token), BURN1, BURN1 * 2n);
    await core.bindIgnition(await addr(ignition));
    await humanRes.registerRule(HUMAN_RULE, 1000, 10);
    await humanRes.setAttesterLevel(attHuman.address, 2);
    await humanRes.setRuleAttester(HUMAN_RULE, attHuman.address, true);

    // ERC-8004 + agent stack.
    const { identity, asBoot } = await deployERC8004Identity(gov);
    const binding = await deploy("AgentBindingRegistryV01", await addr(identity), await addr(core), await addr(opGate), gov.address);
    const agentRes = await deploy("AgentXPResolverV01", await addr(eas), await addr(binding), gov.address);
    await binding.setXPResolver(await addr(agentRes));
    await schemaRegistry.register(await agentRes.SCHEMA(), await addr(agentRes), true);
    const tierGate = await deploy("AgentTierGateV01", await addr(binding), await addr(agentRes), await addr(opGate));
    await agentRes.registerRule(RULE, 400, 100);
    for (const a of [attCI, attCI2]) { await agentRes.setAttesterLevel(a.address, 1); await agentRes.setRuleAttester(RULE, a.address, true); }

    await core.connect(op).createIdentity(2);   // Reformer target: may reach Tier 1
    await core.connect(op2).createIdentity(2);
    const schemaUID = await agentRes.schemaUID();
    const { chainId } = await ethers.provider.getNetwork();

    const register = async (owner) => {
      const rc = await (await identity.connect(owner)["register(string)"]("ipfs://agent")).wait();
      return event(rc, identity.interface, "Registered").args.agentId;
    };
    const setWallet = async (owner, agentId, walletSigner) => {
      const deadline = BigInt(await now()) + 120n;
      const sig = await walletSigner.signTypedData(
        { name: "ERC8004IdentityRegistry", version: "1", chainId, verifyingContract: await addr(identity) },
        { AgentWalletSet: [{ name: "agentId", type: "uint256" }, { name: "newWallet", type: "address" },
          { name: "owner", type: "address" }, { name: "deadline", type: "uint256" }] },
        { agentId, newWallet: walletSigner.address, owner: owner.address, deadline });
      await identity.connect(owner).setAgentWallet(agentId, walletSigner.address, deadline, sig);
    };
    const newBoundAgent = async (owner, walletSigner) => {
      const agentId = await register(owner);
      await setWallet(owner, agentId, walletSigner);
      await binding.connect(owner).bind(agentId);
      return agentId;
    };
    let n = 0;
    const attestTx = (attester, agentId, recipient, { rule = RULE, ev, evd, schema = schemaUID } = {}) => {
      n++;
      const data = coder.encode(["bytes32", "bytes32", "bytes32", "uint256"], [rule, id(ev || "ev" + n), id(evd || "evd" + n), agentId]);
      return eas.connect(attester).attest({ schema, data: {
        recipient, expirationTime: 0, revocable: true, refUID: ethers.ZeroHash, data, value: 0 } });
    };
    const attest = async (...args) => event(await (await attestTx(...args)).wait(), eas.interface, "Attested").args.uid;
    const promoteToTier1 = async (human) => {
      const hdata = coder.encode(["bytes32", "bytes32", "bytes32"], [HUMAN_RULE, id("h" + human.address), id("hd" + human.address)]);
      const rc = await (await eas.connect(attHuman).attest({ schema: await humanRes.schemaUID(), data: {
        recipient: human.address, expirationTime: 0, revocable: true, refUID: ethers.ZeroHash, data: hdata, value: 0 } })).wait();
      await advance(3 * DAY);
      await humanRes.finalize(event(rc, eas.interface, "Attested").args.uid);
      await token.transfer(human.address, BURN1);
      await token.connect(human).approve(await addr(ignition), BURN1);
      await ignition.connect(human).ignite();
      expect(await opGate.effectiveTier(human.address)).to.equal(1n);
    };
    return { gov, op, op2, attCI, attCI2, attHuman, w1, w2, w3, w4, buyer, outsider, humanWallet, eas, schemaRegistry,
      core, humanRes, registry, opGate, identity, asBoot, binding, agentRes, tierGate, schemaUID,
      register, setWallet, newBoundAgent, attest, attestTx, promoteToTier1 };
  }

  describe("binding", function () {
    it("deploys ERC-8004 via the official path; default wallet = owner is refused until a separate wallet is verified", async function () {
      const { op, w1, identity, binding, register, setWallet } = await setup();
      const agentId = await register(op);
      expect(agentId).to.equal(0n); // ERC-8004 agentId 0 is valid
      expect(await identity.getAgentWallet(agentId)).to.equal(op.address);
      await expect(binding.connect(op).bind(agentId)).to.be.revertedWithCustomError(binding, "InvalidAgentWallet");
      await setWallet(op, agentId, w1);
      await expect(binding.connect(op).bind(agentId)).to.emit(binding, "AgentBound").withArgs(agentId, op.address, w1.address, 1);
      expect(await binding.isActive(agentId)).to.equal(true);
      const [bound, aid, operator, epoch] = await binding.agentOfWallet(w1.address);
      expect([bound, aid, operator, epoch]).to.deep.equal([true, 0n, op.address, 1n]);
      await expect(binding.connect(op).bind(agentId)).to.be.revertedWithCustomError(binding, "AlreadyBound");
    });

    it("only the accountable NFT owner with a PIE identity may bind; wallets are unique and never human", async function () {
      const { op, op2, w1, outsider, humanWallet, core, identity, binding, register, setWallet } = await setup();
      const a = await register(op);
      await setWallet(op, a, w1);
      await identity.connect(op).setApprovalForAll(outsider.address, true);
      await expect(binding.connect(outsider).bind(a)).to.be.revertedWithCustomError(binding, "NotAgentOwner");
      const b = await register(outsider);
      await setWallet(outsider, b, w1);
      await expect(binding.connect(outsider).bind(b)).to.be.revertedWithCustomError(binding, "NoOperatorIdentity");
      await core.connect(humanWallet).createIdentity(1);
      const c = await register(op2);
      await setWallet(op2, c, humanWallet);
      await expect(binding.connect(op2).bind(c)).to.be.revertedWithCustomError(binding, "InvalidAgentWallet");
      await binding.connect(op).bind(a);
      const d = await register(op2);
      await setWallet(op2, d, w1); // ERC-8004 allows one wallet on many agents; GFLO does not
      await expect(binding.connect(op2).bind(d)).to.be.revertedWithCustomError(binding, "WalletAlreadyBound");
    });

    it("agent slots come from the operator's verified tier: 1 at Tier 0, 3 at Tier 1", async function () {
      const { op, w1, w2, w3, w4, binding, newBoundAgent, register, setWallet, promoteToTier1 } = await setup();
      await newBoundAgent(op, w1);
      const extra = await register(op);
      await setWallet(op, extra, w2);
      await expect(binding.connect(op).bind(extra)).to.be.revertedWithCustomError(binding, "SlotLimitReached").withArgs(0, 1);
      await promoteToTier1(op);
      await binding.connect(op).bind(extra);
      await newBoundAgent(op, w3);
      const fourth = await register(op);
      await setWallet(op, fourth, w4);
      await expect(binding.connect(op).bind(fourth)).to.be.revertedWithCustomError(binding, "SlotLimitReached").withArgs(1, 3);
    });
  });

  describe("reputation is not transferable", function () {
    it("NFT transfer deactivates the agent at once; a new owner starts a new epoch with zero XP", async function () {
      const { op, op2, w1, w2, outsider, attCI, identity, binding, agentRes, newBoundAgent, setWallet, attest } = await setup();
      const a = await newBoundAgent(op, w1);
      await advance(3 * DAY);
      const uid = await attest(attCI, a, w1.address);
      await advance(3 * DAY);
      await agentRes.finalize(uid);
      expect(await agentRes.totalAgentXP(a)).to.equal(400n);

      await expect(binding.connect(outsider).unbind(a)).to.be.revertedWithCustomError(binding, "NotAuthorizedToUnbind");
      await identity.connect(op).transferFrom(op.address, op2.address, a); // e.g. sold
      expect(await identity.getAgentWallet(a)).to.equal(ethers.ZeroAddress); // ERC-8004 clears it
      expect(await binding.isActive(a)).to.equal(false);
      expect(await agentRes.totalAgentXP(a)).to.equal(0n);
      await expect(attest(attCI, a, w1.address)).to.be.revertedWithCustomError(agentRes, "InactiveAgent");

      await binding.connect(outsider).unbind(a); // stale binding: anyone may free the slot
      expect(await binding.boundAgentCount(op.address)).to.equal(0n);
      await setWallet(op2, a, w2);
      await expect(binding.connect(op2).bind(a)).to.emit(binding, "AgentBound").withArgs(a, op2.address, w2.address, 2);
      expect(await agentRes.totalAgentXP(a)).to.equal(0n);  // bought agent, no bought reputation
      expect(await agentRes.agentXP(a, 1)).to.equal(400n); // history stays readable
    });

    it("changing the agent wallet also needs a rebind and a new epoch", async function () {
      const { op, w1, w2, binding, newBoundAgent, setWallet } = await setup();
      const a = await newBoundAgent(op, w1);
      await setWallet(op, a, w2);
      expect(await binding.isActive(a)).to.equal(false);
      await binding.connect(op).unbind(a);
      await binding.connect(op).bind(a);
      expect((await binding.getBinding(a)).epoch).to.equal(2n);
    });
  });

  describe("agent XP", function () {
    it("PENDING -> VALID after the challenge period; agent XP never flows into the operator's human XP", async function () {
      const { op, w1, attCI, humanRes, agentRes, newBoundAgent, attest } = await setup();
      const a = await newBoundAgent(op, w1);
      const humanBefore = await humanRes.totalXP(op.address);
      const uid = await attest(attCI, a, w1.address);
      expect((await agentRes.grants(uid)).status).to.equal(1n);
      await expect(agentRes.finalize(uid)).to.be.revertedWithCustomError(agentRes, "TooEarly");
      await advance(3 * DAY);
      await agentRes.finalize(uid);
      expect(await agentRes.totalAgentXP(a)).to.equal(400n);
      expect(await humanRes.totalXP(op.address)).to.equal(humanBefore);
    });

    it("blocks self-dealing: operator, the agent itself and sibling agents cannot attest", async function () {
      const { gov, op, op2, w1, w2, w3, agentRes, newBoundAgent, attest, attestTx, promoteToTier1 } = await setup();
      await promoteToTier1(op);
      const a = await newBoundAgent(op, w1);
      await newBoundAgent(op, w2);          // sibling
      await newBoundAgent(op2, w3);         // other operator's agent
      for (const x of [op, w1, w2, w3]) {
        await agentRes.connect(gov).setAttesterLevel(x.address, 1);
        await agentRes.connect(gov).setRuleAttester(RULE, x.address, true);
      }
      await expect(attest(op, a, w1.address)).to.be.revertedWithCustomError(agentRes, "SelfDealing");
      await expect(attest(w1, a, w1.address)).to.be.revertedWithCustomError(agentRes, "SelfDealing");
      await expect(attest(w2, a, w1.address)).to.be.revertedWithCustomError(agentRes, "SelfDealing");
      await expect(attestTx(w3, a, w1.address)).to.emit(agentRes, "GrantPending"); // independent agent may review
    });

    it("rejects wrong recipient, unlisted attesters, foreign schemas and replays", async function () {
      const { op, w1, w2, attCI, outsider, schemaRegistry, agentRes, newBoundAgent, attest } = await setup();
      const a = await newBoundAgent(op, w1);
      await expect(attest(attCI, a, w2.address)).to.be.revertedWithCustomError(agentRes, "InactiveAgent");
      await expect(attest(outsider, a, w1.address)).to.be.revertedWithCustomError(agentRes, "InvalidAttester");
      const rc = await (await schemaRegistry.register("bytes32 a,bytes32 b,bytes32 c,uint256 d,bool e", await addr(agentRes), true)).wait();
      const foreign = event(rc, schemaRegistry.interface, "Registered").args.uid;
      await expect(attest(attCI, a, w1.address, { schema: foreign })).to.be.revertedWithCustomError(agentRes, "WrongSchema");
      await attest(attCI, a, w1.address, { ev: "E", evd: "D" });
      await expect(attest(attCI, a, w1.address, { ev: "E", evd: "D2" })).to.be.revertedWithCustomError(agentRes, "Replay");
      await expect(attest(attCI, a, w1.address, { ev: "E2", evd: "D" })).to.be.revertedWithCustomError(agentRes, "Replay");
    });
  });

  describe("farming bounds that do not grow with the number of agents", function () {
    const bound = (s) => ethers.encodeBytes32String(s);

    it("a fleet of agents earns no faster per day than one agent (operator daily cap)", async function () {
      const { op, w1, w2, w3, attCI, attCI2, agentRes, newBoundAgent, attest, promoteToTier1 } = await setup();
      await promoteToTier1(op);
      const agents = [[await newBoundAgent(op, w1), w1], [await newBoundAgent(op, w2), w2], [await newBoundAgent(op, w3), w3]];
      await toWeekStart();
      await attest(attCI, agents[0][0], w1.address);
      await attest(attCI, agents[1][0], w2.address);
      await attest(attCI2, agents[2][0], w3.address); // 1200 today, each agent only 400
      await expect(attest(attCI2, agents[0][0], w1.address))
        .to.be.revertedWithCustomError(agentRes, "LimitReached").withArgs(bound("OPERATOR_DAILY"));
    });

    it("operator weekly cap holds across days, agents and attesters", async function () {
      const { gov, op, w1, w2, w3, attCI, attCI2, outsider, agentRes, newBoundAgent, attest, promoteToTier1 } = await setup();
      await promoteToTier1(op);
      await agentRes.connect(gov).setAttesterLevel(outsider.address, 1);
      await agentRes.connect(gov).setRuleAttester(RULE, outsider.address, true);
      const ag = [[await newBoundAgent(op, w1), w1], [await newBoundAgent(op, w2), w2], [await newBoundAgent(op, w3), w3]];
      const atts = [attCI, attCI2, outsider];
      await toWeekStart();
      // 7 grants x 400 = 2800 over 3 days; every agent, attester and day stays under its own cap.
      for (let i = 0; i < 7; i++) {
        if (i === 3 || i === 6) await advance(DAY);
        await attest(atts[i % 3], ag[i % 3][0], ag[i % 3][1].address);
      }
      await expect(attest(atts[1], ag[1][0], ag[1][1].address))
        .to.be.revertedWithCustomError(agentRes, "LimitReached").withArgs(bound("OPERATOR_WEEKLY"));
    });

    it("one attester cannot feed one operator beyond its weekly budget; an independent attester can", async function () {
      const { op, w1, w2, attCI, attCI2, agentRes, newBoundAgent, attest, attestTx, promoteToTier1 } = await setup();
      await promoteToTier1(op);
      const a = await newBoundAgent(op, w1);
      const b = await newBoundAgent(op, w2);
      await toWeekStart();
      await attest(attCI, a, w1.address); await attest(attCI, b, w2.address);   // 800
      await advance(DAY);
      await attest(attCI, a, w1.address);                                       // 1200
      await expect(attest(attCI, b, w2.address))
        .to.be.revertedWithCustomError(agentRes, "LimitReached").withArgs(bound("ATTESTER_OPERATOR_WEEKLY"));
      await expect(attestTx(attCI2, b, w2.address)).to.emit(agentRes, "GrantPending");
    });

    it("per-agent daily cap and per-rule claim limit still apply", async function () {
      const { gov, op, w1, attCI, attCI2, agentRes, newBoundAgent, attest } = await setup();
      const a = await newBoundAgent(op, w1);
      const R2 = id("agent.small"); await agentRes.connect(gov).registerRule(R2, 25, 2);
      await agentRes.connect(gov).setRuleAttester(R2, attCI.address, true);
      await attest(attCI, a, w1.address, { rule: R2 }); await attest(attCI, a, w1.address, { rule: R2 });
      await expect(attest(attCI, a, w1.address, { rule: R2 }))
        .to.be.revertedWithCustomError(agentRes, "LimitReached").withArgs(bound("AGENT_RULE_CLAIMS"));
      await toWeekStart();
      await attest(attCI, a, w1.address); await attest(attCI2, a, w1.address); await attest(attCI2, a, w1.address);
      await expect(attest(attCI2, a, w1.address))
        .to.be.revertedWithCustomError(agentRes, "LimitReached").withArgs(bound("AGENT_DAILY"));
    });
  });

  describe("operator accountability", function () {
    it("three fraud strikes deactivate all agents and block binding; strikes decay after 90 days", async function () {
      const { gov, op, w1, w2, attCI, attCI2, eas, schemaUID, binding, agentRes, newBoundAgent, register, setWallet, attest, promoteToTier1 } = await setup();
      await promoteToTier1(op);
      const a = await newBoundAgent(op, w1);
      const uids = [];
      for (let i = 0; i < 5; i++) { uids.push(await attest(i % 2 ? attCI2 : attCI, a, w1.address)); await advance(DAY); }
      await eas.connect(attCI).revoke({ schema: schemaUID, data: { uid: uids[0], value: 0 } }); // honest correction
      await agentRes.connect(gov).governanceRevoke(uids[1], id("DUPLICATE"), false);
      expect(await binding.liveStrikes(op.address)).to.equal(0n);
      await expect(binding.connect(op).recordStrike(op.address)).to.be.revertedWithCustomError(binding, "NotResolver");
      for (const u of uids.slice(2)) await agentRes.connect(gov).governanceRevoke(u, id("FABRICATED_EVIDENCE"), true);
      expect(await binding.isOperatorStruckOut(op.address)).to.equal(true);
      expect(await binding.isActive(a)).to.equal(false);
      const b = await register(op); await setWallet(op, b, w2);
      await expect(binding.connect(op).bind(b)).to.be.revertedWithCustomError(binding, "OperatorSuspended");
      await advance(90 * DAY);
      expect(await binding.isActive(a)).to.equal(true);
    });

    it("governance can suspend a single agent", async function () {
      const { gov, op, w1, binding, newBoundAgent } = await setup();
      const a = await newBoundAgent(op, w1);
      await expect(binding.connect(op).setSuspended(a, true, id("x"))).to.be.revertedWithCustomError(binding, "NotOwner");
      await binding.connect(gov).setSuspended(a, true, id("INCIDENT"));
      expect(await binding.isActive(a)).to.equal(false);
    });
  });

  describe("agent tier gate", function () {
    it("agent tier = min(own verified XP tier, operator tier)", async function () {
      const { op, w1, attCI, attCI2, agentRes, tierGate, newBoundAgent, attest, promoteToTier1 } = await setup();
      const a = await newBoundAgent(op, w1);
      await toWeekStart();
      const uids = [await attest(attCI, a, w1.address), await attest(attCI, a, w1.address), await attest(attCI2, a, w1.address)];
      await advance(3 * DAY);
      for (const u of uids) await agentRes.finalize(u);
      expect(await agentRes.totalAgentXP(a)).to.equal(1200n);
      expect(await tierGate.agentTier(a)).to.equal(0n);    // operator still Tier 0
      await expect(tierGate.requireAgentTier(a, 1)).to.be.revertedWithCustomError(tierGate, "InsufficientAgentTier").withArgs(0, 1);
      await promoteToTier1(op);
      expect(await tierGate.agentTier(a)).to.equal(1n);
      await expect(tierGate.requireAgentTier(a, 1)).not.to.be.reverted;
    });

    it("fails closed: resolver pause, inactive agent, and a broken ERC-8004 upgrade", async function () {
      const { gov, op, w1, attCI, eas, schemaUID, asBoot, binding, agentRes, tierGate, newBoundAgent, attest } = await setup();
      const a = await newBoundAgent(op, w1);
      const uid = await attest(attCI, a, w1.address);
      await agentRes.connect(gov).setPaused(true);
      await expect(agentRes.totalAgentXP(a)).to.be.revertedWithCustomError(agentRes, "Paused");
      await expect(tierGate.agentTier(a)).to.be.revertedWithCustomError(agentRes, "Paused");
      await expect(attest(attCI, a, w1.address)).to.be.revertedWithCustomError(agentRes, "Paused");
      await eas.connect(attCI).revoke({ schema: schemaUID, data: { uid, value: 0 } }); // withdrawal still works
      expect((await agentRes.grants(uid)).status).to.equal(3n);
      await agentRes.connect(gov).setPaused(false);

      await expect(tierGate.requireAgentTier(999, 0)).to.be.revertedWithCustomError(tierGate, "InactiveAgent");
      // The ERC-8004 owner upgrades the registry to something without ownerOf/getAgentWallet.
      const broken = await deploy(FQ + "MinimalUUPS.sol:MinimalUUPS");
      await asBoot.upgradeToAndCall(await addr(broken), "0x");
      expect(await binding.isActive(a)).to.equal(false);
      expect(await tierGate.agentTier(a)).to.equal(0n);
      await expect(tierGate.requireAgentTier(a, 0)).to.be.revertedWithCustomError(tierGate, "InactiveAgent");
    });
  });
});
