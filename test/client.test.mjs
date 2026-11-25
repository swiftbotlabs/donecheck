import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fakeServer, T } from "./fake.mjs";

const f = await fakeServer();
process.env.DONECHECK_URL = f.url;
const { doneCheck, stats, summary, TOOL } = await import("../index.mjs");
const { aiSdkDoneCheck } = await import("../adapters/ai-sdk.mjs");
test.after(() => f.close());

test("client: SUBMIT and FIX pass through with the receipt; the client tag is sent", async () => {
  const ok = await doneCheck({ task: T, result: "s.length >= 12" });
  assert.equal(ok.verdict, "SUBMIT"); assert.match(ok.receipt.receipt_hash, /^0x(ab){32}$/);
  assert.equal(f.state.seen.at(-1).client, "donecheck-js/0.1.0");
  const fix = await doneCheck({ task: T, result: "s.length > 12" });
  assert.equal(fix.verdict, "FIX"); assert.match(summary(fix), /^FIX: judge: fails.*receipt 0x/);
  const miss = await doneCheck({ task: T, result: "s.length >= 12", mustInclude: ["s.length", "trim"] });
  assert.equal(miss.verdict, "FIX"); assert.deepEqual(miss.missing, ["trim"]); assert.match(summary(miss), /Missing: trim\./);
});
test("client fails closed: rate limit, malformed verdict, HTML error page, unreachable and timeout are all HOLD, never SUBMIT", async () => {
  for (const mode of ["limit", "weird", "html"]) {
    f.state.mode = mode; const v = await doneCheck({ task: T, result: "s.length >= 12" }); f.state.mode = "ok";
    assert.equal(v.verdict, "HOLD", mode); assert.ok(v.error, mode);
  }
  f.state.mode = "slow"; const slow = await doneCheck({ task: T, result: "s.length >= 12" }, { timeoutMs: 300 }); f.state.mode = "ok";
  assert.equal(slow.verdict, "HOLD"); assert.match(slow.error, /unreachable/);
  assert.equal((await doneCheck({ task: T, result: "x" }, { url: "http://127.0.0.1:1" })).verdict, "HOLD");
});
test("client refuses bad input before any request", async () => {
  const n = f.state.seen.length;
  await assert.rejects(doneCheck({ task: "", result: "x" }), TypeError);
  await assert.rejects(doneCheck({ task: T, result: "x".repeat(2000) }), RangeError);
  await assert.rejects(doneCheck({ task: T, result: "x", mustInclude: ["a", "b", "c", "d", "e", "f"] }), TypeError);
  assert.equal(f.state.seen.length, n);
});
test("stats reads the public counter", async () => { assert.equal((await stats()).checks, 7); });

test("Vercel AI SDK adapter: builds a tool with a zod schema and returns the verdict + next step", async () => {
  const chain = (kind) => { const o = { kind, describe: () => o, max: () => o, optional: () => o }; return o; };
  const z = { object: (shape) => ({ kind: "object", shape }), string: () => chain("string"), array: () => chain("array") };
  const t = aiSdkDoneCheck({ tool: (x) => x, z });
  assert.equal(t.description, TOOL.description); assert.deepEqual(Object.keys(t.inputSchema.shape), ["task", "result", "mustInclude"]);
  const fix = await t.execute({ task: T, result: "s.length > 12" });
  assert.equal(fix.verdict, "FIX"); assert.match(fix.next, /Do not say done/); assert.equal(f.state.seen.at(-1).client, "donecheck-ai-sdk/0.1.0");
  assert.equal((await t.execute({ task: T, result: "s.length >= 12" })).verdict, "SUBMIT");
  assert.equal((await t.execute({ task: "", result: "x" })).verdict, "HOLD");
  assert.throws(() => aiSdkDoneCheck({}), TypeError);
});

const run = (args, input) => new Promise((resolve) => {
  const p = spawn(process.execPath, [new URL("../cli.mjs", import.meta.url).pathname, ...args], { env: { ...process.env, DONECHECK_URL: f.url } });
  let out = "", err = ""; p.stdout.on("data", (c) => (out += c)); p.stderr.on("data", (c) => (err += c));
  if (input !== undefined) p.stdin.end(input); else p.stdin.end();
  p.on("close", (code) => resolve({ code, out, err }));
});
test("CLI: exit 0 on SUBMIT, 10 on FIX, 11 on HOLD, 2 on usage; reads the result from stdin", async () => {
  assert.equal((await run([T, "s.length >= 12"])).code, 0);
  const fix = await run([T, "s.length > 12"]); assert.equal(fix.code, 10); assert.match(fix.out, /^FIX:/);
  assert.equal((await run([T, "-"], "s.length >= 12\n")).code, 0);
  const j = await run(["check", T, "s.length >= 12", "--must", "length,trim", "--json"]); assert.equal(j.code, 10); assert.deepEqual(JSON.parse(j.out).missing, ["trim"]);
  f.state.mode = "limit"; assert.equal((await run([T, "s.length >= 12"])).code, 11); f.state.mode = "ok";
  assert.equal((await run([])).code, 2);
  assert.equal((await run([T, "x".repeat(2100)])).code, 2);
  const s = await run(["stats"]); assert.equal(s.code, 0); assert.equal(JSON.parse(s.out).judged, 6);
});
