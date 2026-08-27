#!/usr/bin/env python3
"""One-off: un-complete an Asana task (restore an accidentally-completed
Stock Report item) and reflect it back in the Supabase mirror + clean up the
completion log / stock alert it generated. Usage: python asana_uncomplete.py <task_gid>
"""
import os
import sys
import json
import urllib.request

ASANA_TOKEN = os.environ["ASANA_TOKEN"]
SB_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SB_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]


def asana_req(method, path, body=None):
    req = urllib.request.Request(
        f"https://app.asana.com/api/1.0{path}",
        method=method,
        data=json.dumps({"data": body}).encode() if body is not None else None,
        headers={"Authorization": f"Bearer {ASANA_TOKEN}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def sb_req(method, path, body=None, prefer=None):
    headers = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}", "Content-Type": "application/json"}
    if prefer:
        headers["Prefer"] = prefer
    req = urllib.request.Request(
        f"{SB_URL}/rest/v1/{path}",
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers=headers,
    )
    with urllib.request.urlopen(req) as r:
        return r.read()


def main():
    gid = sys.argv[1]
    out = asana_req("PUT", f"/tasks/{gid}", {"completed": False})
    t = out["data"]
    print(f"Asana: restored '{t['name']}' (completed={t['completed']})")

    sb_req("PATCH", f"asana_tasks?gid=eq.{gid}", {"completed": False, "completed_at": None}, prefer="return=minimal")
    sb_req("DELETE", f"design_completions?task_gid=eq.{gid}")
    sb_req("DELETE", f"stock_alerts?gid=eq.{gid}")
    print("Supabase mirror + completion log + stock alert cleaned up.")


if __name__ == "__main__":
    main()
