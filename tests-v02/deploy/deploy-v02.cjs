// Canonical v0.2 Ignition-line deployment with a per-chain manifest.
//
//   Local dry run (no keys, no RPC, writes evidence/deploy-dry-run/):
//     npm run deploy:dry-run
//   Public chain (writes ../deployments/eip155-<chainId>.json):
//     RPC_URL=... DEPLOYER_KEY=... ETHERSCAN_API_KEY=... npm run deploy -- ../deployments/config/eip155-<chainId>.json
//
// The deployer key only creates contracts. It never receives a role: every
// privileged call (bindIgnition, proposePolicy, activatePolicy, ...) is written
// into the manifest as an unsigned governance call for the Safe to execute.
// The run fails unless every contract is verified on Etherscan.
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const hre = require("hardhat");
const { ethers } = hre;

const REPO = path.resolve(__dirname, "../..");
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const ORDER = [
  ["core", "PIECoreIgnitionV01"],
  ["xpPolicy", "XPPolicyV03"],
  ["registry", "TrustedXPSourceRegistryV02"],
  ["token", "GFLOFixedSupplyV01"],
  ["ignition", "GFLOIgnitionV01"],
  ["gate", "EffectiveTierGateV01"]
];

function fail(msg) { throw new Error(msg); }

function loadConfig(file, chainId) {
  const c = JSON.parse(fs.readFileSync(file, "utf8"));
  if (BigInt(c.chainId) !== chainId) fail(`Config chainId ${c.chainId} != RPC chainId ${chainId}`);
  for (const k of ["governance", "tokenRecipient"]) if (!ethers.isAddress(c[k])) fail(`Config ${k} is not an address`);
  for (const k of ["initialSupply", "tier1Burn", "tier2Burn"]) if (!/^[0-9]+$/.test(String(c[k]))) fail(`Config ${k} must be base units`);
  return c;
}

async function etherscanVerify(apiKey, chainId, address, fqn, args) {
  const [source, name] = fqn.split(":");
  const build = await hre.artifacts.getBuildInfo(fqn);
  const abi = (await hre.artifacts.readArtifact(fqn)).abi;
  const ctor = abi.find((x) => x.type === "constructor");
  const encoded = ctor ? ethers.AbiCoder.defaultAbiCoder().encode(ctor.inputs.map((i) => i.type), args).slice(2) : "";
  const base = `https://api.etherscan.io/v2/api?chainid=${chainId}`;
  const body = new URLSearchParams({ apikey: apiKey, module: "contract", action: "verifysourcecode",
    contractaddress: address, sourceCode: JSON.stringify(build.input), codeformat: "solidity-standard-json-input",
    contractname: `${source}:${name}`, compilerversion: "v" + build.solcLongVersion, constructorArguements: encoded });
  for (let attempt = 0; attempt < 6; attempt++) {
    const r = await (await fetch(base, { method: "POST", body })).json();
    if (r.status === "1") return pollVerification(base, apiKey, r.result);
    if (/already verified/i.test(r.result)) return "already-verified";
    if (!/unable to locate contractcode/i.test(r.result)) fail(`Etherscan rejected ${name}: ${r.result}`);
    await new Promise((s) => setTimeout(s, 10_000)); // indexer has not seen the bytecode yet
  }
  fail(`Etherscan never indexed ${name} at ${address}`);
}

async function pollVerification(base, apiKey, guid) {
  for (let i = 0; i < 30; i++) {
    await new Promise((s) => setTimeout(s, 5_000));
    const r = await (await fetch(`${base}&module=contract&action=checkverifystatus&guid=${guid}&apikey=${apiKey}`)).json();
    if (r.status === "1") return "verified";
    if (!/pending/i.test(r.result)) fail(`Etherscan verification failed: ${r.result}`);
  }
  fail("Etherscan verification timed out");
}

