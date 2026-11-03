// Submits Etherscan (API v2) source verification for every contract in deployments/sepolia-v02.json.
//   ETHERSCAN_API_KEY=... node verify.mjs
// Without an API key it writes out/verify/<Contract>.json + instructions for the Etherscan web form.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { build, COMPILER } from "./build.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const recordPath = process.argv[2] || path.join(here, "deployments", "sepolia-v02.json");
const record = JSON.parse(fs.readFileSync(recordPath, "utf8"));
const { input } = build();
const key = process.env.ETHERSCAN_API_KEY;
const api = `https://api.etherscan.io/v2/api?chainid=${record.chainId}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const outDir = path.join(here, "out", "verify");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "standard-json-input.json"), JSON.stringify(input));

for (const [name, c] of Object.entries(record.contracts)) {
  const contractname = `${c.source}:${name}`;
  fs.writeFileSync(path.join(outDir, `${name}.txt`),
    `Address: ${c.address}\nCompiler type: Solidity (Standard-Json-Input)\nCompiler: ${COMPILER}\n` +
    `License: MIT\nContract name: ${contractname}\nFile: standard-json-input.json\nConstructor args (ABI-encoded):\n${c.constructorArgs}\n`);
  if (!key) continue;
  const body = new URLSearchParams({
    apikey: key, module: "contract", action: "verifysourcecode",
    codeformat: "solidity-standard-json-input", sourceCode: JSON.stringify(input),
    contractaddress: c.address, contractname, compilerversion: COMPILER,
    constructorArguements: c.constructorArgs, licenseType: "3",
  });
  const res = await (await fetch(api, { method: "POST", body })).json();
  if (res.status !== "1") {
    console.log(`${name}: ${res.result}`);
    continue;
  }
  let status;
  for (let i = 0; i < 12; i++) {
    await sleep(5000);
    status = await (await fetch(`${api}&module=contract&action=checkverifystatus&guid=${res.result}&apikey=${key}`)).json();
    if (!String(status.result).startsWith("Pending")) break;
  }
  console.log(`${name}: ${status.result}`);
}
if (!key) console.log(`Nincs ETHERSCAN_API_KEY. Kezi verifikaciohoz: ${path.relative(process.cwd(), outDir)}/<Contract>.txt`);
