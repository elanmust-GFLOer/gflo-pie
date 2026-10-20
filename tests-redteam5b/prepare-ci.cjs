// Prepare execution-only copies of unchanged RT5B scripts for isolated CI.
// Never modify their assertions. Validate expected upstream anchors before rewriting.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const here = __dirname;
const out = path.join(here, ".generated");
const scripts = [
  ["gflo-redteam5b1-proof-tamper-revocation.mjs", "rt5b1.mjs"],
  ["gflo-redteam5b2-praxis-revocation-consumer.mjs", "rt5b2.mjs"],
  ["gflo-redteam5c-tier2-pause-consumer.mjs", "rt5c.mjs"]
];
fs.rmSync(out, {recursive: true, force: true});
fs.mkdirSync(out, {recursive: true});
const manifest = [];
for (const [srcName, dstName] of scripts) {
  const sourceFile = path.join(root, "scripts", srcName);
  const original = fs.readFileSync(sourceFile, "utf8");
  const edits = [
    ['const repo=join(homedir(),"gflo-pie"),req=createRequire(join(repo,"package.json"));',
     'const repo=path.resolve(process.cwd(),".."),req=createRequire(path.join(process.cwd(),"package.json"));'],
    ['const sources=Object.fromEntries(Object.keys(files).map(f=>[f,{content:execFileSync("git",["show","origin/feature/pie-core-v0.2:contracts/"+f],{cwd:repo,encoding:"utf8"})}]));',
     'const sources=Object.fromEntries(Object.keys(files).map(f=>[f,{content:fs.readFileSync(path.join(repo,"contracts",f),"utf8")}]));']
  ];
  let prepared = original;
  for (const [from,to] of edits) {
    if (prepared.split(from).length !== 2) throw Error(srcName + " expected anchor missing/nonunique: " + from);
    prepared = prepared.replace(from,to);
  }
  const dest = path.join(out,dstName);
  fs.writeFileSync(dest,prepared);
  const digest = value => crypto.createHash("sha256").update(value).digest("hex");
  manifest.push({source: "scripts/"+srcName, copy: "tests-redteam5b/.generated/"+dstName,
    originalSHA256: digest(original), preparedSHA256:digest(prepared), editCount:edits.length});
}
fs.mkdirSync(path.join(here,"evidence"),{recursive:true});
fs.writeFileSync(path.join(here,"evidence","source-preparation.json"),JSON.stringify({sources:manifest},null,2)+"\n");
console.log("Prepared " + manifest.length + " RT5B runners with explicit local dependency/source paths.");
