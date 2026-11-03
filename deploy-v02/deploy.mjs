// GFLO PIE v0.2 -> Ethereum Sepolia.
// Run on your own device (Termux). The mnemonic is read with a hidden prompt and never written to disk.
//
//   cd deploy-v02 && npm ci && node deploy.mjs
//
// Env (optional): RPC_URL, PRIVATE_KEY (instead of the mnemonic prompt), OWNER (skip the owner prompt),
//                 EXPECT_CHAIN_ID (default 11155111; set 31337 only for a local dry run), YES=1 (no confirm).
// Re-running is safe: finished steps recorded in deployments/<network>-v02.json are skipped.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";
import readlineSync from "readline-sync";
import { build, runtimeMatches, COMPILER, SETTINGS } from "./build.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

// Decided 2026-11-03 (Elan): 1,000,000,000 GFLO fixed supply; Reformer burn 5,000 / Praxis burn 10,000 GFLO.
const TOTAL_SUPPLY = ethers.parseUnits("1000000000", 18);
const TIER1_BURN = ethers.parseUnits("5000", 18);
const TIER2_BURN = ethers.parseUnits("10000", 18);

const RPC_URL = process.env.RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const EXPECT_CHAIN_ID = BigInt(process.env.EXPECT_CHAIN_ID || "11155111");
const NETWORK = EXPECT_CHAIN_ID === 11155111n ? "sepolia" : `chain-${EXPECT_CHAIN_ID}`;
const RECORD = path.join(here, "deployments", `${NETWORK}-v02.json`);

function log(...a) { console.log(...a); }
function fail(msg) { console.error("\n❌ " + msg); process.exit(1); }

const { input, artifacts } = build();
const provider = new ethers.JsonRpcProvider(RPC_URL);
const net = await provider.getNetwork();
if (net.chainId !== EXPECT_CHAIN_ID) fail(`Wrong network: chainId ${net.chainId}, expected ${EXPECT_CHAIN_ID}`);

let wallet;
if (process.env.PRIVATE_KEY) wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
else {
  const phrase = readlineSync.question("Mnemonic (rejtett): ", { hideEchoBack: true });
  wallet = ethers.Wallet.fromPhrase(phrase.trim(), provider);
}
const deployer = await wallet.getAddress();
// Track nonces locally: back-to-back transactions must not reuse a cached pending nonce.
const signer = new ethers.NonceManager(wallet);

let record = fs.existsSync(RECORD) ? JSON.parse(fs.readFileSync(RECORD, "utf8")) : null;
let owner = record?.owner || process.env.OWNER;
if (!owner) {
  owner = readlineSync.question(
    `Owner / governance cim (Safe cime, vagy Enter = deployer ${deployer}): `).trim() || deployer;
}
if (!ethers.isAddress(owner)) fail("Invalid owner address: " + owner);
owner = ethers.getAddress(owner);

const balance = await provider.getBalance(deployer);
log(`\nHalozat:   ${NETWORK} (${net.chainId})`);
log(`Deployer:  ${deployer}  egyenleg ${ethers.formatEther(balance)} ETH`);
log(`Owner:     ${owner}${owner === deployer ? "  (deployer EOA)" : ""}`);
log(`Token:     1 000 000 000 GFLO -> owner; burn 5 000 / 10 000 GFLO`);
log(`Compiler:  ${COMPILER}, optimizer ${SETTINGS.optimizer.runs}, evm ${SETTINGS.evmVersion}`);
if (owner !== deployer && (await provider.getCode(owner)) === "0x") {
  log("⚠️  Az owner cimen nincs kod (nem Safe). Ha Safe-et akartal, ellenorizd a cimet.");
}
if (balance < ethers.parseEther("0.02")) log("⚠️  Keves Sepolia ETH; a teljes telepites ~0.01-0.03 ETH lehet.");
log("\nXPPolicyV03 ownerje VEGLEGES. A token teljes mennyisege es a burn osszegek VEGLEGESEK.");
if (!process.env.YES && readlineSync.question('Indulhat? Ird be: IGEN  ') !== "IGEN") fail("Megszakitva.");

record ||= { network: NETWORK, chainId: Number(net.chainId), deployer, owner, compiler: COMPILER,
  settings: { optimizer: SETTINGS.optimizer, evmVersion: SETTINGS.evmVersion },
  parameters: { totalSupply: TOTAL_SUPPLY.toString(), tier1Burn: TIER1_BURN.toString(), tier2Burn: TIER2_BURN.toString() },
  contracts: {}, steps: {} };
if (record.owner !== owner || record.deployer !== deployer) fail("A meglevo rekord mas owner/deployer cimmel keszult: " + RECORD);
const save = () => { fs.mkdirSync(path.dirname(RECORD), { recursive: true }); fs.writeFileSync(RECORD, JSON.stringify(record, null, 2) + "\n"); };

