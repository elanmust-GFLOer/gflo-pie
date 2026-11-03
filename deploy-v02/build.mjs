// Deterministic solc build of the canonical PIE v0.2 line.
// Produces a single Solidity standard-json input that is reused verbatim for Etherscan verification.
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const solc = require("solc");
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..");

export const CONTRACTS = [
  "GFLOFixedSupplyV01",
  "PIECoreIgnitionV01",
  "XPPolicyV03",
  "TrustedXPSourceRegistryV02",
  "GFLOIgnitionV01",
  "EffectiveTierGateV01",
];
export const COMPILER = "v0.8.34+commit.80d5c536";
// Same settings as the signed EVM test suites (tests-redteam5b).
export const SETTINGS = {
  optimizer: { enabled: true, runs: 200 },
  evmVersion: "cancun",
  outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object", "evm.deployedBytecode.immutableReferences"] } },
};

function resolveImport(name) {
  if (name.startsWith("@openzeppelin/")) return require.resolve(name);
  return path.join(repo, name);
}

/// Compare on-chain runtime code with the compiled runtime, ignoring only the byte ranges
/// that solc reserves for immutables (filled in by the constructor).
export function runtimeMatches(artifact, onchainHex) {
  const a = Buffer.from(artifact.deployedBytecode.slice(2), "hex");
  const b = Buffer.from(onchainHex.slice(2), "hex");
  if (a.length !== b.length) return false;
  for (const refs of Object.values(artifact.immutableReferences)) {
    for (const { start, length } of refs) { a.fill(0, start, start + length); b.fill(0, start, start + length); }
  }
  return a.equals(b);
}

export function build() {
  if (!solc.version().startsWith("0.8.34+commit.80d5c536")) {
    throw new Error("Wrong solc: " + solc.version());
  }
  // Collect the full source closure so the standard-json input is self-contained.
  const sources = {};
  const queue = CONTRACTS.map((c) => `contracts/${c}.sol`);
  while (queue.length) {
    const unit = queue.shift();
    if (sources[unit]) continue;
    const content = fs.readFileSync(resolveImport(unit), "utf8");
    sources[unit] = { content };
    for (const m of content.matchAll(/^\s*import\s+(?:[^"']*from\s+)?["']([^"']+)["']/gm)) {
      let dep = m[1];
      if (dep.startsWith(".")) dep = path.posix.normalize(path.posix.join(path.posix.dirname(unit), dep));
      queue.push(dep);
    }
  }
  const input = { language: "Solidity", sources, settings: SETTINGS };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors || []).filter((e) => e.severity === "error");
  if (errors.length) throw new Error(errors.map((e) => e.formattedMessage).join("\n"));
  const artifacts = {};
  for (const name of CONTRACTS) {
    const c = output.contracts[`contracts/${name}.sol`][name];
    artifacts[name] = {
      sourceName: `contracts/${name}.sol`,
      abi: c.abi,
      bytecode: "0x" + c.evm.bytecode.object,
      deployedBytecode: "0x" + c.evm.deployedBytecode.object,
      immutableReferences: c.evm.deployedBytecode.immutableReferences || {},
    };
  }
  return { input, artifacts };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { input, artifacts } = build();
  fs.mkdirSync(path.join(here, "out"), { recursive: true });
  fs.writeFileSync(path.join(here, "out/standard-json-input.json"), JSON.stringify(input, null, 1));
  for (const [n, a] of Object.entries(artifacts)) {
    console.log(`${n.padEnd(28)} ${((a.bytecode.length - 2) / 2).toString().padStart(6)} bytes creation`);
  }
  console.log("Sources in closure:", Object.keys(input.sources).length);
}
