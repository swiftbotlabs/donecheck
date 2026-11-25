"""donecheck: ask before your agent says "done". Standard library only, Python 3.9+.

    from donecheck import done_check
    v = done_check(task, result, must_include=["total"])
    if v["verdict"] != "SUBMIT": ...   # FIX: redo using v["reasons"]. HOLD: show the user your result and ask.

A paid Telegraph Miner judges the result against the task (Ethereum Sepolia escrow, test USDC, paid by the
hosted service); required strings are checked for free. Every judgement comes with an on-chain receipt.
"""
import json
import os
import urllib.error
import urllib.request

__version__ = "0.1.0"
__all__ = ["done_check", "stats", "summary", "NEXT", "TOOL", "LIMIT", "DONECHECK_URL"]

DONECHECK_URL = os.environ.get("DONECHECK_URL", "https://donecheck.swiftbotlab.workers.dev")
LIMIT = 2000
VERDICTS = ("SUBMIT", "FIX", "HOLD")
NEXT = {
    "SUBMIT": "You may tell the user it is done.",
    "FIX": "Do not say done: fix the result using the reason, then call done_check again.",
    "HOLD": "Do not say done: tell the user the check was unclear and show your result.",
}
TOOL = {
    "name": "done_check",
    "description": "Call this BEFORE telling the user a task is finished. It checks the actual result against the task (a paid "
    "Telegraph Miner judges it on testnet; required strings are checked for free) and returns SUBMIT (finish), FIX (redo using "
    "the reason) or HOLD (ask the user), with a receipt.",
    "input_schema": {
        "type": "object",
        "required": ["task", "result"],
        "additionalProperties": False,
        "properties": {
            "task": {"type": "string", "description": "What the user asked for."},
            "result": {"type": "string", "description": "What you produced. Task + result at most 2,000 characters."},
            "mustInclude": {"type": "array", "items": {"type": "string"}, "maxItems": 5,
                            "description": "Optional strings the result must contain."},
        },
    },
}


def _hold(error):
    return {"verdict": "HOLD", "error": error, "reasons": ["no check could be made: fail closed"], "missing": [], "receipt": None}


def _validate(task, result, must_include):
    if not isinstance(task, str) or not isinstance(result, str) or not task.strip() or not result.strip():
        raise TypeError("task and result must be non-empty strings")
    n = len(task.strip()) + len(result.strip())
    if n > LIMIT:
        raise ValueError("task + result must be at most %d characters (got %d)" % (LIMIT, n))
    if (not isinstance(must_include, (list, tuple)) or len(must_include) > 5
            or any(not isinstance(m, str) or not m.strip() or len(m) > 100 for m in must_include)):
        raise TypeError("must_include: up to 5 non-empty strings of at most 100 characters")


def done_check(task, result, must_include=(), url=None, timeout=90, client="py"):
    """Checks a result against its task. Returns a dict with verdict SUBMIT, FIX or HOLD.

    Never returns SUBMIT unless the hosted check said SUBMIT: refusals, timeouts and malformed answers come back
    as {"verdict": "HOLD", "error": ...}. Raises only on bad input (empty, too long)."""
    must_include = list(must_include or [])
    _validate(task, result, must_include)
    base = (url or DONECHECK_URL).rstrip("/")
    req = urllib.request.Request(
        base + "/api/check",
        data=json.dumps({"task": task, "result": result, "mustInclude": must_include}).encode(),
        headers={"content-type": "application/json", "x-donecheck-client": "donecheck-%s/%s" % (client, __version__),
                 "user-agent": "donecheck-py/" + __version__},
        method="POST",
    )
    status, raw = None, b""
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            status, raw = r.status, r.read()
    except urllib.error.HTTPError as e:
        status, raw = e.code, e.read()
    except Exception as e:  # unreachable, timeout, TLS: fail closed
        return _hold("done-check unreachable: %s" % e)
    try:
        body = json.loads(raw.decode() or "{}")
    except ValueError:
        body = {}
    if not isinstance(body, dict):
        body = {}
    if status != 200 or body.get("verdict") not in VERDICTS:
        return _hold(body.get("error") or "HTTP %s" % status)
    out = {"missing": [], "receipt": None}
    out.update(body)
    if not isinstance(out.get("reasons"), list):
        out["reasons"] = []
    return out


def stats(url=None, timeout=15):
    """Public usage counts of the hosted check (no personal data)."""
    req = urllib.request.Request((url or DONECHECK_URL).rstrip("/") + "/api/stats", headers={"user-agent": "donecheck-py/" + __version__})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def summary(v):
    """One line for a model or a log: 'FIX: <reasons> (receipt 0x..)'."""
    rec = v.get("receipt") or {}
    s = "%s: %s" % (v["verdict"], " | ".join(v.get("reasons") or []))
    if v.get("missing"):
        s += " Missing: %s." % ", ".join(v["missing"])
    if rec.get("receipt_hash"):
        s += " (receipt %s)" % rec["receipt_hash"]
    if v.get("error"):
        s += " [%s]" % v["error"]
    return s
