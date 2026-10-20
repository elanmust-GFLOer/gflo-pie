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
  const output = (run.stdout || "") + "\n" + (run.stderr || "");
  const lines = output.split(/\r?\n/).map(x => x.trim());
  const counted = marker => lines.filter(x => x === marker).length === 1;
  const compiled = counted("RT519_COMPILED_OK=" + id);
  const reached = counted("RT519_TARGET_REACHED=" + id);
  const eventLines = lines.filter(x => x.startsWith("RT519_ORACLE_EVENT="));
  let parsed = null;
  if (eventLines.length === 1) {
    try { parsed = JSON.parse(eventLines[0].slice("RT519_ORACLE_EVENT=".length)); }
    catch { /* malformed oracle evidence -> INVALID */ }
  }
  const matching = Boolean(parsed &&
    parsed.id === id &&
    parsed.code === oracle.code &&
    parsed.operator === oracle.operator &&
    parsed.actual === oracle.actual &&
    parsed.expected === oracle.expected &&
    typeof parsed.message === "string" &&
    oracle.messagePattern.test(parsed.message));
  let status;
  if (run.error || run.signal || !compiled || !reached || eventLines.length > 1) status = "INVALID";
  else if (run.status === 97 && matching) status = "KILLED";
  else if (run.status === 0 && eventLines.length === 0) status = "SURVIVED";
  else status = "INVALID";
  return {status, compiled, reached, matching, eventCount:eventLines.length,
    exitCode:run.status, signal:run.signal || null, executionError:run.error ? String(run.error) : null,
    oracle:matching ? parsed : null};
}
module.exports = {evaluate, ORACLES};
