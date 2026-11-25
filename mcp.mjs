// MCP server (stdio transport, newline-delimited JSON-RPC 2.0, no dependencies) with one tool: done_check.
//   Claude Code:  claude mcp add done-check -- npx -y github:swiftbotlabs/donecheck mcp
//   Claude Desktop / Cursor: { "mcpServers": { "done-check": { "command": "npx", "args": ["-y", "github:swiftbotlabs/donecheck", "mcp"] } } }
import readline from "node:readline";
import { doneCheck, summary, NEXT, TOOL, VERSION } from "./index.mjs";

export function serve({ input = process.stdin, output = process.stdout, check = doneCheck } = {}) {
  const send = (msg) => output.write(JSON.stringify(msg) + "\n");
  const rl = readline.createInterface({ input });
  rl.on("line", async (line) => {
    if (!line.trim()) return;
    let m; try { m = JSON.parse(line); } catch { return send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }); }
    const hasId = m.id !== undefined && m.id !== null;
    const reply = (result) => hasId && send({ jsonrpc: "2.0", id: m.id, result });
    const fail = (code, message) => hasId && send({ jsonrpc: "2.0", id: m.id, error: { code, message } });
    switch (m.method) {
      case "initialize":
        return reply({ protocolVersion: m.params?.protocolVersion || "2025-06-18", capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "donecheck", version: VERSION },
          instructions: "Never tell the user a task is done without a SUBMIT from done_check. On FIX, redo it; on HOLD, show the result and ask." });
      case "ping": return reply({});
      case "tools/list": return reply({ tools: [TOOL] });
      case "tools/call": {
        if (m.params?.name !== TOOL.name) return fail(-32602, `unknown tool: ${m.params?.name}`);
        const a = m.params.arguments || {};
        try {
          const v = await check({ task: a.task, result: a.result, mustInclude: Array.isArray(a.mustInclude) ? a.mustInclude : [] }, { client: "mcp" });
          return reply({ content: [{ type: "text", text: `${summary(v)}\n${NEXT[v.verdict]}` }], structuredContent: v, isError: false });
        } catch (e) { return reply({ content: [{ type: "text", text: `Input error: ${e.message}. Fix the arguments and call done_check again.` }], isError: true }); }
      }
      default:
        if (typeof m.method === "string" && m.method.startsWith("notifications/")) return;
        return fail(-32601, `method not found: ${m.method}`);
    }
  });
  return rl;
}

if (import.meta.url === `file://${process.argv[1]}`) serve();
