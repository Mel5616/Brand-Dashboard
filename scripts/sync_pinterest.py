#!/usr/bin/env python3
"""
Pinterest Ads Sync — fetches spend/impressions/clicks/conversions/revenue from the
Pinterest Ads API (v5) for all brands with a pinterestAdAccountId configured.
Writes monthly rows to `pinterest_ads` and day-level rows to `pinterest_ads_daily`.

Setup (one-time):
  1. Create a Pinterest developer app at developers.pinterest.com and complete the
     OAuth flow to obtain an access token with the `ads:read` scope.
  2. In stores.config.json add at the top level:
       "pinterestAccessToken": "YOUR_ACCESS_TOKEN"
  3. In stores.config.json add to each brand that runs Pinterest Ads:
       "pinterestAdAccountId": "1234567890"
     (find it in Pinterest Ads Manager → account switcher, or Business Hub.)

Run: python3 scripts/sync_pinterest.py
"""

import json, ssl, urllib.request, urllib.parse, urllib.error, os
from collections import defaultdict
from datetime import date as _date, timedelta as _timedelta

BASE_DIR    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(BASE_DIR, 'stores.config.json')
ENV_PATH    = os.path.join(BASE_DIR, '.env.local')

API_BASE = "https://api.pinterest.com/v5"
# Rolling ~18-month window (this FY + the previous one). Pinterest analytics caps a
# single request at 90 days, so we page through in 90-day windows.
DAILY_START = _date.today() - _timedelta(days=550)
TODAY       = _date.today()

# Pinterest analytics columns we request, mapped to our schema.
COLUMNS = [
    "SPEND_IN_MICRO_DOLLAR",
    "IMPRESSION_1",
    "CLICKTHROUGH_1",
    "TOTAL_CONVERSIONS",
    "TOTAL_CHECKOUT_VALUE_IN_MICRO_DOLLAR",
]

def load_env():
    if not os.path.exists(ENV_PATH):
        return
    with open(ENV_PATH) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            k, _, v = line.partition('=')
            k = k.strip(); v = v.strip().strip('"').strip("'")
            if k not in os.environ:
                os.environ[k] = v

load_env()

SUPABASE_URL      = os.environ.get('NEXT_PUBLIC_SUPABASE_URL', '')
SUPABASE_SVC_KEY  = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
SUPABASE_ANON_KEY = os.environ.get('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')

def sb_upsert(table, rows, on_conflict=None):
    if not rows or not SUPABASE_URL or not SUPABASE_SVC_KEY:
        return
    url = f'{SUPABASE_URL}/rest/v1/{table}'
    if on_conflict:
        url += f'?on_conflict={on_conflict}'
    req = urllib.request.Request(url, data=json.dumps(rows).encode(), method='POST')
    req.add_header('Content-Type', 'application/json')
    req.add_header('Authorization', f'Bearer {SUPABASE_SVC_KEY}')
    req.add_header('apikey', SUPABASE_ANON_KEY)
    req.add_header('Prefer', 'resolution=merge-duplicates')
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=30) as r:
            return r.status
    except urllib.error.HTTPError as e:
        print(f'  ✗ Supabase {table}: {e.code} {e.read().decode()[:300]}')

def _windows(start, end, size=90):
    """Yield (since, until) 90-day windows covering [start, end]."""
    cur = start
    while cur <= end:
        stop = min(cur + _timedelta(days=size - 1), end)
        yield cur.isoformat(), stop.isoformat()
        cur = stop + _timedelta(days=1)

def fetch_daily(ad_account_id, token, since, until):
    """Fetch DAY-granularity analytics rows for one 90-day window."""
    params = {
        "start_date":  since,
        "end_date":    until,
        "granularity": "DAY",
        "columns":     ",".join(COLUMNS),
    }
    url = f"{API_BASE}/ad_accounts/{ad_account_id}/analytics?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url)
    req.add_header("Authorization", f"Bearer {token}")
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, context=ctx, timeout=40) as r:
        payload = json.loads(r.read().decode())
    # v5 returns a list of per-day metric objects (each carries a DATE field).
    return payload if isinstance(payload, list) else payload.get("data", payload.get("all", []))

def parse_row(row):
    g = lambda k: float(row.get(k, 0) or 0)
    spend   = round(g("SPEND_IN_MICRO_DOLLAR") / 1_000_000, 2)
    revenue = round(g("TOTAL_CHECKOUT_VALUE_IN_MICRO_DOLLAR") / 1_000_000, 2)
    return {
        "spend":       spend,
        "impressions": int(g("IMPRESSION_1")),
        "clicks":      int(g("CLICKTHROUGH_1")),
        "purchases":   round(g("TOTAL_CONVERSIONS"), 2),
        "revenue":     revenue,
    }

def sync_brand(brand_id, name, ad_account_id, token):
    print(f"  {name} ({ad_account_id}) ...", end=" ", flush=True)
    daily = {}   # date -> parsed row
    try:
        for since, until in _windows(DAILY_START, TODAY):
            for row in fetch_daily(ad_account_id, token, since, until):
                d = row.get("DATE") or row.get("date") or ""
                if len(d) < 10:
                    continue
                daily[d] = parse_row(row)
    except (urllib.error.HTTPError, urllib.error.URLError) as e:
        body = ""
        try:
            if hasattr(e, "read"): body = e.read().decode()[:300]
        except Exception:
            pass
        print(f"✗  {e} {body}")
        return

    if not daily:
        print("—  no data")
        return

    # Daily upserts
    daily_rows = [{"brand_id": brand_id, "date": d, **v} for d, v in sorted(daily.items())]
    sb_upsert("pinterest_ads_daily", daily_rows, on_conflict="brand_id,date")

    # Roll days up into months for the monthly table
    months = defaultdict(lambda: {"spend": 0.0, "impressions": 0, "clicks": 0, "purchases": 0.0, "revenue": 0.0})
    for d, v in daily.items():
        m = months[d[:7]]
        m["spend"] += v["spend"]; m["impressions"] += v["impressions"]; m["clicks"] += v["clicks"]
        m["purchases"] += v["purchases"]; m["revenue"] += v["revenue"]
    month_rows = []
    for mk, m in sorted(months.items()):
        spend = round(m["spend"], 2)
        month_rows.append({
            "brand_id": brand_id, "month_key": mk,
            "spend": spend, "impressions": m["impressions"], "clicks": m["clicks"],
            "purchases": round(m["purchases"], 2), "revenue": round(m["revenue"], 2),
            "roas": round(m["revenue"] / spend, 4) if spend > 0 else 0,
        })
    sb_upsert("pinterest_ads", month_rows, on_conflict="brand_id,month_key")
    print(f"✓  {len(month_rows)} months, {len(daily_rows)} daily rows")

def main():
    with open(CONFIG_PATH) as f:
        config = json.load(f)

    global_token = config.get("pinterestAccessToken")
    brands = [b for b in config.get("brands", []) if b.get("pinterestAdAccountId")]
    if not brands:
        print("✗  No brands have pinterestAdAccountId set")
        print('   Add:  "pinterestAdAccountId": "1234567890"  to each brand in stores.config.json')
        return

    print(f"Syncing Pinterest Ads for {len(brands)} brand(s)...\n")
    for b in brands:
        token = b.get("pinterestAccessToken") or global_token
        if not token:
            print(f"  {b['name']} ({b['pinterestAdAccountId']}) ... ↷  no token (set pinterestAccessToken)")
            continue
        sync_brand(b["id"], b["name"], b["pinterestAdAccountId"], token)
    print("\nDone.")

if __name__ == "__main__":
    main()
