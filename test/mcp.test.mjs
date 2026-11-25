import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fakeServer, T } from "./fake.mjs";

const f = await fakeServer();
test.after(() => f.close());

function start(entry) {
  const p = spawn(process.execPath, entry, { env: { ...process.env, DONECHECK_URL: f.url } });
  const lines = []; let buf = "";
  p.stdout.on("data", (c) => { buf += c; let i; while ((i = buf.indexOf("\n")) >= 0) { lines.push(JSON.parse(buf.slice(0, i))); buf = buf.slice(i + 1); } });
  const ask = (m) => p.stdin.write((typeof m === "string" ? m : JSON.stringify({ jsonrpc: "2.0", ...m })) + "\n");
  const waitFor = async (id) => { for (let k = 0; k < 250; k++) { const r = lines.find((l) => l.id === id); if (r) return r; await new Promise((r) => setTimeout(r, 20)); } throw new Error("no reply " + id); };
  return { p, ask, waitFor, lines };
}

for (const [label, entry] of [["mcp.mjs", ["mcp.mjs"]], ["cli.mjs mcp (the npx entry)", ["cli.mjs", "mcp"]]]) {
  test(`MCP stdio via ${label}: handshake, tools/list, tools/call, errors`, async () => {
    const s = start(entry.map((e, i) => (i === 0 ? new URL(`../${e}`, import.meta.url).pathname : e)));
    s.ask({ id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } });
    const init = (await s.waitFor(1)).result;
    assert.equal(init.serverInfo.name, "donecheck"); assert.equal(init.protocolVersion, "2025-06-18"); assert.ok(init.capabilities.tools);
    s.ask({ method: "notifications/initialized" });
    s.ask({ id: 2, method: "tools/list" });
    const tools = (await s.waitFor(2)).result.tools;
    assert.equal(tools.length, 1); assert.equal(tools[0].name, "done_check"); assert.deepEqual(tools[0].inputSchema.required, ["task", "result"]);
    s.ask({ id: 3, method: "tools/call", params: { name: "done_check", arguments: { task: T, result: "s.length > 12" } } });
    const r = (await s.waitFor(3)).result;
    assert.match(r.content[0].text, /^FIX: judge: fails[\s\S]*Do not say done/); assert.equal(r.structuredContent.verdict, "FIX"); assert.equal(r.isError, false);
    assert.equal(f.state.seen.at(-1).client, "donecheck-mcp/0.1.0");
    s.ask({ id: "s", method: "tools/call", params: { name: "done_check", arguments: { task: T, result: "s.length >= 12" } } });
    assert.equal((await s.waitFor("s")).result.structuredContent.verdict, "SUBMIT");
    s.ask({ id: 4, method: "tools/call", params: { name: "done_check", arguments: { task: "" } } });
    assert.equal((await s.waitFor(4)).result.isError, true);
    s.ask({ id: 5, method: "tools/call", params: { name: "nope", arguments: {} } });
    assert.equal((await s.waitFor(5)).error.code, -32602);
    s.ask({ id: 6, method: "resources/list" });
    assert.equal((await s.waitFor(6)).error.code, -32601);
    s.ask({ id: 7, method: "ping" }); assert.deepEqual((await s.waitFor(7)).result, {});
    s.ask("{not json"); await new Promise((r) => setTimeout(r, 100));
    assert.ok(s.lines.some((l) => l.error?.code === -32700));
    s.p.kill();
  });
}
