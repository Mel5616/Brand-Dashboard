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
        flt = urllib.parse.quote(f"greater-than(created,{since})")
        url = f"https://a.klaviyo.com/api/reviews/?filter={flt}&fields[review]=email,author,rating,created,status,product,review_type&page[size]=100&sort=-created"
        d = klaviyo(key, url)
        if "err" in d:
            print(f"  ↷ {brand['name']}: reviews API {d['err']} (Klaviyo Reviews not enabled?)"); continue
        reviews = [r for r in d.get("data", []) if (r.get("attributes") or {}).get("email") and ((r.get("attributes") or {}).get("status") or {}).get("value") == "published"]
        print(f"  → {brand['name']}: {len(reviews)} published review(s) since {since[:10]}")
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
