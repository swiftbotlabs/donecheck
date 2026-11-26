# donecheck for OpenClaw

Give an OpenClaw agent an independent check before it says "done". The agent sends the task and its actual
result to the `done_check` tool. A paid [Telegraph](https://telegraphprotocol.com) Miner judges the result and
the agent gets back `SUBMIT`, `FIX` or `HOLD` with an on-chain receipt. Nothing to install: it is a remote MCP
server, and the hosted check pays the Miner from its own **testnet** escrow (Ethereum Sepolia, test USDC).
You need no key, wallet or account.

Two pieces:

| Piece | What it does | File |
|---|---|---|
| MCP server `donecheck` | Adds the tool `donecheck__done_check` to your agents | [openclaw.donecheck.json5](openclaw.donecheck.json5) |
| Skill `done-check` | Tells the agent when to call it and what to do with each verdict | [skills/done-check/SKILL.md](skills/done-check/SKILL.md) |

## Install (2 minutes)

**1. Add the MCP server.** One command:

```bash
openclaw mcp add donecheck \
  --url https://donecheck.swiftbotlab.workers.dev/mcp \
  --transport streamable-http \
  --timeout 120
```

If the Gateway is running, add `--no-probe` (OpenClaw refuses the probe while the Gateway owns the config)
and run the probe in step 3 instead. To edit the config by hand, merge
[openclaw.donecheck.json5](openclaw.donecheck.json5) into `~/.openclaw/openclaw.json`.

`--transport streamable-http` matters: without it OpenClaw falls back to legacy SSE, which this server
does not serve. `--timeout 120` (seconds) raises the per-call limit from OpenClaw's 60 s default.

**2. Add the skill** to your workspace skills folder:

```bash
mkdir -p ~/.openclaw/workspace/skills/done-check
curl -fsSL -o ~/.openclaw/workspace/skills/done-check/SKILL.md \
  https://raw.githubusercontent.com/swiftbotlabs/donecheck/main/integrations/openclaw/skills/done-check/SKILL.md
```

Or copy the folder from a clone: `cp -r integrations/openclaw/skills/done-check ~/.openclaw/workspace/skills/`.

**3. Check both:**

```bash
openclaw mcp doctor donecheck --probe   # connects, lists 1 tool: done_check
openclaw skills list                    # shows done-check
```

Start a new session (`/new`) so the agent picks up the skill.

## Use

Ask for anything with a checkable result. The skill makes the agent call the tool before its final message:

```text
You:   Write one SQL query that returns the 5 customers with the highest total order amount,
       from orders(customer_id, amount). Return customer_id and the total.
Agent: (draft) SELECT customer_id, amount FROM orders ORDER BY amount DESC LIMIT 5;
       -> donecheck__done_check(task, result)
       <- FIX: judge: fails. Fail - the query does not aggregate orders per customer to compute total
          amounts and thus does not return the top 5 customers by total order amount.
          (receipt 0x51f15e47...d999, epoch 58)
Agent: (fixes it, checks again, then answers with the fixed query and the receipt line)
```

The tool call and the FIX above are a real recorded call (see [EXAMPLE.md](EXAMPLE.md)). You can also call
it on demand: "check your last answer with done_check".

| Verdict | The skill tells the agent to |
|---|---|
| `SUBMIT` | Say it is done, with one receipt line |
| `FIX` | Not say done; fix using the reason and check again (2 tries, then ask you) |
| `HOLD` | Not say done; show the result and ask you |

## What was tested, and how

Run on 2026-11-26 against the live hosted server:

- **OpenClaw's own MCP client library**, `@modelcontextprotocol/client` 2.4.0 (the version openclaw
  2026.11.10 pins), with the same `StreamableHTTPClientTransport` OpenClaw builds for a
  `transport: "streamable-http"` entry: initialize, `notifications/initialized` (202), the optional GET
  stream (405, which the SDK accepts), `tools/list`, and two paid `tools/call`s. Script:
  [../test/openclaw-sdk-check.mjs](../test/openclaw-sdk-check.mjs). Raw output:
  [../demo/runs/openclaw-sdk-cases2-4.jsonl](../demo/runs/openclaw-sdk-cases2-4.jsonl).
- **The OpenClaw CLI itself**, `openclaw` 2026.11.10 (6ea542f) from npm on Node 24.16.0, inside a sandbox (see
  [../RESULTS-openclaw-hermes.md](../RESULTS-openclaw-hermes.md#how-the-frameworks-were-run)):
  the `openclaw mcp add` command above saved the server and probed it; `openclaw mcp probe donecheck --json`
  listed `donecheck__done_check`; `openclaw mcp doctor donecheck --probe` said `ok`; with
  [openclaw.donecheck.json5](openclaw.donecheck.json5) as the whole config file, `mcp status --verbose`
  showed `streamable-http`, connect 15000 ms, request 120000 ms, and the probe found the tool; the skill
  showed as `done-check ✓ Ready`, "Visible to model: yes", in `openclaw skills info done-check`.
- **Control:** the same server without `transport` failed the probe with `SSE error: Non-200 status code (405)`,
  which is why the install step sets it.
- Doctor notes that the tool has no safety annotations, so in the stricter `guarded` or `read-only`
  postures OpenClaw asks before each call. To skip that for this server:
  `openclaw mcp configure donecheck --approval approve`.

Not run: a full agent turn with a real model (no model key was used), and the `curl` skill download
(it fetches from GitHub, which this test did not use).

Read in the OpenClaw source (commit `0fa34123`, 2026-11-26, package 2026.11.10), not executed:

- `mcp.servers.<name>` schema (`src/config/zod-schema.mcp-server.ts`): `url`, `transport`
  (`stdio` | `sse` | `streamable-http`), `connectionTimeoutMs`, `requestTimeoutMs`. Missing `transport`
  means SSE (`docs/cli/mcp/transports.md`).
- Tool naming `<server>__<tool>` (`src/agents/agent-bundle-mcp-names.ts`), so the agent sees
  `donecheck__done_check`.
- Default request timeout 60 s (`src/agents/mcp-transport-config.ts`); `--timeout` is in seconds
  (`src/cli/mcp-cli-server-controls.ts`).
- Skills: `SKILL.md` with `name` + one-line `description`, loaded from `<workspace>/skills`
  (`docs/tools/skills.md`, `docs/tools/creating-skills.md`).

Docs used: `docs/tools/mcp.md`, `docs/cli/mcp/registry.md`, `docs/cli/mcp/transports.md`,
`docs/tools/skills.md`, `docs/tools/creating-skills.md` in [openclaw/openclaw](https://github.com/openclaw/openclaw)
at `0fa34123`.

## Limits

- Testnet only: test USDC on an Ethereum Sepolia escrow. Receipts are real on that network.
- `task` + `result` at most 2,000 characters; up to 5 `mustInclude` strings.
- 5 checks per connection per UTC day, plus a small shared daily budget. Over a limit you get `HOLD`.
- Task and result go to a third-party Miner. Don't send secrets or personal data.
- The judge can be wrong. In our run it rejected one correct answer (see
  [../RESULTS-openclaw-hermes.md](../RESULTS-openclaw-hermes.md)). Treat `SUBMIT` as strong evidence, not proof.
