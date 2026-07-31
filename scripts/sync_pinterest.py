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
# The v5 /analytics endpoint only serves the trailing 90 days at all (older
# history needs the async /reports endpoint) — so we sync a rolling 89-day
# window and let the table accumulate history from daily runs.
DAILY_START = _date.today() - _timedelta(days=89)
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
        return f"{e} {body}".strip()

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

def _api_get(path, token, params=None):
    url = f"{API_BASE}{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url)
    req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req, context=ssl.create_default_context(), timeout=40) as r:
        return json.loads(r.read().decode())

# Organic metric keys -> our columns
_ORG_MAP = {
    "IMPRESSION": "impressions", "ENGAGEMENT": "engagement", "PIN_CLICK": "pin_clicks",
    "OUTBOUND_CLICK": "outbound_clicks", "SAVE": "saves",
}

def sync_organic(brand_id, name, ad_account_id, token):
    """Organic (non-paid) profile + engagement, fetched on behalf of the brand's
    ad account. Monthly rollups for the trailing 89 days + a top-pins refresh."""
    print(f"  {name} organic ...", end=" ", flush=True)
    try:
        # Per-calendar-month summary metrics, clamped to the 89-day API window
        month_rows = []
        cur = _date(DAILY_START.year, DAILY_START.month, 1)
        while cur <= TODAY:
            m_end = (_date(cur.year + (cur.month == 12), cur.month % 12 + 1, 1) - _timedelta(days=1))
            since, until = max(cur, DAILY_START), min(m_end, TODAY)
            d = _api_get("/user_account/analytics", token, {
                "start_date": since.isoformat(), "end_date": until.isoformat(),
                "ad_account_id": ad_account_id, "from_claimed_content": "BOTH",
            })
            s = (d.get("all") or {}).get("summary_metrics") or {}
            month_rows.append({"brand_id": brand_id, "month_key": cur.strftime("%Y-%m"),
                               **{col: int(s.get(k, 0) or 0) for k, col in _ORG_MAP.items()}})
            cur = m_end + _timedelta(days=1)

        # Profile snapshot lands on the current month's row
        prof = _api_get("/user_account", token, {"ad_account_id": ad_account_id})
        for r in month_rows:
            if r["month_key"] == TODAY.strftime("%Y-%m"):
                r["followers"]     = int(prof.get("follower_count", 0) or 0)
                r["monthly_views"] = max(int(prof.get("monthly_views", 0) or 0), 0)
                r["pin_count"]     = int(prof.get("pin_count", 0) or 0)
        sb_upsert("pinterest_organic", month_rows, on_conflict="brand_id,month_key")

        # Top pins by impressions over the trailing 30 days (replace wholesale)
        since30 = (TODAY - _timedelta(days=30)).isoformat()
        top = _api_get("/user_account/analytics/top_pins", token, {
            "start_date": since30, "end_date": TODAY.isoformat(),
            "ad_account_id": ad_account_id, "sort_by": "IMPRESSION", "num_of_pins": 8,
        }).get("pins", [])
        pin_rows = []
        for i, p in enumerate(top):
            pid, met = p.get("pin_id"), p.get("metrics", {})
            if not pid:
                continue
            row = {"brand_id": brand_id, "pin_id": str(pid), "rank": i + 1,
                   "period_start": since30, "period_end": TODAY.isoformat(),
                   **{col: int(met.get(k, 0) or 0) for k, col in _ORG_MAP.items()}}
            try:
                det = _api_get(f"/pins/{pid}", token, {"ad_account_id": ad_account_id})
                imgs = ((det.get("media") or {}).get("images") or {})
                img = (imgs.get("600x") or imgs.get("400x300") or next(iter(imgs.values()), {})).get("url")
                row.update({"title": (det.get("title") or "")[:200] or None,
                            "link": (det.get("link") or "")[:500] or None, "image_url": img})
            except (urllib.error.HTTPError, urllib.error.URLError):
                pass
            pin_rows.append(row)
        if pin_rows:
            # clear this brand's old top pins so dropped pins don't linger
            req = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/pinterest_top_pins?brand_id=eq.{brand_id}", method="DELETE")
            req.add_header("Authorization", f"Bearer {SUPABASE_SVC_KEY}")
            req.add_header("apikey", SUPABASE_ANON_KEY)
            try:
                urllib.request.urlopen(req, context=ssl.create_default_context(), timeout=30)
            except urllib.error.HTTPError:
                pass
            sb_upsert("pinterest_top_pins", pin_rows, on_conflict="brand_id,pin_id")
        print(f"✓  {len(month_rows)} months, {len(pin_rows)} top pins")
    except (urllib.error.HTTPError, urllib.error.URLError) as e:
        body = ""
        try:
            if hasattr(e, "read"): body = e.read().decode()[:200]
        except Exception:
            pass
        print(f"✗  {e} {body}")
        return f"organic: {e} {body}".strip()

def refresh_access_token(config):
    """Exchange the long-lived refresh token for a fresh 30-day access token.
    Needs pinterestAppId + pinterestAppSecret + pinterestRefreshToken in config."""
    app_id  = config.get("pinterestAppId")
    secret  = config.get("pinterestAppSecret")
    rtoken  = config.get("pinterestRefreshToken")
    if not (app_id and secret and rtoken):
        return None
    import base64
    body = urllib.parse.urlencode({"grant_type": "refresh_token", "refresh_token": rtoken}).encode()
    req = urllib.request.Request(f"{API_BASE}/oauth/token", data=body, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    req.add_header("Authorization", "Basic " + base64.b64encode(f"{app_id}:{secret}".encode()).decode())
    try:
        with urllib.request.urlopen(req, context=ssl.create_default_context(), timeout=30) as r:
            tok = json.loads(r.read().decode()).get("access_token")
            if tok:
                print("  ↻ refreshed Pinterest access token")
            return tok
    except urllib.error.HTTPError as e:
        print(f"  ✗ token refresh failed: {e.code} {e.read().decode()[:200]}")
        return None

def main():
    with open(CONFIG_PATH) as f:
        config = json.load(f)

    # Prefer a freshly refreshed token (access tokens die after 30 days).
    global_token = refresh_access_token(config) or config.get("pinterestAccessToken")
    brands = [b for b in config.get("brands", []) if b.get("pinterestAdAccountId")]
    if not brands:
        print("✗  No brands have pinterestAdAccountId set")
        print('   Add:  "pinterestAdAccountId": "1234567890"  to each brand in stores.config.json')
        return

    print(f"Syncing Pinterest Ads for {len(brands)} brand(s)...\n")
    errors = []
    for b in brands:
        token = b.get("pinterestAccessToken") or global_token
        if not token:
            print(f"  {b['name']} ({b['pinterestAdAccountId']}) ... ↷  no token (set pinterestAccessToken)")
            errors.append(f"{b['name']}: no token")
            continue
        err = sync_brand(b["id"], b["name"], b["pinterestAdAccountId"], token)
        if err:
            errors.append(f"{b['name']}: {err}")
        err2 = sync_organic(b["id"], b["name"], b["pinterestAdAccountId"], token)
        if err2:
            errors.append(f"{b['name']}: {err2}")
    from sync_status_util import record
    record("Pinterest Ads", not errors, "; ".join(errors))
    print("\nDone.")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        from sync_status_util import record
        record("Pinterest Ads", False, str(e)); raise
