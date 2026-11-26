// Drives the hosted donecheck MCP server with the same MCP client library and transport OpenClaw uses for a
// `transport: "streamable-http"` server: @modelcontextprotocol/client 2.4.0 (pinned in openclaw 2026.11.10),
// Client.connect -> initialize, notifications/initialized, optional GET stream, tools/list, tools/call.
// It logs every HTTP request the SDK makes, so the handshake can be compared with what OpenClaw sends.
//
//   npm i @modelcontextprotocol/client@2.4.0
//   node openclaw-sdk-check.mjs                       # handshake + tools/list only (free)
//   node openclaw-sdk-check.mjs --tasks tasks.json --call 2,4   # also run done_check on those frozen cases (paid, testnet)
import { readFileSync } from "node:fs";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const URL_ = arg("--url", "https://donecheck.swiftbotlab.workers.dev/mcp");
const ids = (arg("--call", "") || "").split(",").map(Number).filter(Boolean);
const out = (o) => console.log(JSON.stringify(o));

const http = [];
const loggingFetch = async (input, init = {}) => {
  let method = "", body = "";
  try { body = typeof init.body === "string" ? JSON.parse(init.body)?.method || "" : ""; } catch {}
  method = init.method || "GET";
  const r = await fetch(input, init);
  http.push({ method, rpc: body, status: r.status, ct: (r.headers.get("content-type") || "").split(";")[0] });
  return r;
};

const transport = new StreamableHTTPClientTransport(new URL(URL_), { fetch: loggingFetch });
const client = new Client({ name: "openclaw-sdk-check", version: "0.1.0" });
await client.connect(transport, { timeout: 30000 });
out({ step: "initialize", server: client.getServerVersion(), protocol: transport.protocolVersion ?? null,
  instructions: client.getInstructions?.() ?? null });
const { tools } = await client.listTools();
out({ step: "tools/list", tools: tools.map((t) => ({ name: t.name, openclawName: `donecheck__${t.name}`, required: t.inputSchema?.required })) });

if (ids.length) {
  const cases = JSON.parse(readFileSync(arg("--tasks", "tasks.json"), "utf8")).cases;
  for (const id of ids) {
    const c = cases.find((x) => x.id === id);
    if (!c) { out({ step: "tools/call", id, error: "no such case" }); continue; }
    const t0 = Date.now();
    const r = await client.callTool({ name: "done_check", arguments: { task: c.task, result: c.result, ...(c.mustInclude?.length ? { mustInclude: c.mustInclude } : {}) } },
      { timeout: 120000 });   // OpenClaw's default MCP request timeout is 60 s; the README sets requestTimeoutMs 120000
    const v = r.structuredContent || {};
    out({ step: "tools/call", id, expected: c.expected, verdict: v.verdict ?? null, isError: !!r.isError, ms: Date.now() - t0,
      text: r.content?.[0]?.text, receipt: v.receipt ?? null, judge: v.judge ?? null, missing: v.missing ?? [], network: v.network ?? null });
  }
}
await client.close();
out({ step: "http", requests: http });
