#!/usr/bin/env node
// donecheck "<task>" "<result>" [--must a,b]   check (exit 0 only on SUBMIT; 10 FIX; 11 HOLD; 2 usage). Use - for the result to read stdin.
// donecheck mcp                                 run the MCP stdio server
// donecheck stats                               public usage counts of the hosted check
import { doneCheck, stats, summary, VERSION } from "./index.mjs";

const USAGE = `donecheck ${VERSION}
  donecheck "<task>" "<result>" [--must a,b] [--json]   exit 0 SUBMIT, 10 FIX, 11 HOLD
  echo "<result>" | donecheck "<task>" -                read the result from stdin
  donecheck mcp                                         MCP server (stdio) with the done_check tool
  donecheck stats                                       public usage counts`;

async function main(argv) {
  if (argv[0] === "mcp") { const { serve } = await import("./mcp.mjs"); serve(); return null; }
  if (argv[0] === "stats") { console.log(JSON.stringify(await stats(), null, 2)); return 0; }
  if (argv[0] === "check") argv = argv.slice(1);
  const asJson = argv.includes("--json"); argv = argv.filter((a) => a !== "--json");
  let must = []; const mi = argv.indexOf("--must");
  if (mi >= 0) { must = (argv[mi + 1] || "").split(",").map((x) => x.trim()).filter(Boolean); argv.splice(mi, 2); }
  let [task, result] = argv;
  if (!task || !result || ["-h", "--help"].includes(task)) { console.error(USAGE); return 2; }
  if (result === "-") { let s = ""; for await (const c of process.stdin) s += c; result = s; }
  let v; try { v = await doneCheck({ task, result, mustInclude: must }, { client: "cli" }); } catch (e) { console.error(`donecheck: ${e.message}`); return 2; }
  console.log(asJson ? JSON.stringify(v, null, 2) : summary(v));
  return { SUBMIT: 0, FIX: 10, HOLD: 11 }[v.verdict];
}

const code = await main(process.argv.slice(2));
if (code !== null) process.exit(code);
