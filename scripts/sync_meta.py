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
# End of the window = today (rolls automatically instead of stopping at a fixed date).
from datetime import date as _date, timedelta as _timedelta
DATE_END    = _date.today().isoformat()
# Day-level data is only pulled for a rolling ~18-month window (covers this FY plus
# the previous one) to keep the row count and API pagination sane.
DAILY_START = (_date.today() - _timedelta(days=550)).isoformat()

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

def sb_delete_where(table, column, value):
    if not SUPABASE_URL or not SUPABASE_SVC_KEY:
        return
    url = f'{SUPABASE_URL}/rest/v1/{table}?{column}=eq.{value}'
    req = urllib.request.Request(url, method='DELETE')
    req.add_header('Authorization', f'Bearer {SUPABASE_SVC_KEY}')
    req.add_header('apikey', SUPABASE_ANON_KEY)
    req.add_header('Prefer', 'return=minimal')
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=30) as r:
            return r.status
    except urllib.error.HTTPError as e:
        print(f'  ✗ Supabase delete {table}: {e.code} {e.read().decode()[:200]}')

def meta_get(url):
    ctx = ssl.create_default_context()
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, context=ctx, timeout=30) as r:
        return json.loads(r.read().decode())

def fetch_insights(account_id, access_token, breakdowns=None, time_increment="monthly", since=DATE_START):
    """Fetch account-level insights, auto-paginate. time_increment="monthly" (default)
    or 1 for day-level rows; `since` narrows the window (daily uses a shorter window)."""
    params = {
        "fields":         "spend,impressions,clicks,reach,actions,action_values",
        "time_increment": time_increment,
        "time_range":     json.dumps({"since": since, "until": DATE_END}),
        "level":          "account",
        "access_token":   access_token,
        "limit":          500,
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

def fetch_meta_ad_creatives(account_id, access_token, top_n=5):
    """Top-performing live ad copy + creative image (last 90 days), for the
    Marketing Snapshot report — mirrors fetch_google_ads_creatives."""
    params = {
        # image_url/thumbnail_url and the object_story_spec "picture" fields
        # are ALL small social-share-sized crops (Meta serves them at a fixed
        # small size regardless of what's requested) — the only reliable way
        # to get the real full-resolution creative is to resolve image_hash
        # through the /adimages endpoint below.
        "fields": "name,campaign{name},insights.date_preset(last_90d){clicks,impressions},"
                  "creative{title,body,image_hash,thumbnail_url,"
                  "object_story_spec{link_data{image_hash,child_attachments{image_hash}},video_data{image_url}}}",
        "effective_status": json.dumps(["ACTIVE"]),
        "access_token": access_token,
        "limit": 100,
    }
    url = f"https://graph.facebook.com/{API_VERSION}/{account_id}/ads?{urllib.parse.urlencode(params)}"
    ads = []
    while url and len(ads) < 300:
        resp = meta_get(url)
        if "error" in resp:
            raise RuntimeError(f"Meta API error: {resp['error'].get('message', resp['error'])}")
        ads.extend(resp.get("data", []))
        url = resp.get("paging", {}).get("next")

    prelim = []
    hashes = set()
    for ad in ads:
        cr = ad.get("creative") or {}
        body = (cr.get("body") or "").strip()
        title = (cr.get("title") or "").strip()
        if not body and not title:
            continue
        campaign_name = (ad.get("campaign") or {}).get("name", "")
        if "[test]" in campaign_name.lower() or campaign_name.lower().startswith("test"):
            continue
        story = cr.get("object_story_spec") or {}
        link_data = story.get("link_data") or {}
        video_data = story.get("video_data") or {}
        child = (link_data.get("child_attachments") or [{}])[0]
        image_hash = cr.get("image_hash") or link_data.get("image_hash") or child.get("image_hash")
        if image_hash:
            hashes.add(image_hash)
        insights = (ad.get("insights", {}).get("data") or [{}])[0]
        prelim.append({
            "campaign_name": campaign_name, "ad_name": ad.get("name", ""),
            "title": title, "body": body, "image_hash": image_hash,
            "fallback_image_url": video_data.get("image_url") or cr.get("thumbnail_url") or "",
            "clicks": int(float(insights.get("clicks", 0))),
            "impressions": int(float(insights.get("impressions", 0))),
        })

    # Resolve hashes -> real full-resolution URLs in one batch call.
    hash_url = {}
    if hashes:
        hp = {"hashes": json.dumps(list(hashes)), "fields": "hash,url", "access_token": access_token}
        hurl = f"https://graph.facebook.com/{API_VERSION}/{account_id}/adimages?{urllib.parse.urlencode(hp)}"
        try:
            resp = meta_get(hurl)
            for row in resp.get("data", []):
                if row.get("hash") and row.get("url"):
                    hash_url[row["hash"]] = row["url"]
        except Exception:
            pass

    ranked = []
    for r in prelim:
        image_url = hash_url.get(r.pop("image_hash")) or r.pop("fallback_image_url")
        # Catalogue/dynamic-product ads have no uploaded image_hash to resolve —
        # Meta only ever serves those through a small social-share crop
        # (recognisable by this proxy path), and there's no full-res version
        # reachable via the API. Drop the image rather than show it blurry;
        # the ad copy still comes through in the text section.
        if image_url and ("emg1/v/t13" in image_url or "p64x64" in image_url):
            image_url = ""
        r["image_url"] = image_url
        ranked.append(r)
    ranked.sort(key=lambda r: r["clicks"], reverse=True)
    return ranked[:top_n]

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
        return f"{e} {body}".strip()

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

    # Day-level rows for the custom (daily) date-range view.
    daily_upserts = []
    try:
        for row in fetch_insights(account_id, access_token, time_increment=1, since=DAILY_START):
            d = row.get("date_start", "")
            if len(d) < 10:
                continue
            pr = parse_row(row)
            daily_upserts.append({
                "brand_id": brand_id, "date": d,
                "spend": pr["spend"], "impressions": pr["impressions"], "clicks": pr["clicks"],
                "purchases": pr["purchases"], "revenue": pr["revenue"], "reach": pr["reach"],
            })
    except (urllib.error.HTTPError, RuntimeError):
        daily_upserts = []
    if daily_upserts:
        sb_upsert("meta_ads_daily", daily_upserts, on_conflict="brand_id,date")

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

    # Top ad copy + creative images for the Marketing Snapshot report —
    # wholesale-replaced per brand each run (what's live now, not a trend).
    n_creative = 0
    try:
        creatives = fetch_meta_ad_creatives(account_id, access_token)
        if creatives:
            sb_delete_where("meta_ads_creatives", "brand_id", brand_id)
            sb_delete_where("meta_ads_images", "brand_id", brand_id)
            creative_db = [{"brand_id": brand_id, "campaign_name": c["campaign_name"], "ad_name": c["ad_name"],
                             "title": c["title"], "body": c["body"], "clicks": c["clicks"], "impressions": c["impressions"]}
                            for c in creatives]
            sb_upsert("meta_ads_creatives", creative_db)
            image_db = [{"brand_id": brand_id, "campaign_name": c["campaign_name"], "ad_name": c["ad_name"], "image_url": c["image_url"]}
                        for c in creatives if c["image_url"]]
            if image_db:
                sb_upsert("meta_ads_images", image_db)
            n_creative = len(creative_db)
    except Exception as ce:
        print(f"  ⚠ ad creative sync skipped: {ce}", end=" ")

    if upserts or plat_upserts:
        print(f"✓  {len(upserts)} months, {len(plat_upserts)} platform rows, {len(daily_upserts)} daily rows, {n_creative} ad creatives")
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
    errors = []
    for b in brands:
        token = b.get("metaAccessToken") or global_token
        if not token:
            print(f"  {b['name']} ({b['metaAdAccountId']}) ... ↷  no token (set metaAccessToken)")
            errors.append(f"{b['name']}: no token")
            continue
        err = sync_brand(b["id"], b["name"], b["metaAdAccountId"], token)
        if err:
            errors.append(f"{b['name']}: {err}")
    from sync_status_util import record
    record("Meta Ads", not errors, "; ".join(errors))
    print("\nDone. Run python3 scripts/sync.py to refresh all Shopify data too.")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        from sync_status_util import record
        record("Meta Ads", False, str(e)); raise
