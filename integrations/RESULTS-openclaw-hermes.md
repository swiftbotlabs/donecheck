# donecheck in OpenClaw and Hermes Agent: results

Date: 2026-11-26. Everything ran against the live hosted server `https://donecheck.swiftbotlab.workers.dev/mcp`.
**Testnet:** each judgement is a $0.01 test-USDC payment to a Telegraph Miner from an Ethereum Sepolia escrow,
paid by the hosted service.

## Task verification run (#20)

Eight tasks with known answers were written and committed before any of them was sent
([demo/tasks.json](demo/tasks.json), commit `cc21787`, sha256 `0f0dddfe…2835`). Each has a task, the agent's
result, and what a careful reviewer would say (`expected`). The judge never sees `expected`. Five ran on
2026-11-26, which is the hosted server's limit per connection per UTC day. Cases 6 to 8 are still to run.

| # | Path | Kind | Expected | Verdict | Right? | Miner | Time | Receipt (epoch 58) |
|---|---|---|---|---|---|---|---|---|
| 1 | Hermes `tool_call` | correct `is_leap` function | SUBMIT | FIX | **No** | 9002 | 9.6 s | `0xfd7a163eb82e97381ad72696a00f8e90b733d599485349d90fa1db4927508e75` |
| 2 | OpenClaw client | wrong SQL (no `SUM`/`GROUP BY`) | FIX | FIX | Yes | 302 | 6.5 s | `0x51f15e47e78387c36b9ff0e28ff06f0b5a3f11c0625c0c636e86e6c01ee2d999` |
| 3 | Hermes `tool_call` | incomplete (2 of 3 conversions) | FIX | FIX | Yes | 9002 | 11.4 s | `0x50bbd8ce63644fa5e8487dce73a4ef5bc5c31bcd416d81f4889014734acb4ba2` |
| 4 | OpenClaw client | claims done, no translation | FIX | FIX | Yes | 20260828 | 11.7 s | `0xda04765d1f2f110771217f435e69e0f37a7f32a6cf5fb1f0154192e59b0a0b01` |
| 5 | Hermes `tool_call` | regex without `^`/`$` anchors | FIX | FIX | Yes | 302 | 9.9 s | `0x6ff03168c7194607a6c181d05140c4f76e28e2671b8d14c0d2d99966ce1ac2e3` |
| 6 | OpenClaw | correct 3-bullet summary, `mustInclude: ["502"]` | SUBMIT | not run | | | | |
| 7 | Hermes | wrong fact (`O(n log n)` for binary search) | FIX | not run | | | | |
| 8 | OpenClaw | commit message missing required `#42` | FIX | not run | | | | |

**What it shows**

- **4 of 4 defective results were stopped.** Each would otherwise have reached the user as "done". The reasons
  are specific enough to act on: "does not aggregate orders per customer", "omitting the required conversion
  for 37 C", "only states that the translation was done", "lacks start- and end-of-string anchors".
- **1 of 1 correct result was wrongly rejected (case 1).** Miner 9002 answered "The result does not provide
  the requested Python function or any code, only a statement that no work was delivered", although the
  result was the function. We saw the same reason from the same Miner on 2026-11-25 on a correct multi-line CSV
  result (gig-guard `eval/deliver/second-judge-2.jsonl`). The same Miner read the multi-line result of case 3
  correctly, so line breaks alone don't explain it. A false FIX costs the agent one retry and, under the skill,
  ends with the user seeing the result and the reason. It never lets a bad result through.
- **No defective result got SUBMIT.** On 5 cases that is a small sample. Our larger runs found the judge too
  lenient on outside data (about 4 of 10 weaker outputs passed on LLMBar; see the top-level README).
- Every judged call returned a receipt hash. At 03:24 UTC the node answered `no block recorded for this epoch`
  for epoch 58 (`GET https://devnode.telegraphprotocol.com/v1/blocks/58/deliveries/<hash>`): the epoch block is
  written after the epoch closes. Settlement has **not** been checked yet.
- Spend: 5 judgements × $0.01 test USDC = $0.05 (testnet).

Raw tool results: [demo/runs/](demo/runs/).

## Framework integration (#19)

| Check | OpenClaw | Hermes Agent |
|---|---|---|
| Version run | `openclaw` 2026.11.10 (6ea542f), npm, Node 24.16.0 | built from commit `e0dcc39f` (2026-11-25), `uv sync --frozen --extra mcp` |
| Add the server with the documented command or config | `openclaw mcp add ... --transport streamable-http --timeout 120`: saved and probed | `config.donecheck.yaml` as `config.yaml`: loaded |
| Connect + list tools with the framework's own command | `openclaw mcp probe` / `doctor --probe`: 1 tool, `ok` | `hermes mcp test donecheck`: connected, 1 tool |
| Name the model sees | `donecheck__done_check` | `mcp__donecheck__done_check` (behind Tool Search by default) |
| Paid `tools/call` through the framework's client | `@modelcontextprotocol/client` 2.4.0 (OpenClaw's pin): 2 calls | Hermes `handle_function_call("tool_call", ...)`, `mcp` 2.3.0: 3 calls |
| Skill loads | `done-check ✓ Ready`, visible to model | `hermes skills list`: enabled; `skill_view` loads it |
| Skill passes the framework's checks | not checked | `skills_guard`: safe, 0 findings; `skill_linter`: 0 findings |
| Control | no `transport` → SSE → probe fails with 405 | descriptive `tool_search` query misses the tool; exact name finds it |
| Full agent turn with a real model | not run (no model key) | not run (no model key) |

**Not run:** a chat turn in either framework with a real language model, so no test shows a model choosing to
call the tool because of the skill. The skill text, the tool name the model sees and the dispatch path were each
tested; the model's decision was not. `hermes mcp add` (interactive) and `hermes skills install <url>` /
the OpenClaw `curl` skill download (both fetch from GitHub) were not run.

### How the frameworks were run

Neither framework was installed on the host. Both ran inside a sandbox built from `bwrap` and `pasta`:

- Own user, PID, IPC, UTS and network namespaces; a clean environment; `/usr` and `/etc` read-only; empty
  `/home` and `/tmp`; one scratch directory read-write. No keys, no model credentials, no host home directory.
- Inside the network namespace an `nft` rule drops every outgoing packet except loopback. The only way out is a
  forwarded port to a small CONNECT proxy on the host that allows `:443` to five hosts: the npm registry, PyPI
  (2 hosts), nodejs.org and the donecheck server. Checked before use: an allowed host answered 200,
  `example.com` was refused, a direct connection to `1.1.1.1` was blocked (and answered 301 with the `nft` rule
  removed, which shows the rule is what blocks it), a host service on `127.0.0.1:9222` was unreachable, and
  `nft flush ruleset` from inside was denied.

## Pending runs

The hosted server allows 5 checks per connection per UTC day. After 00:00 UTC:

```bash
# OpenClaw path (npm i @modelcontextprotocol/client@2.4.0 first)
node integrations/test/openclaw-sdk-check.mjs --tasks integrations/demo/tasks.json --call 6,8
node integrations/test/openclaw-sdk-check.mjs --tasks integrations/demo/tasks-followup.json --call 9
# Hermes path (inside a Hermes checkout with the server configured)
.venv/bin/python <kit>/integrations/test/hermes-dispatch-check.py --tasks <kit>/integrations/demo/tasks.json --call 7
.venv/bin/python <kit>/integrations/test/hermes-dispatch-check.py --tasks <kit>/integrations/demo/tasks-followup.json --call 10
```

Case 11 (resend of the case 1 miss) is the sixth and needs another day or another connection.
