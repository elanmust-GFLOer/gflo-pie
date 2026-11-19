const { expect } = require("chai");
const { ethers, network } = require("hardhat");

// Shared deployment fixture for the agent stack (DESIGN-003): official ERC-8004 registries
// (vendored, SHA-256 pinned, deployed through the official proxy path), real EAS 1.9.0 and the
// real human stack. No mocks. Used by the Phase A and Phase B test suites.
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

async function deployERC8004Reputation(identity, asBoot) {
  // Same official path: a fresh proxy bootstrapped by MinimalUUPS, then upgraded and initialized.
  const boot = await deploy(FQ + "MinimalUUPS.sol:MinimalUUPS");
  const proxy = await deploy(FQ + "ERC1967Proxy.sol:ERC1967Proxy", await addr(boot),
    boot.interface.encodeFunctionData("initialize", [await addr(identity)]));
  const impl = await deploy(FQ + "ReputationRegistryUpgradeable.sol:ReputationRegistryUpgradeable");
  const asOwner = boot.attach(await addr(proxy)).connect(asBoot.runner);
  await asOwner.upgradeToAndCall(await addr(impl), impl.interface.encodeFunctionData("initialize", [await addr(identity)]));
  const reputation = impl.attach(await addr(proxy));
  expect(await reputation.getIdentityRegistry()).to.equal(await addr(identity));
  return { reputation, repAsOwner: asOwner };
}

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
  const { reputation, repAsOwner } = await deployERC8004Reputation(identity, asBoot);
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
    core, humanRes, registry, opGate, identity, asBoot, binding, agentRes, tierGate, schemaUID, reputation, repAsOwner,
    register, setWallet, newBoundAgent, attest, attestTx, promoteToTier1 };
}

module.exports = { setup, deploy, deployArt, deployERC8004Identity, deployERC8004Reputation, addr, now, advance,
  toWeekStart, event, coder, id, DAY, WEEK, RULE, HUMAN_RULE, FQ };
