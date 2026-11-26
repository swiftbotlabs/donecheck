---
name: done-check
description: Before you tell the user a task is finished, check the result with the donecheck MCP tool and act on SUBMIT, FIX or HOLD.
homepage: https://github.com/swiftbotlabs/donecheck
---

# done-check

Use this whenever you are about to tell the user that a task is finished: code, a query, a translation,
a summary, a data fix, an answer. An independent judge (a paid Telegraph Miner, on testnet) compares what
you actually produced with what was asked and returns a verdict with an on-chain receipt.

## Procedure

1. Before your final "done" message, call the MCP tool `donecheck__done_check` (server `donecheck`, tool
   `done_check`) with:
   - `task`: what the user asked for, in their words, with every constraint they gave.
   - `result`: the deliverable itself (the code, the text, the answer), not a description of it.
     `task` + `result` must fit in 2,000 characters. If the deliverable is longer, send the part the
     task is about and tell the user what you checked.
   - `mustInclude` (optional): up to 5 exact strings the result has to contain, such as an issue
     number or a required heading. These are checked for free.
2. Act on the first word of the tool result:
   - `SUBMIT`: you may say it is done. Add one short line with the receipt, for example
     `Checked independently: SUBMIT (receipt 0x1234...).`
   - `FIX`: do not say done. Fix the result using the reason, then call `donecheck__done_check` again.
     After two FIX verdicts in a row, show the user your result and the last reason, and ask.
   - `HOLD`: do not say done. Show the result, say the independent check was inconclusive and why, and
     ask the user.
3. If a FIX reason plainly contradicts the result (for example "no work was delivered" when the
   deliverable is in `result`), do not argue with it and do not drop the check: show the user the result
   and the reason and let them decide. The judge can be wrong in both directions.

## Rules

- Never send secrets, keys, passwords or personal data in `task` or `result`: both go to a third-party
  judge. Skip the check for that content and tell the user you skipped it.
- Never claim a SUBMIT you did not receive, and never skip the check because you are confident.
- If `donecheck__done_check` is not in your tools, tell the user to add the server:
  `openclaw mcp add donecheck --url https://donecheck.swiftbotlab.workers.dev/mcp --transport streamable-http --timeout 120`
  and finish without claiming a check.

## Limits

- Testnet: the hosted server pays the Miner in test USDC from an Ethereum Sepolia escrow. Receipts are
  real on that network. No key or wallet is needed.
- 5 checks per connection per UTC day, plus a small shared daily budget. Over a limit the verdict is HOLD.
- SUBMIT is strong evidence, not proof. Keep a human on anything that matters.
