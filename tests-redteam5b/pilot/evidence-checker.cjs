// Separate checking implementation. This checks a deterministic result, not a
// remotely attested execution environment or the independence of real operators.
"use strict";
const fs = require("node:fs");
const crypto = require("node:crypto");
function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value !== null && typeof value === "object") return "{" + Object.keys(value).sort()
    .map(key => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
  if (typeof value === "number" && !Number.isSafeInteger(value)) throw Error("INVALID_NUMBER");
  if (value === undefined) throw Error("UNDEFINED_VALUE");
  return JSON.stringify(value);
}
const hash = value => "0x" + crypto.createHash("sha256").update(canonical(value)).digest("hex");
function verify(e, expected) {
  const fail = reason => { throw Error(reason); };
  if (e.version !== 1 || e.taskId !== expected.taskId || e.rule !== expected.rule ||
      e.runId !== expected.runId || e.recipient !== expected.recipient ||
      e.executorVersion !== expected.executorVersion ||
      e.workerSourceHash !== expected.workerSourceHash) fail("BINDING_MISMATCH");
  if (hash(e.input) !== expected.inputHash || e.inputHash !== expected.inputHash ||
      e.outputHash !== hash(e.output)) fail("ARTIFACT_HASH_MISMATCH");
  if (e.input.version !== 1 || !Array.isArray(e.input.entries)) fail("INVALID_INPUT");
  // Intentionally independent from the worker's filter/reduce implementation.
  const seen = new Set(), accepted = [];
  let count = 0, sum = 0n;
  for (const row of e.input.entries) {
    if (typeof row.id !== "string" || !row.id || seen.has(row.id) ||
        !Number.isSafeInteger(row.units) || row.units < 0 ||
        !["completed", "failed"].includes(row.status)) fail("INVALID_ENTRY");
    seen.add(row.id);
    if (row.status === "completed") { count++; sum += BigInt(row.units); accepted.push(row.id); }
  }
  accepted.sort();
  if (canonical(e.output) !== canonical({ acceptedIds: accepted,
      completedCount: count, totalUnits: String(sum) })) fail("WRONG_RESULT");
  return { verdict: "VALID_DETERMINISTIC_RESULT", evidenceHash: hash(e),
    limitation: "Local fixture; no live OctoPush connection or independent operator attestation." };
}
module.exports = { canonical, hash, verify };
if (require.main === module) {
  const { evidence, expected } = JSON.parse(fs.readFileSync(0, "utf8"));
  process.stdout.write(JSON.stringify(verify(evidence, expected)));
}
