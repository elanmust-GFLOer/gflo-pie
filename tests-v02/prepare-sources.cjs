// Copy the complete contract tree into the isolated Hardhat project.
// No source filters: future Solidity files must be compiled too.
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");

const sourceRoot = path.resolve(__dirname, "../contracts");
const fixtureRoot = path.join(__dirname, ".sources");
const targetRoot = path.join(fixtureRoot, "contracts");
const evidenceRoot = path.join(__dirname, "evidence");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

function solidityFiles(directory, prefix = "") {
  return fs.readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name, "en"))
    .flatMap((entry) => {
      const relative = path.posix.join(prefix, entry.name);
      if (entry.isSymbolicLink()) throw new Error("Source symlink is not allowed: " + relative);
      if (entry.isDirectory()) return solidityFiles(path.join(directory, entry.name), relative);
      return entry.isFile() && entry.name.endsWith(".sol") ? [relative] : [];
    });
}
const files = solidityFiles(sourceRoot);
if (files.length === 0) throw new Error("No Solidity sources found");
fs.rmSync(fixtureRoot, { recursive: true, force: true });
fs.mkdirSync(targetRoot, { recursive: true });
// Preserve every local import/resource path, not just the currently known .sol files.
fs.cpSync(sourceRoot, targetRoot, { recursive: true, dereference: false });
const copied = solidityFiles(targetRoot);
if (JSON.stringify(files) !== JSON.stringify(copied)) throw new Error("Source set differs");
const manifest = files.map((relative) => {
  const original = fs.readFileSync(path.join(sourceRoot, relative));
  const fixture = fs.readFileSync(path.join(targetRoot, relative));
  if (!original.equals(fixture)) throw new Error("Source bytes differ: " + relative);
  return { source: "contracts/" + relative, fixture: ".sources/contracts/" + relative,
    sha256: hash(original) };
});
fs.mkdirSync(evidenceRoot, { recursive: true });
fs.writeFileSync(path.join(evidenceRoot, "sources.json"),
  JSON.stringify({ contractCount: files.length, sources: manifest }, null, 2) + "\n");
console.log("Prepared " + files.length + " byte-identical Solidity sources.");
