#!/usr/bin/env python3
"""
Sync Klaviyo email marketing metrics to Supabase.

Setup:
  1. In stores.config.json, add at the top level:
       "klaviyoApiKey": "pk_xxxxxxxxxxxxxxxx"
     For each brand that has Klaviyo, add:
       "klaviyoListId": "ABC123"  (from Klaviyo → Audience → Lists)

  2. Run SQL in Supabase:
       CREATE TABLE IF NOT EXISTS klaviyo_metrics (
         brand_id INT NOT NULL, month_key TEXT NOT NULL,
         list_size INT DEFAULT 0, emails_sent INT DEFAULT 0,
         open_rate NUMERIC DEFAULT 0, click_rate NUMERIC DEFAULT 0,
         revenue NUMERIC DEFAULT 0, unsubscribes INT DEFAULT 0,
         PRIMARY KEY (brand_id, month_key)
       );
       ALTER TABLE klaviyo_metrics DISABLE ROW LEVEL SECURITY;

  3. pip3 install requests supabase python-dotenv
  4. python3 scripts/sync_klaviyo.py
"""

import sys, os, json, time
from datetime import datetime, date
from calendar import monthrange

try:
    import requests
except ImportError:
    print("Missing requests. Run: pip3 install requests"); sys.exit(1)

try:
    from supabase import create_client
except ImportError:
    print("Missing supabase. Run: pip3 install supabase"); sys.exit(1)

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

BASE_DIR    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(BASE_DIR, "stores.config.json")

MONTH_KEYS = [
    "2025-07","2025-08","2025-09","2025-10","2025-11","2025-12",
    "2026-01","2026-02","2026-03","2026-04","2026-05",
]

def load_config():
    with open(CONFIG_PATH) as f:
        return json.load(f)

def klaviyo_get(api_key, path, params=None):
    headers = {
        "Authorization": f"Klaviyo-API-Key {api_key}",
        "revision": "2024-02-15",
        "Accept": "application/json",
    }
    url = f"https://a.klaviyo.com/api/{path}"
    r = requests.get(url, headers=headers, params=params, timeout=20)
    r.raise_for_status()
    return r.json()

def klaviyo_post(api_key, path, payload):
    headers = {
        "Authorization": f"Klaviyo-API-Key {api_key}",
        "revision": "2024-02-15",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    r = requests.post(f"https://a.klaviyo.com/api/{path}", headers=headers, json=payload, timeout=30)
    r.raise_for_status()
    return r.json()

def get_list_size(api_key, list_id):
    try:
        data = klaviyo_get(api_key, f"lists/{list_id}/", {"fields[list]": "profile_count"})
        return data.get("data", {}).get("attributes", {}).get("profile_count", 0)
    except Exception as e:
        print(f"    Warning: could not fetch list size — {e}")
        return 0

def get_metric_id(api_key, metric_name):
    data = klaviyo_get(api_key, "metrics/", {"filter": f"equals(name,\"{metric_name}\")"})
    items = data.get("data", [])
    return items[0]["id"] if items else None

def get_metric_aggregate(api_key, metric_id, year, month, measurement):
    """Fetch monthly aggregate for a given metric."""
    first = date(year, month, 1)
    last  = date(year, month, monthrange(year, month)[1])
    payload = {
        "data": {
            "type": "metric-aggregate",
            "attributes": {
                "metric_id": metric_id,
                "measurements": [measurement],
                "interval": "month",
                "page_size": 500,
                "filter": [
                    f"greater-or-equal(datetime,{first.isoformat()}T00:00:00+00:00)",
                    f"less-than(datetime,{last.isoformat()}T23:59:59+00:00)",
                ],
            },
        }
    }
    try:
        data = klaviyo_post(api_key, "metric-aggregates/", payload)
        results = data.get("data", {}).get("attributes", {}).get("data", {})
        dates = results.get("dates", [])
        vals  = results.get("measurements", {}).get(measurement, [])
        if dates and vals:
            return vals[0] if vals else 0
        return 0
    except Exception as e:
        print(f"    Warning: metric aggregate failed — {e}")
        return 0

def sync_brand(db, api_key, brand, brand_id):
    list_id = brand.get("klaviyoListId")
    if not list_id:
        print(f"  ↷ {brand['name']}: no klaviyoListId, skipping")
        return

    print(f"  → {brand['name']} (list {list_id})")

    # Get metric IDs once
    try:
        opened_id  = get_metric_id(api_key, "Opened Email")
        clicked_id = get_metric_id(api_key, "Clicked Email")
        sent_id    = get_metric_id(api_key, "Sent Email")
        revenue_id = get_metric_id(api_key, "Placed Order")
    except Exception as e:
        print(f"    Error fetching metric IDs: {e}")
        return

    list_size = get_list_size(api_key, list_id)
    print(f"    Subscribers: {list_size:,}")

    for mk in MONTH_KEYS:
        year, month = int(mk[:4]), int(mk[5:])

        sent    = get_metric_aggregate(api_key, sent_id,    year, month, "count")        if sent_id    else 0
        opened  = get_metric_aggregate(api_key, opened_id,  year, month, "count")        if opened_id  else 0
        clicked = get_metric_aggregate(api_key, clicked_id, year, month, "count")        if clicked_id else 0
        revenue = get_metric_aggregate(api_key, revenue_id, year, month, "sum_value")    if revenue_id else 0

        open_rate  = (opened  / sent * 100) if sent > 0 else 0
        click_rate = (clicked / sent * 100) if sent > 0 else 0

        row = {
            "brand_id": brand_id,
            "month_key": mk,
            "list_size": list_size,
            "emails_sent": int(sent),
            "open_rate": round(open_rate, 2),
            "click_rate": round(click_rate, 2),
            "revenue": round(float(revenue), 2),
        }
        db.table("klaviyo_metrics").upsert(row, on_conflict="brand_id,month_key").execute()
        print(f"    {mk}: sent={int(sent)} open={open_rate:.1f}% click={click_rate:.1f}% rev=${revenue:.0f}")
        time.sleep(0.3)

def main():
    config = load_config()
    api_key = config.get("klaviyoApiKey")
    if not api_key:
        print("No klaviyoApiKey found in stores.config.json")
        print("Add: \"klaviyoApiKey\": \"pk_your_private_key_here\"")
        sys.exit(1)

    url = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    db  = create_client(url, key)

    brands = config.get("brands", [])
    for i, brand in enumerate(brands):
        if not brand.get("klaviyoListId"):
            continue
        try:
            sync_brand(db, api_key, brand, i)
        except Exception as e:
            print(f"  ERROR {brand.get('name')}: {e}")

    print("\nDone.")

if __name__ == "__main__":
    main()
