# donecheck for Hermes Agent

Give a [Hermes Agent](https://github.com/NousResearch/hermes-agent) an independent check before it says "done".
The agent sends the task and its actual result to the `done_check` tool. A paid
[Telegraph](https://telegraphprotocol.com) Miner judges the result and the agent gets back `SUBMIT`, `FIX` or
`HOLD` with an on-chain receipt. It is a remote MCP server, so there is nothing to install, and the hosted check
pays the Miner from its own **testnet** escrow (Ethereum Sepolia, test USDC). You need no key, wallet or account.

Two pieces:

| Piece | What it does | File |
|---|---|---|
| MCP server `donecheck` | Adds the tool `mcp__donecheck__done_check` | [config.donecheck.yaml](config.donecheck.yaml) |
| Skill `done-check` | Tells the agent when to call it, how to reach it through Tool Search, and what to do with each verdict | [skills/done-check/SKILL.md](skills/done-check/SKILL.md) |

## Install (2 minutes)

**1. Add the MCP server.** Paste this under `mcp_servers` in `~/.hermes/config.yaml`:

```yaml
mcp_servers:
  donecheck:
    url: "https://donecheck.swiftbotlab.workers.dev/mcp"
    timeout: 180
    connect_timeout: 30
```

Or run `hermes mcp add donecheck --url https://donecheck.swiftbotlab.workers.dev/mcp` in a terminal: press
Enter at the API key prompt (none is needed) and `Y` to enable the tool. Leave `transport` unset: Hermes
then uses Streamable HTTP, which is what this server speaks.

**2. Add the skill:**

```bash
hermes skills install https://raw.githubusercontent.com/swiftbotlabs/donecheck/main/integrations/hermes/skills/done-check/SKILL.md
```

Or copy it from a clone: `mkdir -p ~/.hermes/skills/productivity && cp -r integrations/hermes/skills/done-check ~/.hermes/skills/productivity/`.

**3. Check both:**

```bash
hermes mcp test donecheck     # Connected, Tools discovered: 1 (done_check)
hermes skills list            # done-check | productivity | enabled
```

Restart the chat (`/new`) so the agent sees the new tool and skill.

## Use

Ask for anything with a checkable result. The skill makes the agent call the tool before its final message:

```text
You:   Convert these three temperatures from Celsius to Fahrenheit and give all three answers: 0 C, 37 C, 100 C.
Agent: (draft) 0 C = 32 F / 100 C = 212 F
       -> tool_call({"calls": [{"name": "mcp__donecheck__done_check", "arguments": {"task": "...", "result": "..."}}]})
       <- FIX: judge: fails. The result only provides Fahrenheit values for 0 C and 100 C, omitting the required
          conversion for 37 C. (receipt 0x50bbd8ce...4ba2, epoch 58)
Agent: (adds 37 C = 98.6 F, checks again, then answers with the receipt line)
```

The call and the FIX above are a real recorded call made through Hermes' own tool dispatcher (see
[EXAMPLE.md](EXAMPLE.md)).

| Verdict | The skill tells the agent to |
|---|---|
| `SUBMIT` | Say it is done, with one receipt line |
| `FIX` | Not say done; fix using the reason and check again (2 tries, then ask you) |
| `HOLD` | Not say done; show the result and ask you |

### Two Hermes details the skill handles

- **Tool name.** Hermes registers MCP tools as `mcp__<server>__<tool>`, so the tool is
  `mcp__donecheck__done_check`. (The website page `user-guide/features/mcp.md` still shows the older
  `mcp_<server>_<tool>` form; the code at `tools/mcp_tool_schema.py` uses the double underscore.)
- **Tool Search.** With the default `tools.tool_search.enabled: auto`, every MCP tool is deferred: the model
  sees `tool_search`, `tool_describe` and `tool_call` instead. The tool is listed in the `tool_search`
  description ("Call this BEFORE telling the user a task is finished"), and `tool_search("done_check")` finds
  it, but a descriptive search such as "verify task is done before telling the user" returned only
  `todo_list` in our test. The skill therefore names the exact tool and the `tool_call` form.

## What was tested, and how

Run on 2026-11-26 against the live hosted server, inside a sandbox (see
[../RESULTS-openclaw-hermes.md](../RESULTS-openclaw-hermes.md#how-the-frameworks-were-run)), with Hermes Agent
built from source at commit `e0dcc39f` (2026-11-25; `hermes --version`: 2026.9.24) via `uv sync --frozen --extra mcp`
(its pinned `mcp==2.3.0`):

- `hermes mcp test donecheck` with the exact [config.donecheck.yaml](config.donecheck.yaml): connected, 1 tool.
  Hermes' content-type preflight passes (HEAD and GET get 405, which it accepts).
- Hermes' own code path, no LLM: `discover_mcp_tools()` registered `mcp__donecheck__done_check`;
  `get_tool_definitions()` showed it deferred behind Tool Search; `handle_function_call("tool_search", ...)`
  and three paid `handle_function_call("tool_call", ...)` checks, which is how the model reaches the tool in a
  default session. Script: [../test/hermes-dispatch-check.py](../test/hermes-dispatch-check.py). Raw output:
  [../demo/runs/](../demo/runs/).
- The skill: Hermes' install scanner `tools/skills_guard.scan_skill(source="community")` says `safe`, no
  findings; `tools/skill_linter.lint_skill` has 0 findings; `hermes skills list`, `skills_list` and
  `skill_view` load it.

Not run: `hermes mcp add` to completion (it reads its answers from a terminal, and the sandbox has none);
`hermes skills install <url>` (it fetches from GitHub, which this test did not use); a full chat turn with a
real model (no model key was used).

Docs and source read: `website/docs/user-guide/features/mcp.md`, `website/docs/reference/mcp-config-reference.md`,
`website/docs/user-guide/features/skills.md`, `website/docs/user-guide/features/tool-search.md`,
`website/docs/reference/cli-commands.md`, `tools/mcp_tool_schema.py`, `tools/mcp_tool_transport.py`,
`tools/tool_search.py` in [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) at `e0dcc39f`.

## Limits

- Testnet only: test USDC on an Ethereum Sepolia escrow. Receipts are real on that network.
- `task` + `result` at most 2,000 characters; up to 5 `mustInclude` strings.
- 5 checks per connection per UTC day, plus a small shared daily budget. Over a limit you get `HOLD`.
- Task and result go to a third-party Miner. Don't send secrets or personal data.
- The judge can be wrong. In our run it rejected one correct answer (see
  [../RESULTS-openclaw-hermes.md](../RESULTS-openclaw-hermes.md)). Treat `SUBMIT` as strong evidence, not proof.
- If you mark the server `trust: untrusted`, Hermes asks before each call (the tool has no `readOnlyHint`).
