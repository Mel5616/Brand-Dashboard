#!/usr/bin/env python3
"""Review rewards poller (GitHub Actions, hourly).

Looks at every brand's Klaviyo account for reviews published in the last 3
days and hands each one to the dashboard, which issues the $5 any-brand code
and emails the reviewer. The dashboard is idempotent on review id, so
re-seeing a review is harmless. Needs stores.config.json (brand Klaviyo keys)
and SUPABASE_SERVICE_ROLE_KEY (to derive the shared key), nothing else.
"""
import json, os, sys, time, hashlib, urllib.request, urllib.parse
from datetime import datetime, timedelta, timezone

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(BASE_DIR, "stores.config.json")
DASHBOARD = os.environ.get("DASHBOARD_URL", "https://marketing.coolkidz.com.au")
KEY = hashlib.sha256(("review-reward:" + os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")).encode()).hexdigest()[:40]
LOOKBACK_DAYS = int(os.environ.get("REVIEW_LOOKBACK_DAYS", "3"))
MIRROR_DAYS = int(os.environ.get("REVIEW_MIRROR_DAYS", "400"))
SB_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
SB_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

def klaviyo(api_key, url):
    for attempt in range(6):
        req = urllib.request.Request(url, headers={"Authorization": f"Klaviyo-API-Key {api_key}", "revision": "2025-10-15", "accept": "application/json"})
        try:
            return json.load(urllib.request.urlopen(req, timeout=30))
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(int(e.headers.get("Retry-After", "10")) + 1); continue
            return {"err": e.code, "body": e.read()[:200].decode()}
    return {"err": 429}

def klaviyo_pages(api_key, url):
    """Every page of a Klaviyo list endpoint (cursor pagination)."""
    out = []
    while url:
        d = klaviyo(api_key, url)
        if "err" in d:
            return d
        out += d.get("data", [])
        url = ((d.get("links") or {}).get("next"))
        if url: time.sleep(0.4)
    return {"data": out}

def mirror(brand_id, brand_name, reviews):
    """Upsert this brand's reviews (all statuses) into klaviyo_reviews so the
    dashboard's Reviews tab can show every brand without live Klaviyo keys."""
    if not SB_URL or not SB_KEY or not reviews:
        return 0
    rows = []
    for r in reviews:
        a = r.get("attributes") or {}
        p = a.get("product") or {}
        rows.append({"id": r["id"], "brand_id": brand_id, "brand_name": brand_name, "rating": a.get("rating"), "title": a.get("title"),
                     "content": a.get("content"), "author": a.get("author"), "email": a.get("email"), "product_name": p.get("name"),
                     "product_url": p.get("url"), "product_image": p.get("image_url"), "status": (a.get("status") or {}).get("value"),
                     "verified": a.get("verified"), "review_type": a.get("review_type"), "smart_quote": a.get("smart_quote"),
                     "public_reply": a.get("public_reply"), "created": a.get("created"), "synced_at": datetime.now(timezone.utc).isoformat()})
    req = urllib.request.Request(f"{SB_URL}/rest/v1/klaviyo_reviews?on_conflict=id", data=json.dumps(rows).encode(), method="POST",
                                 headers={"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}", "Content-Type": "application/json",
                                          "Prefer": "resolution=merge-duplicates,return=minimal"})
    try:
        urllib.request.urlopen(req, timeout=60); return len(rows)
    except urllib.error.HTTPError as e:
        print(f"     mirror failed: HTTP {e.code} {e.read()[:200].decode()}"); return 0

def issue(payload):
    req = urllib.request.Request(f"{DASHBOARD}/api/review-rewards/issue", data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json", "x-reward-key": KEY}, method="POST")
    try:
        return json.load(urllib.request.urlopen(req, timeout=60))
    except urllib.error.HTTPError as e:
        return {"ok": False, "error": f"HTTP {e.code} {e.read()[:200].decode()}"}
    except Exception as e:
        return {"ok": False, "error": str(e)[:200]}

def main():
    cfg = json.load(open(CONFIG_PATH))
    since = (datetime.now(timezone.utc) - timedelta(days=LOOKBACK_DAYS)).strftime("%Y-%m-%dT%H:%M:%SZ")
    issued = dup = failed = 0
    for i, brand in enumerate(cfg.get("brands", [])):
        key = brand.get("klaviyoApiKey")
        if not key:
            continue
        mirror_since = (datetime.now(timezone.utc) - timedelta(days=MIRROR_DAYS)).strftime("%Y-%m-%dT%H:%M:%SZ")
        flt = urllib.parse.quote(f"greater-or-equal(created,{mirror_since})")
        url = f"https://a.klaviyo.com/api/reviews/?filter={flt}&page[size]=100&sort=-created"
        d = klaviyo_pages(key, url)
        if "err" in d:
            print(f"  ↷ {brand['name']}: reviews API {d['err']} (Klaviyo Reviews not enabled?)"); continue
        everything = d.get("data", [])
        mirrored = mirror(i, brand["name"], everything)
        reviews = [r for r in everything if (r.get("attributes") or {}).get("email") and ((r.get("attributes") or {}).get("status") or {}).get("value") == "published"
                   and ((r.get("attributes") or {}).get("created") or "") >= since]
        print(f"  → {brand['name']}: {len(everything)} review(s) mirrored ({mirrored} written), {len(reviews)} published since {since[:10]} to reward")
        for r in reviews:
            a = r["attributes"]
            res = issue({"brand_id": i, "brand_name": brand["name"], "review_id": f"kl-{r['id']}", "email": a["email"], "name": a.get("author"),
                         "rating": a.get("rating"), "product_url": (a.get("product") or {}).get("url"), "created": a.get("created")})
            if res.get("ok") and (res.get("duplicate") or res.get("throttled")): dup += 1
            elif res.get("ok"): issued += 1; print(f"     ✓ {a['email']} → {res.get('code')} on {res.get('stores')} stores, emailed={res.get('emailed')}")
            else: failed += 1; print(f"     ✗ {a['email']}: {res.get('error')}")
            time.sleep(0.5)
        time.sleep(0.5)
    print(f"done: {issued} issued, {dup} already rewarded, {failed} failed")
    sys.exit(1 if failed else 0)

if __name__ == "__main__":
    main()
