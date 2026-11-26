---
name: done-check
description: Check work with done_check before saying a task is done.
version: 0.1.0
author: Swift Bot Labs
license: MIT
metadata:
  hermes:
    tags: [verification, quality, mcp, telegraph]
    homepage: https://github.com/swiftbotlabs/donecheck
---

# done-check

## When to Use

Whenever you are about to tell the user that a task is finished: code, a query, a translation, a summary,
a data fix, an answer. An independent judge (a paid Telegraph Miner, on testnet) compares what you
actually produced with what was asked and returns a verdict with an on-chain receipt.

## Procedure

1. Before your final "done" message, call the MCP tool `mcp__donecheck__done_check` (server `donecheck`,
   tool `done_check`) with:
   - `task`: what the user asked for, in their words, with every constraint they gave.
   - `result`: the deliverable itself (the code, the text, the answer), not a description of it.
     `task` + `result` must fit in 2,000 characters. If the deliverable is longer, send the part the task
     is about and tell the user what you checked.
   - `mustInclude` (optional): up to 5 exact strings the result has to contain, such as an issue number or
     a required heading. These are checked for free.
2. Hermes keeps MCP tools behind Tool Search by default. If `mcp__donecheck__done_check` is not in your
   tool list, call it through the bridge by its exact name:
   `tool_call({"calls": [{"name": "mcp__donecheck__done_check", "arguments": {"task": "...", "result": "..."}}]})`.
   Use `tool_describe(["mcp__donecheck__done_check"])` if you need the schema. If you search, search for
   `done_check`; a descriptive query such as "verify the task is done" does not find it.
3. Act on the first word of the tool result:
   - `SUBMIT`: you may say it is done. Add one short line with the receipt, for example
     `Checked independently: SUBMIT (receipt 0x1234...).`
   - `FIX`: do not say done. Fix the result using the reason, then call the tool again. After two FIX
     verdicts in a row, show the user your result and the last reason, and ask.
   - `HOLD`: do not say done. Show the result, say the independent check was inconclusive and why, and ask
     the user.

## Pitfalls

- If a FIX reason plainly contradicts the result (for example "no work was delivered" when the
  deliverable is in `result`), do not argue with it and do not drop the check: show the user the result
  and the reason and let them decide. The judge can be wrong in both directions.
- Never send secrets, keys, passwords or personal data in `task` or `result`: both go to a third-party
  judge. Skip the check for that content and tell the user you skipped it.
- Never claim a SUBMIT you did not receive, and never skip the check because you are confident.
- If the tool is missing entirely, tell the user to add the server
  (`hermes mcp add donecheck --url https://donecheck.swiftbotlab.workers.dev/mcp`) and finish without
  claiming a check.

## Verification

The tool result starts with `SUBMIT:`, `FIX:` or `HOLD:` and, when a Miner judged it, ends with
`(receipt 0x..., epoch N)`. The receipt is on the Telegraph testnet (Ethereum Sepolia escrow, test USDC).
Limits of the hosted server: 5 checks per connection per UTC day plus a small shared daily budget; over a
limit the verdict is HOLD.
