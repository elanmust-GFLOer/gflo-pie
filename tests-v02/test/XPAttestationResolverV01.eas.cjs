const { expect } = require("chai");
const { ethers, network } = require("hardhat");

// XPPolicyV03 rules on the real EAS 1.9.0 contracts (prebuilt npm artifacts,
// not mocks). Covers schema binding, attester trust, replay, caps, challenge
// period, both revocation paths, pause fail-closed and Registry/Gate compatibility.
const EAS_ART = require("@ethereum-attestation-service/eas-contracts/artifacts/contracts/EAS.sol/EAS.json");
const REG_ART = require("@ethereum-attestation-service/eas-contracts/artifacts/contracts/SchemaRegistry.sol/SchemaRegistry.json");

const coder = ethers.AbiCoder.defaultAbiCoder();
const id = (s) => ethers.id(s);
const RULE = id("rule.builder.pr-merged");
const HIGH_RULE = id("rule.review.high-trust");
const DAY = 24 * 60 * 60;

async function deploy(art, signer, ...args) {
  const c = await new ethers.ContractFactory(art.abi, art.bytecode, signer).deploy(...args);
  await c.waitForDeployment();
  return c;
}

describe("XPAttestationResolverV01 — XPPolicyV03 rules on EAS", function () {
  async function setup() {
    const [owner, attester, attester2, alice, bob, relayer] = await ethers.getSigners();
    const schemaRegistry = await deploy(REG_ART, owner);
    const eas = await deploy(EAS_ART, owner, await schemaRegistry.getAddress());
    const core = await (await ethers.getContractFactory("PIECoreIgnitionV01")).deploy(owner.address);
    await core.connect(alice).createIdentity(1);
    const resolver = await (await ethers.getContractFactory("XPAttestationResolverV01")).deploy(
      await eas.getAddress(), await core.getAddress(), owner.address);
    await resolver.waitForDeployment();

    await schemaRegistry.register(await resolver.SCHEMA(), await resolver.getAddress(), true);
    const schemaUID = await resolver.schemaUID();
    expect((await schemaRegistry.getSchema(schemaUID)).uid).to.equal(schemaUID);

    await resolver.registerRule(RULE, 100, 5);
    await resolver.registerRule(HIGH_RULE, 600, 5);
    await resolver.setAttesterLevel(attester.address, 1);
    await resolver.setRuleAttester(RULE, attester.address, true);
    await resolver.setRuleAttester(HIGH_RULE, attester.address, true);

    const attest = async (signer, { recipient = alice.address, rule = RULE, ev = "e1", evd = "d1",
      revocable = true, expirationTime = 0, schema = schemaUID } = {}) => {
      const tx = await eas.connect(signer).attest({ schema, data: {
        recipient, expirationTime, revocable, refUID: ethers.ZeroHash,
        data: coder.encode(["bytes32", "bytes32", "bytes32"], [rule, id(ev), id(evd)]), value: 0 } });
      const rc = await tx.wait();
      return rc.logs.map((l) => { try { return eas.interface.parseLog(l); } catch { return null; } })
        .find((l) => l && l.name === "Attested").args.uid;
    };
    return { owner, attester, attester2, alice, bob, relayer, schemaRegistry, eas, core, resolver, schemaUID, attest };
  }

  const advance = async (s) => { await network.provider.send("evm_increaseTime", [s]); await network.provider.send("evm_mine"); };

  it("accepts an allowed attestation as PENDING, finalizes only after the challenge period", async function () {
    const { alice, resolver, attest, attester } = await setup();
    const uid = await attest(attester);
    const g = await resolver.grants(uid);
    expect(g.status).to.equal(1n);
    expect(g.attester).to.equal(attester.address);
    expect(await resolver.totalXP(alice.address)).to.equal(25n);
    await expect(resolver.finalize(uid)).to.be.revertedWithCustomError(resolver, "TooEarly");
    await advance(3 * DAY);
    await expect(resolver.finalize(uid)).to.emit(resolver, "GrantFinalized");
    expect(await resolver.totalXP(alice.address)).to.equal(125n);
    await expect(resolver.finalize(uid)).to.be.revertedWithCustomError(resolver, "BadGrantStatus");
  });

  it("rejects foreign schemas that point at this resolver", async function () {
    const { schemaRegistry, resolver, attest, attester } = await setup();
    const tx = await schemaRegistry.register("bytes32 ruleId,bytes32 eventId,bytes32 evidenceDigest,uint8 x",
      await resolver.getAddress(), true);
    const ev = (await tx.wait()).logs.map((l) => schemaRegistry.interface.parseLog(l)).find((l) => l.name === "Registered");
    await expect(attest(attester, { schema: ev.args.uid })).to.be.revertedWithCustomError(resolver, "WrongSchema");
  });

  it("enforces attester allowlist, trust level and no self-attestation", async function () {
    const { owner, alice, attester, attester2, resolver, core, attest } = await setup();
    await expect(attest(attester2)).to.be.revertedWithCustomError(resolver, "InvalidAttester");
    await expect(attest(attester, { rule: HIGH_RULE })).to.be.revertedWithCustomError(resolver, "InvalidAttester");
    await resolver.setAttesterLevel(attester.address, 2);
    await attest(attester, { rule: HIGH_RULE, ev: "hi", evd: "hi" });
    await core.connect(attester).createIdentity(1);
    await expect(attest(attester, { recipient: attester.address, ev: "self", evd: "self" }))
      .to.be.revertedWithCustomError(resolver, "InvalidAttestation");
    await resolver.setRuleAttester(RULE, attester.address, false);
    await expect(attest(attester, { ev: "x", evd: "x" })).to.be.revertedWithCustomError(resolver, "InvalidAttester");
    expect(owner.address).to.not.equal(alice.address);
  });

  it("rejects missing PIE identity, irrevocable, expiring and unknown-rule attestations", async function () {
    const { bob, attester, resolver, attest } = await setup();
    await expect(attest(attester, { recipient: bob.address })).to.be.revertedWithCustomError(resolver, "InvalidIdentity");
    await expect(attest(attester, { revocable: false })).to.be.revertedWithCustomError(resolver, "InvalidAttestation");
    const latest = (await ethers.provider.getBlock("latest")).timestamp;
    await expect(attest(attester, { expirationTime: latest + 10 * DAY })).to.be.revertedWithCustomError(resolver, "InvalidAttestation");
    await expect(attest(attester, { rule: id("nope") })).to.be.revertedWithCustomError(resolver, "InvalidRule");
  });

  it("blocks event and evidence replay", async function () {
    const { attester, resolver, attest } = await setup();
    await attest(attester, { ev: "e1", evd: "d1" });
    await expect(attest(attester, { ev: "e1", evd: "d2" })).to.be.revertedWithCustomError(resolver, "Replay");
    await expect(attest(attester, { ev: "e2", evd: "d1" })).to.be.revertedWithCustomError(resolver, "Replay");
  });

  it("enforces per-rule claim limit and daily cap", async function () {
    const { owner, attester, resolver, attest } = await setup();
    const BIG = id("rule.big");
    await resolver.connect(owner).registerRule(BIG, 400, 10);
    await resolver.setRuleAttester(BIG, attester.address, true);
    for (let i = 0; i < 3; i++) await attest(attester, { rule: BIG, ev: "b" + i, evd: "b" + i });
    await expect(attest(attester, { rule: BIG, ev: "b3", evd: "b3" })).to.be.revertedWithCustomError(resolver, "LimitReached");
    for (let i = 0; i < 5; i++) { await advance(DAY); await attest(attester, { ev: "r" + i, evd: "r" + i }); }
    await advance(DAY);
    await expect(attest(attester, { ev: "r5", evd: "r5" })).to.be.revertedWithCustomError(resolver, "LimitReached");
  });

  it("attester EAS revoke removes VALID XP; governance revoke is not double-counted", async function () {
    const { alice, attester, eas, resolver, schemaUID, attest } = await setup();
    const u1 = await attest(attester, { ev: "a", evd: "a" });
    const u2 = await attest(attester, { ev: "b", evd: "b" });
    await advance(3 * DAY);
    await resolver.finalize(u1); await resolver.finalize(u2);
    expect(await resolver.totalXP(alice.address)).to.equal(225n);

    await expect(eas.connect(attester).revoke({ schema: schemaUID, data: { uid: u1, value: 0 } }))
      .to.emit(resolver, "GrantRevoked");
    expect((await resolver.grants(u1)).status).to.equal(3n);
    expect(await resolver.totalXP(alice.address)).to.equal(125n);

    await expect(resolver.connect(alice).governanceRevoke(u2, id("fraud"))).to.be.revertedWithCustomError(resolver, "NotOwner");
    await expect(resolver.governanceRevoke(u2, ethers.ZeroHash)).to.be.revertedWithCustomError(resolver, "EmptyReason");
    await resolver.governanceRevoke(u2, id("fraud"));
    expect(await resolver.totalXP(alice.address)).to.equal(25n);
    await expect(resolver.governanceRevoke(u2, id("again"))).to.be.revertedWithCustomError(resolver, "BadGrantStatus");
    await eas.connect(attester).revoke({ schema: schemaUID, data: { uid: u2, value: 0 } });
    expect(await resolver.totalXP(alice.address)).to.equal(25n);
  });

  it("pause fails closed for new XP and reads, but still allows attester withdrawal", async function () {
    const { alice, attester, eas, resolver, schemaUID, attest } = await setup();
    const uid = await attest(attester);
    await resolver.setPaused(true);
    await expect(attest(attester, { ev: "p", evd: "p" })).to.be.revertedWithCustomError(resolver, "Paused");
    await expect(resolver.totalXP(alice.address)).to.be.revertedWithCustomError(resolver, "Paused");
    await advance(3 * DAY);
    await expect(resolver.finalize(uid)).to.be.revertedWithCustomError(resolver, "Paused");
    await eas.connect(attester).revoke({ schema: schemaUID, data: { uid, value: 0 } });
    expect((await resolver.grants(uid)).status).to.equal(3n);
  });

  it("keeps the verifier/attestor split via EAS delegated attestation", async function () {
    const { alice, attester, relayer, eas, resolver, schemaUID } = await setup();
    const domain = await eas.eip712Domain();
    const deadline = BigInt((await ethers.provider.getBlock("latest")).timestamp + 3600);
    const data = coder.encode(["bytes32", "bytes32", "bytes32"], [RULE, id("dlg"), id("dlg")]);
    const msg = { attester: attester.address, schema: schemaUID, recipient: alice.address, expirationTime: 0,
      revocable: true, refUID: ethers.ZeroHash, data, value: 0, nonce: await eas.getNonce(attester.address), deadline };
    const sig = ethers.Signature.from(await attester.signTypedData(
      { name: domain.name, version: domain.version, chainId: domain.chainId, verifyingContract: domain.verifyingContract },
      { Attest: [
        { name: "attester", type: "address" }, { name: "schema", type: "bytes32" }, { name: "recipient", type: "address" },
        { name: "expirationTime", type: "uint64" }, { name: "revocable", type: "bool" }, { name: "refUID", type: "bytes32" },
        { name: "data", type: "bytes" }, { name: "value", type: "uint256" }, { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint64" }] }, msg));
    await expect(eas.connect(relayer).attestByDelegation({ schema: schemaUID,
      data: { recipient: alice.address, expirationTime: 0, revocable: true, refUID: ethers.ZeroHash, data, value: 0 },
      signature: { v: sig.v, r: sig.r, s: sig.s }, attester: attester.address, deadline }))
      .to.emit(resolver, "GrantPending");
  });

  it("plugs into TrustedXPSourceRegistryV02 and EffectiveTierGateV01 unchanged", async function () {
    const { owner, alice, core, resolver } = await setup();
    const registry = await (await ethers.getContractFactory("TrustedXPSourceRegistryV02")).deploy(
      await core.getAddress(), owner.address);
    const code = await ethers.provider.getCode(await resolver.getAddress());
    await registry.proposePolicy(await resolver.getAddress(), ethers.keccak256(code), owner.address);
    await registry.activatePolicy();
    await registry.setPaused(false);
    const gate = await (await ethers.getContractFactory("EffectiveTierGateV01")).deploy(
      await core.getAddress(), await registry.getAddress());
    expect(await registry.totalXP(alice.address)).to.equal(25n);
    await expect(gate.requireEffectiveTier(alice.address, 0)).not.to.be.reverted;
    await resolver.setPaused(true);
    await expect(gate.effectiveTier(alice.address)).to.be.revertedWithCustomError(resolver, "Paused");
  });
});
