#!/usr/bin/env python3
"""Publish ../server.json to the Official MCP Registry with GitHub device-flow auth (the same flow mcp-publisher uses), stdlib only.
Run it signed in to GitHub as swiftbotlabs in Chrome. It prints a one-time code; enter it at https://github.com/login/device and
authorize. Tokens stay in memory: nothing secret is printed or written. Usage: python3 -I publish.py [--dry-run]"""
import json, os, sys, time, urllib.request, urllib.error

REG = "https://registry.modelcontextprotocol.io"
HERE = os.path.dirname(os.path.abspath(__file__))

def call(url, body=None, token=None, method=None):
    h = {"Accept": "application/json", "User-Agent": "donecheck-registry-publish"}
    if body is not None: h["Content-Type"] = "application/json"
    if token: h["Authorization"] = "Bearer " + token
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        raw = e.read().decode(errors="replace")
        try: return e.code, json.loads(raw)
        except ValueError: return e.code, {"raw": raw[:300]}

def main():
    server = json.load(open(os.path.join(HERE, "..", "server.json")))
    assert server["name"] == "io.github.swiftbotlabs/donecheck" and len(server["description"]) <= 100, "server.json name/description"
    st, health = call(REG + "/v0/health"); cid = health.get("github_client_id")
    if st != 200 or not cid: sys.exit(f"registry health: HTTP {st}")
    if "--dry-run" in sys.argv:
        print("dry run OK: registry up, client id present, server.json passes local checks"); return
    st, dc = call("https://github.com/login/device/code", {"client_id": cid, "scope": "read:org read:user"})
    if st != 200 or "device_code" not in dc: sys.exit(f"device code: HTTP {st} {dc.get('error', '')}")
    print(f"Open {dc.get('verification_uri', 'https://github.com/login/device')} as swiftbotlabs and enter code: {dc['user_code']}", flush=True)
    interval, deadline, gh = int(dc.get("interval", 5)), time.time() + int(dc.get("expires_in", 900)), None
    while time.time() < deadline:
        time.sleep(interval)
        st, tk = call("https://github.com/login/oauth/access_token", {"client_id": cid, "device_code": dc["device_code"], "grant_type": "urn:ietf:params:oauth:grant-type:device_code"})
        if tk.get("access_token"): gh = tk["access_token"]; break
        err = tk.get("error")
        if err == "slow_down": interval += 5
        elif err != "authorization_pending": sys.exit(f"github token: {err or st}")
    if not gh: sys.exit("github token: code expired")
    print("github authorized: yes", flush=True)
    st, rt = call(REG + "/v0/auth/github-at", {"github_token": gh}); gh = None
    reg = rt.get("registry_token")
    if not reg: sys.exit(f"registry token exchange: HTTP {st} {str(rt)[:200]}")
    st, out = call(REG + "/v0/publish", server, token=reg); reg = None
    if st not in (200, 201): sys.exit(f"publish: HTTP {st} {json.dumps(out)[:400]}")
    print("published:", json.dumps({k: out.get("server", out).get(k) for k in ("name", "version")}), json.dumps(out.get("_meta", {}))[:300])

if __name__ == "__main__":
    main()
