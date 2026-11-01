// RT5-19: strict classifier for a single child process and its stage-scoped oracle event.
// Never infer KILLED from generic AssertionError text, stderr patterns or compiler failure.
"use strict";
const ORACLES = Object.freeze({
  M1_NO_ATTESTOR_SIGNATURE: Object.freeze({
    actual: "1", expected: "0", code: "ERR_ASSERTION", operator: "strictEqual",
    messagePattern: /^tx receipt status for verifier nonce [0-9]+$/
  }),
  M2_SKIP_VALID_XP_SUBTRACTION: Object.freeze({
    actual: "5025", expected: "3025", code: "ERR_ASSERTION", operator: "strictEqual",
    messagePattern: /^Expected values to be strictly equal:$/
  }),
  M3_BYPASS_EFFECTIVE_TIER: Object.freeze({
    actual: "1", expected: "0", code: "ERR_ASSERTION", operator: "strictEqual",
    messagePattern: /^tx receipt status for alice nonce [0-9]+$/
  })
});
function evaluate(id, run) {
  const oracle = ORACLES[id];
  if (!oracle) throw Error("Unknown RT5-19 mutant: " + id);

  // The child owns stdout. Stderr is diagnostic-only and may never supply
  // evidence. Unexpected stderr also invalidates an apparently valid kill.
  const stdout = String(run.stdout || "");
  const stderr = String(run.stderr || "");
  const lines = stdout.split(/\r?\n/);
  const sourceMark = "RT519_MUTATED_SOURCE=" + id;
  const compiledMark = "RT519_COMPILED_OK=" + id;
  const targetMark = "RT519_TARGET_REACHED=" + id;
  const eventPrefix = "RT519_ORACLE_EVENT=";
  // S0 -> S1 SOURCE, S1 -> S2 COMPILED, S2 -> S3 TARGET,
  // S3 -> S4 EVENT. Normal test output is allowed ONLY in S2.
  let phase = 0, bad = false, parsed = null, eventCount = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("RT519_")) {
      if (phase === 0 && line === sourceMark) phase = 1;
      else if (phase === 1 && line === compiledMark) phase = 2;
      else if (phase === 2 && line === targetMark) phase = 3;
      else if (phase === 3 && line.startsWith(eventPrefix)) {
        eventCount++;
        try { parsed = JSON.parse(line.slice(eventPrefix.length)); }
        catch { bad = true; }
        phase = 4;
      } else {
        if (line.startsWith(eventPrefix)) eventCount++;
        bad = true;
      }
    } else if (phase !== 2) {
      // No output between target and the exact assertion event, or after
      // the event: a late TypeError or an extra unrelated assertion is INVALID.
      bad = true;
    }
  }

  const sourceLoaded = phase >= 1;
  const compiled = phase >= 2;
  const reached = phase >= 3;
  const keys = ["actual", "code", "expected", "id", "message", "operator"];
  const matching = Boolean(phase === 4 && parsed &&
    !Array.isArray(parsed) &&
    Object.keys(parsed).sort().join(",") === keys.join(",") &&
    parsed.id === id &&
    parsed.code === oracle.code &&
    parsed.operator === oracle.operator &&
    parsed.actual === oracle.actual &&
    parsed.expected === oracle.expected &&
    typeof parsed.message === "string" &&
    oracle.messagePattern.test(parsed.message));
  let status;
  if (run.error || run.signal || stderr.trim() || bad || !sourceLoaded ||
      !compiled || !reached || eventCount > 1) status = "INVALID";
  else if (run.status === 97 && matching) status = "KILLED";
  else if (run.status === 0 && phase === 3 && eventCount === 0) status = "SURVIVED";
  else status = "INVALID";
  return {status, sourceLoaded, compiled, reached, matching,
    eventCount, sequenceValid: !bad, stdoutOnly: !stderr.trim(),
    exitCode:run.status, signal:run.signal || null,
    executionError:run.error ? String(run.error) : null,
    oracle:matching ? parsed : null};
}
module.exports = {evaluate, ORACLES};
