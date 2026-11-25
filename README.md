# donecheck

**Ask before your agent says "done".** `donecheck` sends the task and the agent's actual result to a paid
[Telegraph](https://telegraphprotocol.com) Miner. The Miner judges whether the result does what was asked.
Strings you require are checked for free. You get back one of three verdicts and an on-chain receipt:

| Verdict | Meaning | What the agent should do |
|---|---|---|
| `SUBMIT` | The result satisfies the task | Tell the user it is done |
| `FIX` | The judge says it fails, or a required string is missing | Redo it using the reason, then check again |
| `HOLD` | No clear answer (judge unsure, check unreachable, limit reached) | Show the result and ask the user |

It fails closed. A refusal, a timeout or a malformed answer is `HOLD`, never `SUBMIT`.
There are no dependencies and no wallet or key to set up. The hosted check pays the Miner from its own testnet escrow.

![done-checks run](https://img.shields.io/endpoint?url=https%3A%2F%2Fdonecheck.swiftbotlab.workers.dev%2Fapi%2Fbadge)

## 30-second start

Try it with no install at all:

```bash
curl -s https://donecheck.swiftbotlab.workers.dev/api/check \
  -H 'content-type: application/json' \
  -d '{"task":"Write a JS expression that is true when string s has at least 12 characters.","result":"s.length > 12"}'
# -> {"verdict":"FIX","reasons":["judge: fails. ..."],"receipt":{"receipt_hash":"0x...","epoch_id":...}, ...}
```

**Remote MCP, nothing to install.** Add this URL as an MCP server (Streamable HTTP) in any client that takes one:

```
https://donecheck.swiftbotlab.workers.dev/mcp
```

```bash
claude mcp add --transport http done-check https://donecheck.swiftbotlab.workers.dev/mcp
```

**Claude Code** (local MCP over stdio):

```bash
claude mcp add done-check -- npx -y github:swiftbotlabs/donecheck mcp
```

**Claude Desktop, Cursor and other MCP clients:**

```json
{ "mcpServers": { "done-check": { "command": "npx", "args": ["-y", "github:swiftbotlabs/donecheck", "mcp"] } } }
```

The server exposes one tool, `done_check(task, result, mustInclude?)`.
It also tells the model never to claim "done" without a `SUBMIT`.

**CLI** (exit 0 only on `SUBMIT`, so it works as a gate in scripts and CI):

```bash
npx -y github:swiftbotlabs/donecheck "Summarise the report in 3 bullets" "$(cat summary.md)" --must "Revenue"
echo "$RESULT" | npx -y github:swiftbotlabs/donecheck "$TASK" -      # exit 0 SUBMIT, 10 FIX, 11 HOLD
```

## In code

**JavaScript / TypeScript** (Node 18+, Bun, Deno):

```bash
npm i github:swiftbotlabs/donecheck
```

```js
import { doneCheck } from "donecheck";
const v = await doneCheck({ task, result, mustInclude: ["total"] });
if (v.verdict !== "SUBMIT") { /* FIX: redo with v.reasons. HOLD: ask the user. */ }
```

**Vercel AI SDK** ([full example](examples/vercel-ai-sdk.mjs)):

```js
import { tool } from "ai"; import { z } from "zod";
import { aiSdkDoneCheck } from "donecheck/ai-sdk";
const tools = { done_check: aiSdkDoneCheck({ tool, z }) };
```

**Plain tool loop**, with no framework: see [examples/tool-loop.mjs](examples/tool-loop.mjs) (Anthropic Messages API, fetch only).

**Python** (3.9+, standard library only):

```bash
pip install "donecheck @ git+https://github.com/swiftbotlabs/donecheck#subdirectory=python"
```

```python
from donecheck import done_check
v = done_check(task, result, must_include=["total"])
```

- **LangChain / LangGraph:** `from donecheck.integrations import langchain_tool`, then `tools=[langchain_tool()]`.
  See the [example](python/examples/langchain_agent.py).
- **OpenAI Agents SDK:** `from donecheck.integrations import openai_agents_tool`, then `tools=[openai_agents_tool()]`.
  See the [example](python/examples/openai_agents.py).
- **Any other loop:** `donecheck.integrations.check_for_model(task, result)` returns the line to send back as the tool result.

## Limits of the hosted check

- It runs on testnet: Ethereum Sepolia escrow, test USDC. Receipts are real on that network.
- Task + result: at most 2,000 characters (the judge's limit). Up to 5 `mustInclude` strings.
- 5 checks per connection per UTC day. The hosted service also has a small shared daily budget.
  When either runs out you get `HOLD` with the reason, never a silent pass.
- Your task and result are sent to a Telegraph Miner to be judged. Don't send secrets or personal data.
  The hosted service keeps counts only: no task text, no IP address.
- For your own volume, run the same gate on your own escrow: see the
  [Gig Guard tutorial](https://github.com/swiftbotlabs/gig-guard/blob/main/docs/TUTORIAL-done-check.md).

## How good is the judge?

We measured the same decision on a 40-case known-answer set (20 correct deliverables, 20 with planted defects), over 3 runs.
In all 3 runs no defective deliverable got `SUBMIT`. Unclear cases became `HOLD`.
That set is ours. On 20 cases we did not write ([LLMBar](https://github.com/princeton-nlp/LLMBar), frozen before the run) the judge was too lenient: it submitted about 4 of 10 weaker outputs per run (range 3-5 over 3 runs), and some cases got no Miner answer ([outsider results](https://github.com/swiftbotlabs/gig-guard/blob/main/eval/deliver/outsider/RESULTS.md)). Treat `SUBMIT` as a strong hint, not proof, and keep a human on anything that matters.
The method, the misses and every receipt are in
[gig-guard/eval/deliver/RESULTS.md](https://github.com/swiftbotlabs/gig-guard/blob/main/eval/deliver/RESULTS.md).

## Public usage counter

`GET https://donecheck.swiftbotlab.workers.dev/api/stats` returns counts only: checks run, paid judgements, checks per day
and checks per integration (`mcp-remote`, `mcp`, `py`, `langchain`, ...). The badge above reads `/api/badge`. The counts include our own test runs.

## Tests

```bash
npm test     # 8 Node tests (client, CLI, MCP stdio, AI SDK adapter) + 8 Python tests, against a fake hosted check
```

MIT licensed. Issues and pull requests are welcome.
