# donecheck in OpenClaw and Hermes Agent: results

Date: 2026-11-26. Everything ran against the live hosted server `https://donecheck.swiftbotlab.workers.dev/mcp`.
**Testnet:** each judgement is a $0.01 test-USDC payment to a Telegraph Miner from an Ethereum Sepolia escrow,
paid by the hosted service.

## Task verification run (#20)

Eight tasks with known answers were written and committed before any of them was sent
([demo/tasks.json](demo/tasks.json), commit `cc21787`, sha256 `0f0dddfe…2835`). Each has a task, the agent's
result, and what a careful reviewer would say (`expected`). The judge never sees `expected`. Five ran on
2026-11-26 (the hosted server's limit per connection per UTC day); cases 6 to 8 and one follow-up ran on 2026-11-27.

| # | Path | Kind | Expected | Verdict | Right? | Miner | Time | Receipt |
|---|---|---|---|---|---|---|---|---|
| 1 | Hermes `tool_call` | correct `is_leap` function | SUBMIT | FIX | **No** | 9002 | 9.6 s | `0xfd7a163eb82e97381ad72696a00f8e90b733d599485349d90fa1db4927508e75` |
| 2 | OpenClaw client | wrong SQL (no `SUM`/`GROUP BY`) | FIX | FIX | Yes | 302 | 6.5 s | `0x51f15e47e78387c36b9ff0e28ff06f0b5a3f11c0625c0c636e86e6c01ee2d999` |
| 3 | Hermes `tool_call` | incomplete (2 of 3 conversions) | FIX | FIX | Yes | 9002 | 11.4 s | `0x50bbd8ce63644fa5e8487dce73a4ef5bc5c31bcd416d81f4889014734acb4ba2` |
| 4 | OpenClaw client | claims done, no translation | FIX | FIX | Yes | 20260828 | 11.7 s | `0xda04765d1f2f110771217f435e69e0f37a7f32a6cf5fb1f0154192e59b0a0b01` |
| 5 | Hermes `tool_call` | regex without `^`/`$` anchors | FIX | FIX | Yes | 302 | 9.9 s | `0x6ff03168c7194607a6c181d05140c4f76e28e2671b8d14c0d2d99966ce1ac2e3` |
| 6 | OpenClaw client | correct 3-bullet summary, `mustInclude: ["502"]` | SUBMIT | SUBMIT | Yes | 71074 | 11.9 s | `0x94bde47bb96673c689eeb5f32f505c1b004a9669a1dd29ffe773649d2caf091d` (epoch 63) |
| 7 | Hermes + Gemini, model turn | wrong fact (`O(n log n)` for binary search) | FIX | FIX | Yes | 71074 | 10.3 s | `0x5a7b519a663e23b2899cc4b77784fa1e1260b835d03b6c7baa5ad972da85fbb4` (epoch 63) |
| 8 | OpenClaw client | commit message missing required `#42` | FIX | FIX | Yes | 71074 | 7.0 s | `0x19669fe3f79c327c0090ec7f927a480e2860c1215c91fb093bb14923fa3336a1` (epoch 63) |

Cases 1-5 are in epoch 58. Follow-ups (the agent fixes the result after a FIX and checks again):

| # | Path | After | Verdict | Right? | Miner | Time | Receipt (epoch 63) |
|---|---|---|---|---|---|---|---|
| 7b | Hermes + Gemini, same model turn | the model itself corrected case 7 to `O(log n)` and called the tool again | SUBMIT (score 0.9) | Yes | 71074 | 5.0 s | `0x1eaaf8815c48d79d37b5e8ea315f785728401f4aeaa60b9aad4a3941cc2e99a2` |
| 9 | OpenClaw client | case 2 SQL with `SUM` and `GROUP BY` | SUBMIT | Yes | 71074 | 8.9 s | `0x17c4cc692f9e5c2c3a1e393c92741250d28df995c81121b818962049f98b2c9d` |

Case 10 (the planned Hermes fix-and-recheck) was not run separately: case 7b is the same step, made by the model.
Case 11 (resend of the case 1 miss) was not run: the day's 5 checks were used. Both wait for another day.

**What it shows**

- **Totals over 10 judged calls (8 cases + 2 follow-ups): 9 right, 1 wrong.** 6 of 6 defective results were stopped; 3 of 4 correct results got SUBMIT; 1 correct result (case 1) was sent to FIX.
- **The first 4 defective results were stopped.** Each would otherwise have reached the user as "done". The reasons
  are specific enough to act on: "does not aggregate orders per customer", "omitting the required conversion
  for 37 C", "only states that the translation was done", "lacks start- and end-of-string anchors".
- **1 correct result was wrongly rejected (case 1).** Miner 9002 answered "The result does not provide
  the requested Python function or any code, only a statement that no work was delivered", although the
  result was the function. We saw the same reason from the same Miner on 2026-11-25 on a correct multi-line CSV
  result (gig-guard `eval/deliver/second-judge-2.jsonl`). The same Miner read the multi-line result of case 3
  correctly, so line breaks alone don't explain it. A false FIX costs the agent one retry and, under the skill,
  ends with the user seeing the result and the reason. It never lets a bad result through.
- **Case 8's FIX came from the free `mustInclude` check (`#42` missing).** The judge alone said `partially_satisfies`, which the server also treats as not a pass.
- **No defective result got SUBMIT.** On 10 calls that is a small sample. Our larger runs found the judge too
  lenient on outside data (about 4 of 10 weaker outputs passed on LLMBar; see the top-level README).
- Every judged call returned a receipt hash, and all 5 are now **settled**: on 2026-11-26 ~18:5x UTC each one was found in epoch 58's block on the
  node (`GET https://devnode.telegraphprotocol.com/v1/blocks/58/deliveries/<hash>`: intent TASK_EXECUTION_QUALITY_GENERAL, 10,000 uUSDC,
  a 9-hash proof each; settled Miner ids 6121, 6119, 6121, 5311, 6119 for cases 1-5).
- On 2026-11-26 ~18:5x UTC a further try at cases 6 and 8 came back HOLD before any payment: "this connection has used its 5 checks for
  today (UTC)". That is the hosted server's daily cap failing closed (no judgement, no charge, and the agent is told not to say done);
  cases 6-8 run after 00:00 UTC on 27 Nov.
- Spend: 10 judgements × $0.01 test USDC = $0.10 (testnet).

## A real model turn (Hermes + Gemini)

Cases 1-5 called the tool through each framework's own tool path, with no model deciding. On 2026-11-26 ~19:14 UTC
we ran one full agent turn: Hermes Agent (built from source, in the same sandbox) with the `done-check` skill loaded
and a real model (`gemini-3.5-flash-lite`, OpenAI-compatible endpoint), given the case 7 task and the wrong draft
`O(n log n)`. The model found the tool and called `mcp__donecheck__done_check` itself, with the task and the draft
verbatim. The day's cap was used up, so the server answered HOLD before any judgement, and the model did what the
skill asks: it did not say done, it showed the result and the reason, and asked the user. Transcript (role, content,
tool calls; provider signatures removed): `demo/runs/hermes-model-turn-1126-cap-hold.json`. On 2026-11-27 ~00:07 UTC case 7 ran
as this same model turn with the cap reset: the model called the tool, got FIX with the reason, corrected the answer to
`O(log n)` on its own, called the tool again, got SUBMIT, and only then answered (rows 7 and 7b above). Transcript:
`demo/runs/hermes-model-turn-1127-case7.json`.

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

## How to rerun

The hosted server allows 5 checks per connection per UTC day.

```bash
# OpenClaw path (npm i @modelcontextprotocol/client@2.4.0 first)
node integrations/test/openclaw-sdk-check.mjs --tasks integrations/demo/tasks.json --call 6,8
node integrations/test/openclaw-sdk-check.mjs --tasks integrations/demo/tasks-followup.json --call 9
# Hermes tool path (inside a Hermes checkout with the server configured)
.venv/bin/python <kit>/integrations/test/hermes-dispatch-check.py --tasks <kit>/integrations/demo/tasks.json --call 1,3,5
# Hermes model turn: hermes chat --oneshot -s done-check -q "<task, draft, check it before saying done>"
```

Still open: case 11 (resend of the case 1 miss).
