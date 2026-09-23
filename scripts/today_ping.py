#!/usr/bin/env python3
"""Knock on the dashboard's Today endpoints (digest | alerts) with the shared
key derived from SUPABASE_SERVICE_ROLE_KEY. The dashboard does the work."""
import hashlib, json, os, sys, urllib.request

DASHBOARD = os.environ.get("DASHBOARD_URL", "https://marketing.coolkidz.com.au")
KEY = hashlib.sha256(("today:" + os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")).encode()).hexdigest()[:40]

def main():
    what = (sys.argv[1] if len(sys.argv) > 1 else "digest").strip()
    if what not in ("digest", "alerts"):
        sys.exit(f"usage: today_ping.py digest|alerts (got {what})")
    req = urllib.request.Request(f"{DASHBOARD}/api/today/{what}", data=b"{}", method="POST", headers={"Content-Type": "application/json", "x-today-key": KEY})
    try:
        body = json.load(urllib.request.urlopen(req, timeout=120))
    except urllib.error.HTTPError as e:
        sys.exit(f"{what}: HTTP {e.code} {e.read()[:300].decode()}")
    print(what, json.dumps(body))
    sys.exit(0 if body.get("ok") else 1)

if __name__ == "__main__":
    main()
