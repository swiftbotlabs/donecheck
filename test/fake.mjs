// A fake hosted done-check: same request/response shapes as the real Worker, no network, no funds.
import http from "node:http";
export async function fakeServer() {
  const state = { mode: "ok", seen: [] };
  const srv = http.createServer((req, res) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => {
    state.seen.push({ path: req.url, client: req.headers["x-donecheck-client"], body: b });
    res.setHeader("content-type", "application/json");
    if (req.url === "/api/stats") return res.end(JSON.stringify({ checks: 7, judged: 6, days: {}, clients: { "donecheck-js": 3 } }));
    if (state.mode === "limit") { res.writeHead(429); return res.end('{"error":"this connection has used its 5 checks for today (UTC)"}'); }
    if (state.mode === "weird") return res.end('{"verdict":"OK"}');
    if (state.mode === "html") { res.setHeader("content-type", "text/html"); return res.end("<h1>502</h1>"); }
    if (state.mode === "slow") return; // never answers
    const { result, mustInclude = [] } = JSON.parse(b);
    const bad = /> 12/.test(result), missing = mustInclude.filter((m) => !result.includes(m));
    res.end(JSON.stringify({ verdict: bad || missing.length ? "FIX" : "SUBMIT", reasons: [bad ? "judge: fails. uses > instead of >=" : "judge: satisfies"], missing,
      receipt: { receipt_hash: "0x" + "ab".repeat(32), epoch_id: 45, intent: "TASK_EXECUTION_QUALITY_GENERAL", amount_uusdc: 10000 } }));
  }); });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  return { state, url: `http://127.0.0.1:${srv.address().port}`, close: () => { srv.closeAllConnections?.(); srv.close(); } };
}
export const T = "Write a one-line JavaScript expression that is true when the string s has at least 12 characters.";
