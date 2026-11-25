// donecheck: ask before your agent says "done". Zero dependencies, Node 18+.
//   import { doneCheck } from "donecheck";
//   const v = await doneCheck({ task, result, mustInclude: ["total"] });
//   if (v.verdict !== "SUBMIT") { /* FIX: redo using v.reasons. HOLD: show the user your result and ask. */ }
// A paid Telegraph Miner judges the result against the task (Ethereum Sepolia escrow, test USDC, paid by the hosted service),
// and the required strings are checked for free. Every judgement comes with an on-chain receipt.
export const VERSION = "0.1.0";
export const DONECHECK_URL = (typeof process !== "undefined" && process.env?.DONECHECK_URL) || "https://donecheck.swiftbotlab.workers.dev";
export const LIMIT = 2000; // characters of task + result the judge accepts
const VERDICTS = ["SUBMIT", "FIX", "HOLD"];
const hold = (error) => ({ verdict: "HOLD", error, reasons: ["no check could be made: fail closed"], missing: [], receipt: null });

/** Checks a result against its task. Never returns SUBMIT unless the hosted check said SUBMIT: refusals, timeouts and
 *  malformed answers all come back as { verdict: "HOLD", error }. Throws only on bad input (empty, too long). */
export async function doneCheck({ task, result, mustInclude = [] } = {}, { url = DONECHECK_URL, timeoutMs = 90000, fetchImpl = globalThis.fetch, client = "js" } = {}) {
  if (typeof task !== "string" || typeof result !== "string" || !task.trim() || !result.trim()) throw new TypeError("task and result must be non-empty strings");
  if (task.trim().length + result.trim().length > LIMIT) throw new RangeError(`task + result must be at most ${LIMIT} characters (got ${task.trim().length + result.trim().length})`);
  if (!Array.isArray(mustInclude) || mustInclude.length > 5 || mustInclude.some((m) => typeof m !== "string" || !m.trim() || m.length > 100))
    throw new TypeError("mustInclude: up to 5 non-empty strings of at most 100 characters");
  let r;
  try {
    r = await fetchImpl(`${url.replace(/\/+$/, "")}/api/check`, { method: "POST",
      headers: { "content-type": "application/json", "x-donecheck-client": `donecheck-${client}/${VERSION}` },
      body: JSON.stringify({ task, result, mustInclude }), signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) { return hold(`done-check unreachable: ${e?.message || e}`); }
  let body; try { body = await r.json(); } catch { body = {}; }
  if (!r.ok || !body || !VERDICTS.includes(body.verdict)) return hold(body?.error || `HTTP ${r.status}`);
  return { missing: [], receipt: null, ...body, reasons: Array.isArray(body.reasons) ? body.reasons : [] };
}

/** Public usage counts of the hosted check (no personal data): { checks, judged, days, clients }. */
export async function stats({ url = DONECHECK_URL, fetchImpl = globalThis.fetch, timeoutMs = 15000 } = {}) {
  const r = await fetchImpl(`${url.replace(/\/+$/, "")}/api/stats`, { signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`stats: HTTP ${r.status}`);
  return r.json();
}

/** One line for a model or a log: "FIX: <reasons> (receipt 0x..)". */
export function summary(v) {
  const rec = v.receipt?.receipt_hash ? ` (receipt ${v.receipt.receipt_hash}${v.receipt.epoch_id != null ? `, epoch ${v.receipt.epoch_id}` : ""})` : "";
  const miss = v.missing?.length ? ` Missing: ${v.missing.join(", ")}.` : "";
  return `${v.verdict}: ${(v.reasons || []).join(" | ")}${miss}${rec}${v.error ? ` [${v.error}]` : ""}`;
}

/** What the model should do next, by verdict. */
export const NEXT = {
  SUBMIT: "You may tell the user it is done.",
  FIX: "Do not say done: fix the result using the reason, then call done_check again.",
  HOLD: "Do not say done: tell the user the check was unclear and show your result.",
};

/** Tool definition (JSON Schema) shared by the MCP server and the framework adapters. */
export const TOOL = {
  name: "done_check",
  description: "Call this BEFORE telling the user a task is finished. It checks the actual result against the task (a paid Telegraph Miner "
    + "judges it on testnet; required strings are checked for free) and returns SUBMIT (finish), FIX (redo using the reason) or HOLD (ask the user), with a receipt.",
  inputSchema: { type: "object", required: ["task", "result"], additionalProperties: false, properties: {
    task: { type: "string", description: "What the user asked for." },
    result: { type: "string", description: "What you produced. Task + result at most 2,000 characters." },
    mustInclude: { type: "array", items: { type: "string" }, maxItems: 5, description: "Optional strings the result must contain." } } },
};
