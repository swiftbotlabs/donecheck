"""Runs done_check through Hermes Agent's own MCP code path, without an LLM: Hermes loads `mcp_servers` from
$HERMES_HOME/config.yaml, connects (tools.mcp_tool_discovery.discover_mcp_tools), registers the tool as
mcp__donecheck__done_check (the website docs still say mcp_<server>_<tool>; the code at e0dcc39f uses
mcp__<server>__<tool>), and model_tools.handle_function_call dispatches a tool call by that name exactly as the
agent loop does when the model emits one. With Tool Search on (the default), MCP tools are deferred:
the model sees tool_search / tool_describe / tool_call, so the paid calls here go through the tool_call bridge, the way
the model reaches done_check in a default Hermes session. Run it with the Python of a Hermes checkout (cwd = the checkout):

  HERMES_HOME=/path/with/config.yaml  .venv/bin/python hermes-dispatch-check.py                 # connect + schema only (free)
  HERMES_HOME=...  .venv/bin/python hermes-dispatch-check.py --tasks tasks.json --call 1,3,5    # paid checks (testnet)
"""
import argparse, json, os, sys, time

sys.path.insert(0, os.getcwd())
p = argparse.ArgumentParser()
p.add_argument("--tasks", default="tasks.json")
p.add_argument("--call", default="")
a = p.parse_args()
out = lambda o: print(json.dumps(o, ensure_ascii=False), flush=True)

from tools.mcp_tool_discovery import discover_mcp_tools
from tools.mcp_tool_lifecycle import shutdown_mcp_servers
import model_tools

names = discover_mcp_tools()
out({"step": "discover", "registered": names})
NAME = next((n for n in names if n.endswith("__done_check")), "mcp__donecheck__done_check")
defs = model_tools.get_tool_definitions(quiet_mode=True)
schema = next((d for d in defs if (d.get("function") or d).get("name") == NAME), None)
out({"step": "schema_seen_by_model", "direct": schema is not None,
     "bridge": [n for n in ("tool_search", "tool_describe", "tool_call") if any((d.get("function") or d).get("name") == n for d in defs)]})
for q in ("done_check", "verify task is done before telling the user"):
    r = json.loads(model_tools.handle_function_call("tool_search", {"queries": [q]}, task_id="donecheck-demo"))
    out({"step": "tool_search", "query": q, "matches": (r.get("results") or [{}])[0].get("matches")})

ids = [int(x) for x in a.call.split(",") if x.strip()]
cases = json.load(open(a.tasks))["cases"] if ids else []
try:
    for i in ids:
        c = next((x for x in cases if x["id"] == i), None)
        if not c:
            out({"step": "call", "id": i, "error": "no such case"}); continue
        args = {"task": c["task"], "result": c["result"]}
        if c.get("mustInclude"): args["mustInclude"] = c["mustInclude"]
        t0 = time.time()
        via = "direct" if schema else "tool_call"
        raw = (model_tools.handle_function_call(NAME, args, task_id=f"donecheck-demo-{i}") if schema else
               model_tools.handle_function_call("tool_call", {"calls": [{"name": NAME, "arguments": args}]}, task_id=f"donecheck-demo-{i}"))
        ms = int((time.time() - t0) * 1000)
        try: r = json.loads(raw)
        except Exception: r = {"raw": raw}
        hits = sorted((raw.find(k), k[:-1]) for k in ("SUBMIT:", "FIX:", "HOLD:") if k in raw)
        first = hits[0][1] if hits else ""   # the server's text starts with the verdict
        out({"step": "call", "id": i, "tool": NAME, "via": via, "expected": c["expected"],
             "verdict": first if first in ("SUBMIT", "FIX", "HOLD") else None, "ms": ms, "tool_result": raw[:2000]})
finally:
    shutdown_mcp_servers()
