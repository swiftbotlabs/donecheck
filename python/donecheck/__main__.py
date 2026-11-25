"""python -m donecheck "<task>" "<result>" [--must a,b] [--json]   exit 0 SUBMIT, 10 FIX, 11 HOLD, 2 usage. Result "-" reads stdin."""
import argparse
import json
import sys

from . import done_check, stats, summary


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if argv[:1] == ["stats"]:
        print(json.dumps(stats(), indent=2))
        return 0
    p = argparse.ArgumentParser(prog="donecheck")
    p.add_argument("task")
    p.add_argument("result")
    p.add_argument("--must", default="")
    p.add_argument("--json", action="store_true")
    a = p.parse_args(argv)
    result = sys.stdin.read() if a.result == "-" else a.result
    try:
        v = done_check(a.task, result, [m.strip() for m in a.must.split(",") if m.strip()], client="cli-py")
    except (TypeError, ValueError) as e:
        print("donecheck: %s" % e, file=sys.stderr)
        return 2
    print(json.dumps(v, indent=2) if a.json else summary(v))
    return {"SUBMIT": 0, "FIX": 10, "HOLD": 11}[v["verdict"]]


if __name__ == "__main__":
    sys.exit(main())
