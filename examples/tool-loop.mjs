// No framework: the done_check tool in a plain Anthropic Messages tool loop (fetch only). ANTHROPIC_API_KEY=... node examples/tool-loop.mjs
import { doneCheck, summary, NEXT, TOOL } from "donecheck";

const tools = [{ name: TOOL.name, description: TOOL.description, input_schema: TOOL.inputSchema }];
const messages = [{ role: "user", content: "Write a one-line JavaScript expression that is true when the string s has at least 12 characters." }];
const system = "Never tell the user a task is done without a SUBMIT from done_check. On FIX, redo it and check again. On HOLD, show your result and say the check was unclear.";
for (let turn = 0; turn < 6; turn++) {
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: process.env.MODEL || "claude-sonnet-5-5", max_tokens: 1024, system, tools, messages }) }).then((x) => x.json());
  messages.push({ role: "assistant", content: r.content });
  const calls = (r.content || []).filter((b) => b.type === "tool_use" && b.name === "done_check");
  if (!calls.length) { console.log((r.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n")); break; }
  const results = [];
  for (const c of calls) {
    let text; try { const v = await doneCheck(c.input, { client: "loop" }); text = `${summary(v)}\n${NEXT[v.verdict]}`; } catch (e) { text = `Input error: ${e.message}`; }
    console.error("done_check ->", text.split("\n")[0]);
    results.push({ type: "tool_result", tool_use_id: c.id, content: text });
  }
  messages.push({ role: "user", content: results });
}