async function deploy(name, args) {
  const prior = record.contracts[name];
  if (prior && (await provider.getCode(prior.address)) !== "0x") { log(`↷ ${name} mar telepitve: ${prior.address}`); return prior.address; }
  const a = artifacts[name];
  const factory = new ethers.ContractFactory(a.abi, a.bytecode, signer);
  log(`→ ${name} telepitese...`);
  const c = await factory.deploy(...args);
  const tx = c.deploymentTransaction();
  log(`  tx ${tx.hash}`);
  await c.waitForDeployment();
  const address = await c.getAddress();
  const onchain = await provider.getCode(address);
  if (!runtimeMatches(a, onchain)) fail(`${name}: runtime bytecode elter a forditastol`);
  record.contracts[name] = { address, tx: tx.hash, source: a.sourceName,
    constructorArgs: factory.interface.encodeDeploy(args).slice(2) };
  save();
  log(`  ✅ ${address}`);
  return address;
}
async function step(key, contractName, method, args) {
  if (record.steps[key]) { log(`↷ ${key} kesz`); return; }
  const c = new ethers.Contract(record.contracts[contractName].address, artifacts[contractName].abi, signer);
  log(`→ ${key}`);
  const tx = await c[method](...args);
  await tx.wait();
  record.steps[key] = tx.hash; save();
  log(`  ✅ ${tx.hash}`);
}
const at = (n) => new ethers.Contract(record.contracts[n].address, artifacts[n].abi, provider);

// 1. Identity core; the deployer is the one-shot binding authority (used only for bindIgnition below).
const core = await deploy("PIECoreIgnitionV01", [deployer]);
// 2. XP policy: owner is permanent (attestor/verifier rules, revocation).
const policy = await deploy("XPPolicyV03", [core, owner]);
// 3. Registry: deployer governs during setup, then hands governance to the owner.
const registry = await deploy("TrustedXPSourceRegistryV02", [core, deployer]);
// 4. Fixed-supply token; whole supply goes to the owner.
const token = await deploy("GFLOFixedSupplyV01", [owner, TOTAL_SUPPLY]);
// 5. Atomic ignition (exact burn, then tier upgrade).
const ignition = await deploy("GFLOIgnitionV01", [core, registry, token, TIER1_BURN, TIER2_BURN]);
// 6. Effective tier gate for consumers.
await deploy("EffectiveTierGateV01", [core, registry]);

await step("core.bindIgnition", "PIECoreIgnitionV01", "bindIgnition", [ignition]);
const codehash = ethers.keccak256(await provider.getCode(policy));
await step("registry.proposePolicy", "TrustedXPSourceRegistryV02", "proposePolicy", [policy, codehash, owner]);
await step("registry.activatePolicy", "TrustedXPSourceRegistryV02", "activatePolicy", []);
await step("registry.unpause", "TrustedXPSourceRegistryV02", "setPaused", [false]);
if (owner !== deployer) {
  await step("registry.proposeGovernance", "TrustedXPSourceRegistryV02", "proposeGovernance", [owner]);
}

// Post-deployment assertions (read-only).
const checks = [];
const ok = (name, cond) => { checks.push([name, cond]); log(`${cond ? "✅" : "❌"} ${name}`); };
log("\nEllenorzes:");
ok("core.ignition == GFLOIgnitionV01", (await at("PIECoreIgnitionV01").ignition()) === ignition);
ok("policy.owner == owner", (await at("XPPolicyV03").owner()) === owner);
ok("registry.activeSource == XPPolicyV03", (await at("TrustedXPSourceRegistryV02").activeSource()).policy === policy);
ok("registry nincs pause-olva", (await at("TrustedXPSourceRegistryV02").paused()) === false);
ok("token.totalSupply == 1e9 GFLO", (await at("GFLOFixedSupplyV01").totalSupply()) === TOTAL_SUPPLY);
ok("token: teljes keszlet az ownernel", (await at("GFLOFixedSupplyV01").balanceOf(owner)) === TOTAL_SUPPLY);
ok("ignition.reformerBurn == 5000 GFLO", (await at("GFLOIgnitionV01").reformerBurn()) === TIER1_BURN);
ok("ignition.praxisBurn == 10000 GFLO", (await at("GFLOIgnitionV01").praxisBurn()) === TIER2_BURN);
if (owner !== deployer) ok("registry.pendingGovernance == owner", (await at("TrustedXPSourceRegistryV02").pendingGovernance()) === owner);
record.checks = Object.fromEntries(checks);
record.completedAt = new Date().toISOString();
save();
fs.mkdirSync(path.join(here, "out"), { recursive: true });
fs.writeFileSync(path.join(here, "out/standard-json-input.json"), JSON.stringify(input));
if (checks.some(([, c]) => !c)) fail("Valamelyik ellenorzes elbukott, lasd fent.");

log(`\n🎉 Kesz. Rekord: ${path.relative(process.cwd(), RECORD)}`);
log("Kovetkezo: ETHERSCAN_API_KEY=... node verify.mjs   (vagy kuldd el a rekord fajlt Claude-nak)");
if (owner !== deployer) log("Safe-bol meg: TrustedXPSourceRegistryV02.acceptGovernance() a governance atvetelehez.");
