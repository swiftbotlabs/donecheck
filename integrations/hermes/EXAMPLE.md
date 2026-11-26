# Worked example: Hermes Agent, an incomplete answer caught

Recorded 2026-11-26 through Hermes Agent's own tool dispatcher (`model_tools.handle_function_call`, Hermes built
from commit `e0dcc39f` with its pinned `mcp==2.3.0`), against the hosted server. No language model was involved:
the script plays the model's part and sends the exact tool calls a model sends in a default Hermes session.
Case 3 of the frozen set [../demo/tasks.json](../demo/tasks.json); raw output in
[../demo/runs/hermes-cases3-5.jsonl](../demo/runs/hermes-cases3-5.jsonl).

**The user asks:**

> Convert these three temperatures from Celsius to Fahrenheit and give all three answers: 0 C, 37 C, 100 C.

**The agent's draft** (it dropped one of the three):

```text
0 C = 32 F
100 C = 212 F
```

**1. Find the tool.** In a default session Hermes defers MCP tools behind Tool Search. Hermes registered the
tool as `mcp__donecheck__done_check`, and:

```text
tool_search(["done_check"])                                   -> mcp__donecheck__done_check, todo_list, manage_connections
tool_search(["verify task is done before telling the user"])  -> todo_list   (done_check not found)
```

That second line is why the skill gives the agent the exact name instead of letting it search by description.

**2. Call it through the bridge:**

```json
tool_call({"calls": [{"name": "mcp__donecheck__done_check",
                      "arguments": {"task": "Convert these three temperatures ... 0 C, 37 C, 100 C.",
                                    "result": "0 C = 32 F\n100 C = 212 F"}}]})
```

**Tool result (verbatim, 11.4 s):**

```text
FIX: judge: fails (score ?). The result only provides Fahrenheit values for 0 C and 100 C, omitting the
required conversion for 37 C. (receipt 0x50bbd8ce63644fa5e8487dce73a4ef5bc5c31bcd416d81f4889014734acb4ba2, epoch 58)
Do not say done: fix the result using the reason, then call done_check again.
```

`structuredContent` adds `receipt.miner_id: "9002"`, `intent: "TASK_EXECUTION_QUALITY_GENERAL"`,
`amount_uusdc: 10000` ($0.01 test USDC) and `network: "Ethereum Sepolia escrow (testnet, test USDC)"`.

**3. What the agent does next** (per the skill): it does not say done, adds `37 C = 98.6 F`, and checks again.
That second check is case 10 in [../demo/tasks-followup.json](../demo/tasks-followup.json). It has **not been run
yet**: the hosted server allows 5 checks per connection per UTC day and that day's 5 were used on the frozen set.

**A miss in the same run.** Case 1, a correct `is_leap` function, came back `FIX` from the same Miner
(`9002`) with the reason "the result does not provide the requested Python function or any code". The skill's
Pitfalls section covers this: when a reason plainly contradicts the result, the agent shows the user both
instead of looping. Case 11 in the follow-up file resends case 1 unchanged to see whether the miss repeats.

Reproduce (inside a Hermes checkout, with the server in `$HERMES_HOME/config.yaml`):

```bash
.venv/bin/python /path/to/donecheck/integrations/test/hermes-dispatch-check.py                       # free: connect, Tool Search
.venv/bin/python /path/to/donecheck/integrations/test/hermes-dispatch-check.py \
  --tasks /path/to/donecheck/integrations/demo/tasks.json --call 3                                   # one paid check
```