async function main() {
  const dryRun = process.env.GFLO_DRY_RUN === "1";
  await hre.run("compile", { quiet: true });

  let provider, deployer, config;
  if (dryRun) {
    if (hre.network.name !== "hardhat") fail("Dry run is local only");
    [deployer] = await ethers.getSigners();
    provider = ethers.provider;
    const governance = (await ethers.getSigners())[1];
    config = { chainId: 31337, governance: governance.address, tokenRecipient: governance.address,
      initialSupply: ethers.parseUnits("1000000", 18).toString(),
      tier1Burn: ethers.parseUnits("1", 18).toString(), tier2Burn: ethers.parseUnits("2", 18).toString(),
      _governanceSigner: governance };
  } else {
    const cfgFile = process.env.GFLO_DEPLOY_CONFIG || fail("Set GFLO_DEPLOY_CONFIG to a deployments/config/*.json file");
    for (const k of ["RPC_URL", "DEPLOYER_KEY", "ETHERSCAN_API_KEY"]) if (!process.env[k]) fail(`Missing ${k}`);
    provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    deployer = new ethers.Wallet(process.env.DEPLOYER_KEY, provider);
    config = loadConfig(cfgFile, (await provider.getNetwork()).chainId);
    if ((await provider.getCode(config.governance)) === "0x") fail("Governance must be a deployed Safe, not an EOA");
    if (config.governance.toLowerCase() === deployer.address.toLowerCase()) fail("Deployer must not be governance");
  }
  const chainId = (await provider.getNetwork()).chainId;
  const gov = config.governance;

  const out = {};
  const argsFor = {
    core: () => [gov],
    xpPolicy: () => [out.core.address, gov],
    registry: () => [out.core.address, gov],
    token: () => [config.tokenRecipient, config.initialSupply],
    ignition: () => [out.core.address, out.registry.address, out.token.address, config.tier1Burn, config.tier2Burn],
    gate: () => [out.core.address, out.registry.address]
  };
  for (const [key, name] of ORDER) {
    const fqn = `.sources/contracts/${name}.sol:${name}`;
    const factory = await ethers.getContractFactory(fqn, deployer);
    const args = argsFor[key]();
    const c = await factory.deploy(...args);
    const receipt = await c.deploymentTransaction().wait(dryRun ? 1 : 2);
    const address = await c.getAddress();
    const code = await provider.getCode(address);
    if (code === "0x") fail(`${name}: empty runtime code`);
    out[key] = { contract: name, fqn, address, constructorArgs: args.map(String),
      txHash: receipt.hash, blockNumber: receipt.blockNumber,
      runtimeCodehash: ethers.keccak256(code),
      sourceSha256: sha256(fs.readFileSync(path.join(REPO, "contracts", name + ".sol"))),
      verification: dryRun ? "skipped-local" : "pending" };
    console.log(`deployed ${name} at ${address}`);
  }

  // Privileged wiring, in order. The Safe executes these; the deployer cannot.
  const iface = async (n) => (await hre.artifacts.readArtifact(`.sources/contracts/${n}.sol:${n}`)).abi;
  const call = async (key, fn, args) => {
    const i = new ethers.Interface(await iface(out[key].contract));
    return { target: out[key].address, contract: out[key].contract, function: fn,
      args: args.map(String), data: i.encodeFunctionData(fn, args) };
  };
  const governanceCalls = [
    await call("core", "bindIgnition", [out.ignition.address]),
    await call("registry", "proposePolicy", [out.xpPolicy.address, out.xpPolicy.runtimeCodehash, gov]),
    await call("registry", "activatePolicy", []),
    await call("registry", "setPaused", [false])
  ];

  if (dryRun) {
    // Prove the calls work exactly as written, then prove the stack reads fail-closed/open as expected.
    for (const g of governanceCalls) await (await config._governanceSigner.sendTransaction({ to: g.target, data: g.data })).wait();
    const core = await ethers.getContractAt(out.core.fqn, out.core.address);
    const gate = await ethers.getContractAt(out.gate.fqn, out.gate.address);
    if ((await core.ignition()) !== out.ignition.address) fail("bindIgnition did not take effect");
    await (await core.connect(deployer).createIdentity(2)).wait();
    if ((await gate.effectiveTier(deployer.address)) !== 0n) fail("fresh identity must have effective tier 0");
    console.log("dry run: governance calls executed and EffectiveTierGate reads 0 for a fresh identity");
  } else {
    for (const { 0: key } of ORDER) {
      const v = out[key];
      v.verification = await etherscanVerify(process.env.ETHERSCAN_API_KEY, chainId, v.address, v.fqn, v.constructorArgs);
      console.log(`${v.contract}: ${v.verification}`);
    }
  }

  const build = await hre.artifacts.getBuildInfo(out.core.fqn);
  const manifest = {
    schema: "gflo-deployment-manifest/v1",
    chain: `eip155:${chainId}`,
    chainId: Number(chainId),
    status: dryRun ? "local-dry-run" : "deployed-verified-awaiting-governance",
    generatedAt: new Date().toISOString(),
    gitCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO, encoding: "utf8" }).trim(),
    compiler: { solc: build.solcLongVersion, optimizer: build.input.settings.optimizer, evmVersion: build.input.settings.evmVersion },
    deployer: deployer.address,
    governance: gov,
    parameters: { tokenRecipient: config.tokenRecipient, initialSupply: String(config.initialSupply),
      tier1Burn: String(config.tier1Burn), tier2Burn: String(config.tier2Burn) },
    contracts: out,
    governanceCalls,
    notes: [
      "runtimeCodehash is measured on this chain; immutables make it differ per chain and per deployment.",
      "XPPolicyV03 rules, verifier roles and attestors are set by governance per the Pilot Trust Policy, not by this script."
    ]
  };
  const file = dryRun
    ? path.join(__dirname, "../evidence/deploy-dry-run/eip155-31337.json")
    : path.join(REPO, "deployments", `eip155-${chainId}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`manifest: ${path.relative(REPO, file)}`);
}

main().catch((e) => { console.error(e.message || e); process.exitCode = 1; });
