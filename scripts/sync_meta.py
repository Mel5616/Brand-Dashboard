#!/usr/bin/env python3
"""
Meta Ads Sync — fetches monthly spend/impressions/clicks/purchases/revenue
from the Meta Marketing API for all brands with metaAdAccountId configured.

Setup (one-time):
  1. Go to business.facebook.com → Settings → Users → System Users
     Create a System User, add your ad accounts, generate a token with
     ads_read + business_management permissions (never expires).
  2. In stores.config.json add at the top level:
       "metaAccessToken": "YOUR_SYSTEM_USER_TOKEN"
  3. In stores.config.json add to each brand that has Meta Ads:
       "metaAdAccountId": "act_XXXXXXXXXXXX"
     (find your account ID in Meta Ads Manager → top-left dropdown)

Run: python3 scripts/sync_meta.py
"""

import json, ssl, urllib.request, urllib.parse, os

BASE_DIR     = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH  = os.path.join(BASE_DIR, 'stores.config.json')
ENV_PATH     = os.path.join(BASE_DIR, '.env.local')

API_VERSION = "v20.0"
DATE_START  = "2024-07-01"
DATE_END    = "2026-06-30"

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

def meta_get(url):
    ctx = ssl.create_default_context()
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, context=ctx, timeout=30) as r:
        return json.loads(r.read().decode())

def fetch_insights(account_id, access_token, breakdowns=None):
    """Fetch monthly account-level insights, auto-paginate."""
    params = {
        "fields":         "spend,impressions,clicks,reach,actions,action_values",
        "time_increment": "monthly",
        "time_range":     json.dumps({"since": DATE_START, "until": DATE_END}),
        "level":          "account",
        "access_token":   access_token,
        "limit":          100,
    }
    if breakdowns:
        params["breakdowns"] = breakdowns
    url  = f"https://graph.facebook.com/{API_VERSION}/{account_id}/insights?{urllib.parse.urlencode(params)}"
    data = []
    while url:
        resp = meta_get(url)
        if "error" in resp:
            raise RuntimeError(f"Meta API error: {resp['error'].get('message', resp['error'])}")
        data.extend(resp.get("data", []))
        url = resp.get("paging", {}).get("next")
    return data

def pick_action(items, *types):
    """Return the first matching action value from an actions/action_values list."""
    for t in types:
        for item in (items or []):
            if item.get("action_type") == t:
                return float(item.get("value", 0))
    return 0.0

def parse_row(row):
    """Extract common fields from an insights row."""
    actions = row.get("actions", [])
    values  = row.get("action_values", [])
    purchases = int(pick_action(actions, "purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"))
    revenue   = pick_action(values,  "purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase")
    spend     = round(float(row.get("spend", 0)), 2)
    impr      = int(float(row.get("impressions", 0)))
    clicks    = int(float(row.get("clicks", 0)))
    return {
        "spend":       spend,
        "impressions": impr,
        "clicks":      clicks,
        "reach":       int(float(row.get("reach", 0))),
        "purchases":   purchases,
        "revenue":     round(revenue, 2),
        "roas":        round(revenue / spend, 4) if spend > 0 else 0,
        "cpm":         round(spend / impr * 1000, 2) if impr > 0 else 0,
        "cpc":         round(spend / clicks, 2) if clicks > 0 else 0,
    }

def sync_brand(brand_id, name, account_id, access_token):
    print(f"  {name} ({account_id}) ...", end=" ", flush=True)
    try:
        rows = fetch_insights(account_id, access_token)
    except (urllib.error.HTTPError, RuntimeError) as e:
        body = ""
        try:
            if hasattr(e, "read"): body = e.read().decode()[:400]
        except Exception:
            pass
        print(f"✗  {e} {body}")
        return

    # Total (account-level) upserts
    upserts = []
    for row in rows:
        date_str = row.get("date_start", "")
        if len(date_str) < 7:
            continue
        month_key = date_str[:7]
        upserts.append({"brand_id": brand_id, "month_key": month_key, **parse_row(row)})

    if upserts:
        sb_upsert("meta_ads", upserts, on_conflict="brand_id,month_key")

    # Platform breakdown
    try:
        platform_rows = fetch_insights(account_id, access_token, breakdowns="publisher_platform")
    except (urllib.error.HTTPError, RuntimeError):
        platform_rows = []

    plat_upserts = []
    for row in platform_rows:
        date_str = row.get("date_start", "")
        if len(date_str) < 7:
            continue
        platform = row.get("publisher_platform", "unknown")
        if platform not in ("facebook", "instagram", "messenger", "audience_network"):
            continue
        plat_upserts.append({
            "brand_id": brand_id,
            "month_key": date_str[:7],
            "platform": platform,
            **parse_row(row),
        })

    if plat_upserts:
        sb_upsert("meta_ads_platform", plat_upserts, on_conflict="brand_id,month_key,platform")

    if upserts or plat_upserts:
        print(f"✓  {len(upserts)} months, {len(plat_upserts)} platform rows")
    else:
        print("—  no data")

def main():
    with open(CONFIG_PATH) as f:
        config = json.load(f)

    # Per-brand token wins (accounts can live in different Business portfolios);
    # falls back to the top-level metaAccessToken for brands in the main portfolio.
    global_token = config.get("metaAccessToken")

    brands = [b for b in config.get("brands", []) if b.get("metaAdAccountId")]
    if not brands:
        print("✗  No brands have metaAdAccountId set")
        print('   Add:  "metaAdAccountId": "act_XXXXXXXXXXXX"  to each brand in stores.config.json')
        return

    print(f"Syncing Meta Ads for {len(brands)} brand(s)...\n")
    for b in brands:
        token = b.get("metaAccessToken") or global_token
        if not token:
            print(f"  {b['name']} ({b['metaAdAccountId']}) ... ↷  no token (set metaAccessToken)")
            continue
        sync_brand(b["id"], b["name"], b["metaAdAccountId"], token)
    print("\nDone. Run python3 scripts/sync.py to refresh all Shopify data too.")

if __name__ == "__main__":
    main()
