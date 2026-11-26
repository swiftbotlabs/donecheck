# Worked example: OpenClaw, a wrong SQL answer caught

Recorded 2026-11-26 with OpenClaw's MCP client library (`@modelcontextprotocol/client` 2.4.0, the version
openclaw 2026.11.10 pins) against the hosted server. Case 2 of the frozen set
[../demo/tasks.json](../demo/tasks.json); raw output in
[../demo/runs/openclaw-sdk-cases2-4.jsonl](../demo/runs/openclaw-sdk-cases2-4.jsonl).

**The user asks:**

> Write one SQL query that returns the 5 customers with the highest total order amount, from the table
> orders(customer_id, amount). Return customer_id and the total.

**The agent's draft** (plausible, and wrong: it ranks single orders, so one customer can appear several times):

```sql
SELECT customer_id, amount FROM orders ORDER BY amount DESC LIMIT 5;
```

**Before saying done, the skill makes it call `donecheck__done_check`:**

```json
{ "task": "Write one SQL query that returns the 5 customers ... Return customer_id and the total.",
  "result": "SELECT customer_id, amount FROM orders ORDER BY amount DESC LIMIT 5;" }
```

**Tool result (verbatim, 6.5 s):**

```text
FIX: judge: fails (score ?). Fail - the query does not aggregate orders per customer to compute total amounts
and thus does not return the top 5 customers by total order amount.
(receipt 0x51f15e47e78387c36b9ff0e28ff06f0b5a3f11c0625c0c636e86e6c01ee2d999, epoch 58)
Do not say done: fix the result using the reason, then call done_check again.
```

`structuredContent` carries the same verdict plus `receipt.miner_id: "302"`, `intent:
"TASK_EXECUTION_QUALITY_GENERAL"`, `amount_uusdc: 10000` ($0.01 test USDC) and
`network: "Ethereum Sepolia escrow (testnet, test USDC)"`.

**What the agent does next** (per the skill): it does not say done. It rewrites the query with the reason:

```sql
SELECT customer_id, SUM(amount) AS total FROM orders GROUP BY customer_id ORDER BY total DESC LIMIT 5;
```

and calls `donecheck__done_check` again before answering. That second check is case 9 in
[../demo/tasks-followup.json](../demo/tasks-followup.json). It has **not been run yet**: the hosted server allows
5 checks per connection per UTC day and that day's 5 were used on the frozen set.

**Without the check**, the agent would have delivered a query that returns the five largest single orders,
which matches the right answer only on data where every customer has a single order.

Reproduce (free handshake, then one paid check):

```bash
npm i @modelcontextprotocol/client@2.4.0
node integrations/test/openclaw-sdk-check.mjs
node integrations/test/openclaw-sdk-check.mjs --tasks integrations/demo/tasks.json --call 2
```
