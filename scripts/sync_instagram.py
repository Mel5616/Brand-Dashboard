#!/usr/bin/env python3
"""
Instagram Organic Sync — fetches monthly followers, reach, profile views,
and engagement for all brands with instagramAccountId configured.

Requires token with:  instagram_basic + instagram_manage_insights

Note: Instagram Insights API only returns data for the last ~90 days.
Older months will show 0 until data is available within the window.

Run: python3 scripts/sync_instagram.py
"""

import json, ssl, urllib.request, urllib.parse, os, sys
from calendar import monthrange

BASE_DIR    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(BASE_DIR, 'stores.config.json')
ENV_PATH    = os.path.join(BASE_DIR, '.env.local')

API        = "https://graph.facebook.com/v20.0"
MONTH_KEYS = [
    "2025-07","2025-08","2025-09","2025-10","2025-11","2025-12",
    "2026-01","2026-02","2026-03","2026-04","2026-05","2026-06",
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
            if k.strip() not in os.environ:
                os.environ[k.strip()] = v.strip().strip('"').strip("'")
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
    data = json.dumps(rows).encode()
    req  = urllib.request.Request(url, data=data, method='POST')
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

def ig_get(path, params, token):
    params = dict(params, access_token=token)
    url = f"{API}/{path}?{urllib.parse.urlencode(params)}"
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(url, context=ctx, timeout=20) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        raise RuntimeError(e.read().decode()[:300])

def month_range(month_key):
    y, m = int(month_key[:4]), int(month_key[5:7])
    last_day = monthrange(y, m)[1]
    return f"{y}-{m:02d}-01", f"{y}-{m:02d}-{last_day:02d}"

def fetch_reach(ig_id, month_key, token):
    """reach uses period=day, returns values array — sum them."""
    since, until = month_range(month_key)
    try:
        resp = ig_get(f"{ig_id}/insights", {
            "metric": "reach",
            "period": "day",
            "since":  since,
            "until":  until,
        }, token)
    except RuntimeError:
        return 0
    total = 0
    for item in resp.get("data", []):
        for v in item.get("values", []):
            total += v.get("value", 0) or 0
    return int(total)

def fetch_total_value_metric(ig_id, metric, month_key, token):
    """profile_views, accounts_engaged etc. use metric_type=total_value."""
    since, until = month_range(month_key)
    try:
        resp = ig_get(f"{ig_id}/insights", {
            "metric":      metric,
            "period":      "day",
            "metric_type": "total_value",
            "since":       since,
            "until":       until,
        }, token)
    except RuntimeError:
        return 0
    for item in resp.get("data", []):
        return int(item.get("total_value", {}).get("value", 0) or 0)
    return 0

def fetch_followers(ig_id, token):
    try:
        resp = ig_get(ig_id, {"fields": "followers_count"}, token)
        return int(resp.get("followers_count", 0))
    except RuntimeError:
        return 0

def sync_brand(brand_id, name, ig_id, token):
    print(f"  {name} (@{ig_id}) ...", end=" ", flush=True)

    followers_now = fetch_followers(ig_id, token)
    upserts = []

    for mk in MONTH_KEYS:
        reach            = fetch_reach(ig_id, mk, token)
        profile_views    = fetch_total_value_metric(ig_id, "profile_views",   mk, token)
        accounts_engaged = fetch_total_value_metric(ig_id, "accounts_engaged", mk, token)

        upserts.append({
            "brand_id":         brand_id,
            "month_key":        mk,
            "followers":        followers_now if mk == MONTH_KEYS[-1] else 0,
            "reach":            reach,
            "profile_views":    profile_views,
            "accounts_engaged": accounts_engaged,
        })

    if upserts:
        sb_upsert("instagram_organic", upserts, on_conflict="brand_id,month_key")
        print(f"✓  {followers_now:,} followers")
    else:
        print("—  no data")

def main():
    with open(CONFIG_PATH) as f:
        config = json.load(f)

    token = config.get("metaAccessToken")
    if not token:
        print("✗  No metaAccessToken in stores.config.json")
        sys.exit(1)

    brands = [b for b in config.get("brands", []) if b.get("instagramAccountId")]
    if not brands:
        print("✗  No brands have instagramAccountId set")
        print("   Run: python3 scripts/setup_instagram.py")
        sys.exit(1)

    print(f"Syncing Instagram organic data for {len(brands)} brand(s)...\n")
    for b in brands:
        sync_brand(b["id"], b["name"], b["instagramAccountId"], token)
    print("\nDone.")

if __name__ == "__main__":
    main()
