// Local execution arm. No network, wallet or XP access.
"use strict";
const fs = require("node:fs");
const input = JSON.parse(fs.readFileSync(0, "utf8"));
if (input.version !== 1 || !Array.isArray(input.entries)) throw Error("INVALID_INPUT");
const ids = new Set();
for (const row of input.entries) {
  if (typeof row.id !== "string" || !row.id || ids.has(row.id) ||
      !["completed", "failed"].includes(row.status) ||
      !Number.isSafeInteger(row.units) || row.units < 0) throw Error("INVALID_ENTRY");
  ids.add(row.id);
}
const accepted = input.entries.filter(row => row.status === "completed");
const totalUnits = accepted.reduce((sum, row) => sum + BigInt(row.units), 0n);
process.stdout.write(JSON.stringify({ acceptedIds: accepted.map(row => row.id).sort(),
  completedCount: accepted.length, totalUnits: totalUnits.toString() }));
