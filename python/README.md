# donecheck (Python)

Ask before your agent says "done". A paid Telegraph Miner checks the result against the task and returns
`SUBMIT`, `FIX` or `HOLD`, with an on-chain receipt (testnet). Standard library only.

```python
from donecheck import done_check
v = done_check("Summarise the report in 3 bullets", summary_text, must_include=["Revenue"])
if v["verdict"] != "SUBMIT":
    ...  # FIX: redo using v["reasons"]. HOLD: show the user the result and ask.
```

Adapters: `donecheck.integrations.langchain_tool()`, `openai_agents_tool()`, `check_for_model()`.
CLI: `python -m donecheck "<task>" "<result>"` (exit 0 only on SUBMIT). Full docs: https://github.com/swiftbotlabs/donecheck
