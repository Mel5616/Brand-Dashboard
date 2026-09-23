#!/usr/bin/env python3
"""
Sync Connecteam staff time-off into Supabase (Operations > Staff).

Setup:
  1. Table — run supabase/add_staff_time_off.sql once.
  2. API key: Connecteam admin → Settings → Integrations → API Key → Add API
     Key (Expert plan only, account owner). Add CONNECTEAM_API_KEY to
     .env.local (or as a GitHub Actions secret for the scheduled sync).
  3. python3 -u scripts/sync_connecteam.py

Two calls per sync: list every user once (users/v1/users, paginated), then
one unavailability call per user (scheduler/v1/schedulers/user-unavailability)
for a window running 30 days back to 180 days ahead — wide enough to keep a
recently-ended leave visible and catch anything already booked ahead.

Written against Connecteam's published API reference (developer.connecteam.com)
without a live key to test against — the shapes below are what's documented,
not verified end to end. If a field name is off, the error from the first
real run will point at exactly which one.
"""
import os, sys, json, time, datetime, urllib.request, urllib.error

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_PATH = os.path.join(BASE_DIR, ".env.local")
API = "https://api.connecteam.com"

def load_env():
    if not os.path.exists(ENV_PATH):
        return
    with open(ENV_PATH) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            if k.strip() not in os.environ:
                os.environ[k.strip()] = v.strip().strip('"').strip("'")
load_env()

SB_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SB_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
CT_KEY = os.environ.get("CONNECTEAM_API_KEY", "")


def ct_get(path, params=None, _tries=5):
    from urllib.parse import urlencode
    url = f"{API}{path}"
    if params:
        url += "?" + urlencode(params)
    # Connecteam's API sits behind Cloudflare, which rejects Python's default
    # urllib User-Agent outright ("Error 1010: blocked based on your browser's
    # signature") before the request ever reaches the API itself — a real,
    # observed block, not a guess. A normal-looking UA is enough to pass it.
    req = urllib.request.Request(url, headers={
        "X-API-KEY": CT_KEY, "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    })
    for attempt in range(_tries):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < _tries - 1:
                time.sleep(2 ** attempt)
                continue
            body = e.read().decode()[:300]
            raise SystemExit(f"Connecteam API error {e.code} on {path}: {body}")


def list_users():
    """GET /users/v1/users, paginated by limit/offset."""
    out = []
    offset = 0
    limit = 200
    while True:
        data = ct_get("/users/v1/users", {"limit": limit, "offset": offset})
        items = (data.get("data") or {}).get("users") or data.get("data") or []
        if isinstance(items, dict):
            items = items.get("users", [])
        if not items:
            break
        out.extend(items)
        if len(items) < limit:
            break
        offset += limit
    return out


def user_name(u):
    first = u.get("firstName") or u.get("first_name") or ""
    last = u.get("lastName") or u.get("last_name") or ""
    name = f"{first} {last}".strip()
    return name or u.get("email") or f"User {u.get('userId') or u.get('id')}"


_DEBUGGED = False

def unavailabilities_for(user_id, start_ts, end_ts):
    global _DEBUGGED
    data = ct_get("/scheduler/v1/schedulers/user-unavailability", {
        "userId": user_id, "startTime": start_ts, "endTime": end_ts,
    })
    if not _DEBUGGED:
        print(f"    [debug] raw response shape for user {user_id}: {json.dumps(data)[:2000]}")
        _DEBUGGED = True
    payload = data.get("data") or {}
    return payload.get("unavailabilities") or []


def to_date(ts):
    return datetime.datetime.utcfromtimestamp(int(ts)).date().isoformat()


def sb_upsert(table, rows, on_conflict):
    if not rows:
        return
    req = urllib.request.Request(
        f"{SB_URL}/rest/v1/{table}?on_conflict={on_conflict}",
        data=json.dumps(rows).encode(), method="POST",
        headers={
            "apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}", "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
    )
    with urllib.request.urlopen(req) as r:
        r.read()


def main():
    if not CT_KEY:
        print("No CONNECTEAM_API_KEY set — skipping."); return
    if not SB_URL or not SB_KEY:
        sys.exit("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")

    now = datetime.datetime.utcnow()
    start_ts = int((now - datetime.timedelta(days=30)).timestamp())
    end_ts = int((now + datetime.timedelta(days=180)).timestamp())

    users = list_users()
    print(f"{len(users)} Connecteam users")

    rows = []
    for u in users:
        uid = u.get("userId") or u.get("id")
        if uid is None:
            continue
        name = user_name(u)
        try:
            entries = unavailabilities_for(uid, start_ts, end_ts)
        except SystemExit as e:
            print(f"  ⚠ {name}: {e}")
            continue
        for e in entries:
            st = (e.get("startTime") or {}).get("timestamp")
            et = (e.get("endTime") or {}).get("timestamp")
            if not st or not et:
                continue
            etype = e.get("type") or "timeOff"
            rows.append({
                "connecteam_user_id": str(uid), "name": name,
                "start_date": to_date(st), "end_date": to_date(et),
                "type": etype, "policy_name": e.get("policyName"),
                "note": e.get("note") or None,
                "synced_at": now.isoformat() + "Z",
            })
        print(f"  {name}: {len(entries)} entries")

    sb_upsert("staff_time_off", rows, on_conflict="connecteam_user_id,start_date,end_date,type")
    print(f"Synced {len(rows)} time-off/unavailability rows across {len(users)} users.")


if __name__ == "__main__":
    from sync_status_util import record
    try:
        main(); record("Connecteam", True)
    except Exception as e:
        record("Connecteam", False, str(e)); raise
