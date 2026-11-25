"""Tests against a fake hosted done-check (no network, no funds). Framework adapters are tested with stub modules."""
import io
import json
import os
import sys
import threading
import types
import unittest
from contextlib import redirect_stdout
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
T = "Write a one-line JavaScript expression that is true when the string s has at least 12 characters."
STATE = {"mode": "ok", "seen": []}


class Fake(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, code, body, ctype="application/json"):
        self.send_response(code)
        self.send_header("content-type", ctype)
        self.end_headers()
        self.wfile.write(body.encode())

    def do_GET(self):
        self._send(200, json.dumps({"checks": 7, "judged": 6, "days": {}}))

    def do_POST(self):
        b = self.rfile.read(int(self.headers.get("content-length", 0))).decode()
        STATE["seen"].append({"client": self.headers.get("x-donecheck-client"), "body": b})
        if STATE["mode"] == "limit":
            return self._send(429, '{"error":"this connection has used its 5 checks for today (UTC)"}')
        if STATE["mode"] == "weird":
            return self._send(200, '{"verdict":"OK"}')
        if STATE["mode"] == "html":
            return self._send(502, "<h1>bad gateway</h1>", "text/html")
        d = json.loads(b)
        bad = "> 12" in d["result"]
        missing = [m for m in d.get("mustInclude", []) if m not in d["result"]]
        self._send(200, json.dumps({"verdict": "FIX" if bad or missing else "SUBMIT",
                                    "reasons": ["judge: fails. uses > instead of >=" if bad else "judge: satisfies"], "missing": missing,
                                    "receipt": {"receipt_hash": "0x" + "ab" * 32, "epoch_id": 45}}))


srv = ThreadingHTTPServer(("127.0.0.1", 0), Fake)
threading.Thread(target=srv.serve_forever, daemon=True).start()
os.environ["DONECHECK_URL"] = "http://127.0.0.1:%d" % srv.server_address[1]
import donecheck  # noqa: E402
from donecheck import integrations  # noqa: E402
from donecheck.__main__ import main  # noqa: E402


class Client(unittest.TestCase):
    def setUp(self):
        STATE["mode"] = "ok"

    def test_verdicts_and_tag(self):
        v = donecheck.done_check(T, "s.length >= 12")
        self.assertEqual(v["verdict"], "SUBMIT")
        self.assertEqual(STATE["seen"][-1]["client"], "donecheck-py/0.1.0")
        v = donecheck.done_check(T, "s.length > 12")
        self.assertEqual(v["verdict"], "FIX")
        self.assertRegex(donecheck.summary(v), r"^FIX: judge: fails.*receipt 0x")
        v = donecheck.done_check(T, "s.length >= 12", must_include=["trim"])
        self.assertEqual((v["verdict"], v["missing"]), ("FIX", ["trim"]))

    def test_fail_closed(self):
        for mode in ("limit", "weird", "html"):
            STATE["mode"] = mode
            v = donecheck.done_check(T, "s.length >= 12")
            self.assertEqual(v["verdict"], "HOLD", mode)
            self.assertTrue(v["error"], mode)
        self.assertEqual(donecheck.done_check(T, "x", url="http://127.0.0.1:1")["verdict"], "HOLD")

    def test_bad_input_raises_before_request(self):
        n = len(STATE["seen"])
        with self.assertRaises(TypeError):
            donecheck.done_check("", "x")
        with self.assertRaises(ValueError):
            donecheck.done_check(T, "x" * 2000)
        with self.assertRaises(TypeError):
            donecheck.done_check(T, "x", must_include=list("abcdef"))
        self.assertEqual(len(STATE["seen"]), n)

    def test_stats(self):
        self.assertEqual(donecheck.stats()["checks"], 7)

    def test_cli_exit_codes(self):
        with redirect_stdout(io.StringIO()):
            self.assertEqual(main([T, "s.length >= 12"]), 0)
            self.assertEqual(main([T, "s.length > 12"]), 10)
            STATE["mode"] = "limit"
            self.assertEqual(main([T, "s.length >= 12"]), 11)
            STATE["mode"] = "ok"
            self.assertEqual(main([T, "x" * 2100]), 2)
        self.assertEqual(STATE["seen"][-1]["client"], "donecheck-cli-py/0.1.0")


class Adapters(unittest.TestCase):
    def test_plain_loop(self):
        self.assertRegex(integrations.check_for_model(T, "s.length > 12"), r"^FIX:[\s\S]*Do not say done")
        self.assertRegex(integrations.check_for_model("", "x"), r"^Input error")

    def test_langchain(self):
        captured = {}

        class StructuredTool:
            @staticmethod
            def from_function(func, name, description):
                captured.update(func=func, name=name, description=description)
                return captured

        mod = types.ModuleType("langchain_core.tools")
        mod.StructuredTool = StructuredTool
        sys.modules.update({"langchain_core": types.ModuleType("langchain_core"), "langchain_core.tools": mod})
        try:
            t = integrations.langchain_tool()
        finally:
            del sys.modules["langchain_core"], sys.modules["langchain_core.tools"]
        self.assertEqual(t["name"], "done_check")
        self.assertRegex(t["func"](task=T, result="s.length >= 12"), r"^SUBMIT:[\s\S]*may tell the user")
        self.assertEqual(STATE["seen"][-1]["client"], "donecheck-langchain/0.1.0")

    def test_openai_agents(self):
        mod = types.ModuleType("agents")
        mod.function_tool = lambda f: f
        sys.modules["agents"] = mod
        try:
            f = integrations.openai_agents_tool()
        finally:
            del sys.modules["agents"]
        self.assertEqual(f.__name__, "done_check")
        self.assertIn("Args:", f.__doc__)
        self.assertRegex(f(T, "s.length > 12"), r"^FIX:")
        self.assertEqual(STATE["seen"][-1]["client"], "donecheck-openai-agents/0.1.0")


if __name__ == "__main__":
    unittest.main()
