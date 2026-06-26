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

BASE_DIR    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(BASE_DIR, ".env.local"))
    load_dotenv()
except ImportError:
    pass
CONFIG_PATH = os.path.join(BASE_DIR, "stores.config.json")

MONTH_KEYS = [
    "2025-07","2025-08","2025-09","2025-10","2025-11","2025-12",
    "2026-01","2026-02","2026-03","2026-04","2026-05","2026-06",
]

def load_config():
    with open(CONFIG_PATH) as f:
        return json.load(f)

def klaviyo_get(api_key, path, params=None):
    headers = {
        "Authorization": f"Klaviyo-API-Key {api_key}",
        "revision": "2024-10-15",
        "Accept": "application/json",
    }
    url = f"https://a.klaviyo.com/api/{path}"
    r = requests.get(url, headers=headers, params=params, timeout=20)
    r.raise_for_status()
    return r.json()

def klaviyo_post(api_key, path, payload):
    headers = {
        "Authorization": f"Klaviyo-API-Key {api_key}",
        "revision": "2024-10-15",
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

# True email subscriber base = profile_count of a segment the user creates per account
# in Klaviyo (condition: "can receive email marketing"). Match it by name, read-only.
SUBSCRIBER_SEGMENT_NAMES = {
    "email subscribers", "subscribers", "all subscribers", "email marketing subscribers",
    "newsletter subscribers", "dashboard - email subscribers", "dashboard – email subscribers",
}

def get_subscriber_count(api_key):
    """Find a segment named like 'Email Subscribers' and return its profile_count.
    Returns 0 if no such segment exists yet. Read-only (no segments:write needed)."""
    seg_id = None
    try:
        data = klaviyo_get(api_key, "segments/", {"fields[segment]": "name"})
        while True:
            for s in data.get("data", []):
                name = (s.get("attributes", {}).get("name") or "").strip().lower()
                if name in SUBSCRIBER_SEGMENT_NAMES:
                    seg_id = s["id"]; break
            nxt = (data.get("links") or {}).get("next")
            if seg_id or not nxt:
                break
            headers = {"Authorization": f"Klaviyo-API-Key {api_key}", "revision": "2024-10-15", "Accept": "application/json"}
            r = requests.get(nxt, headers=headers, timeout=20); r.raise_for_status(); data = r.json()
    except Exception:
        return 0
    if not seg_id:
        return 0
    try:
        d = klaviyo_get(api_key, f"segments/{seg_id}/", {"additional-fields[segment]": "profile_count"})
        return int(d.get("data", {}).get("attributes", {}).get("profile_count") or 0)
    except Exception:
        return 0

def get_metric_map(api_key):
    """Return {metric_name: id} for the whole account (name isn't a filterable field,
    so we list all metrics and match client-side). Follows pagination."""
    out = {}
    data = klaviyo_get(api_key, "metrics/")
    while True:
        for m in data.get("data", []):
            out[m["attributes"]["name"]] = m["id"]
        nxt = (data.get("links") or {}).get("next")
        if not nxt:
            break
        headers = {
            "Authorization": f"Klaviyo-API-Key {api_key}",
            "revision": "2024-10-15",
            "Accept": "application/json",
        }
        r = requests.get(nxt, headers=headers, timeout=20)
        r.raise_for_status()
        data = r.json()
    return out

def month_bounds(year, month):
    first = date(year, month, 1)
    nxt   = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    return first, nxt

def metric_aggregate(api_key, metric_id, year, month, measurement, by=None):
    """Monthly aggregate. Returns the list of data rows ({dimensions, measurements})."""
    first, nxt = month_bounds(year, month)
    attrs = {
        "metric_id": metric_id,
        "measurements": [measurement],
        "interval": "month",
        "timezone": "UTC",
        "filter": [
            f"greater-or-equal(datetime,{first.isoformat()}T00:00:00+00:00)",
            f"less-than(datetime,{nxt.isoformat()}T00:00:00+00:00)",
        ],
    }
    if by:
        attrs["by"] = by
    payload = {"data": {"type": "metric-aggregate", "attributes": attrs}}
    try:
        data = klaviyo_post(api_key, "metric-aggregates/", payload)
        return data.get("data", {}).get("attributes", {}).get("data", []) or []
    except Exception as e:
        print(f"    Warning: metric aggregate failed — {e}")
        return []

def agg_total(api_key, metric_id, year, month, measurement):
    """Single scalar for a count/sum metric (no grouping)."""
    rows = metric_aggregate(api_key, metric_id, year, month, measurement)
    if rows:
        vals = rows[0].get("measurements", {}).get(measurement, [])
        return vals[0] if vals else 0
    return 0

def agg_email_revenue(api_key, metric_id, year, month):
    """Email-attributed Placed Order revenue, grouped by $attributed_channel."""
    rows = metric_aggregate(api_key, metric_id, year, month, "sum_value", by=["$attributed_channel"])
    for r in rows:
        if "$email_channel" in (r.get("dimensions") or []):
            vals = r.get("measurements", {}).get("sum_value", [])
            return vals[0] if vals else 0
    return 0

def sync_brand(db, api_key, brand, brand_id):
    list_id = brand.get("klaviyoListId")
    if not api_key:
        print(f"  ↷ {brand['name']}: no klaviyoApiKey, skipping")
        return

    print(f"  → {brand['name']}" + (f" (list {list_id})" if list_id else " (no list — subscriber count skipped)"))

    # Look up metric IDs once (name isn't filterable, so fetch all + match)
    try:
        metrics     = get_metric_map(api_key)
    except Exception as e:
        print(f"    Error fetching metrics: {e}")
        return
    received_id = metrics.get("Received Email")   # Klaviyo has no "Sent Email"; delivered = Received
    opened_id   = metrics.get("Opened Email")
    clicked_id  = metrics.get("Clicked Email")
    revenue_id  = metrics.get("Placed Order")

    list_size = get_subscriber_count(api_key)
    print(f"    Subscribers: {list_size:,}" + ("" if list_size else "  (no 'Email Subscribers' segment found — create one in Klaviyo)"))

    for mk in MONTH_KEYS:
        year, month = int(mk[:4]), int(mk[5:])

        # "unique" = distinct profiles, so open/click rates match Klaviyo's own
        # reporting and don't exceed 100% (Apple MPP inflates total-open counts).
        sent    = agg_total(api_key, received_id, year, month, "unique") if received_id else 0
        opened  = agg_total(api_key, opened_id,   year, month, "unique") if opened_id   else 0
        clicked = agg_total(api_key, clicked_id,  year, month, "unique") if clicked_id  else 0
        revenue = agg_email_revenue(api_key, revenue_id, year, month)    if revenue_id  else 0

        # Cap at 100%: in low-volume months, opens/clicks of emails delivered in a
        # prior month can exceed that month's deliveries, pushing the ratio over 100%.
        open_rate  = min(100.0, opened  / sent * 100) if sent > 0 else 0
        click_rate = min(100.0, clicked / sent * 100) if sent > 0 else 0

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
        print(f"    {mk}: delivered={int(sent):,} open={open_rate:.1f}% click={click_rate:.1f}% email_rev=${revenue:,.0f}")
        time.sleep(0.2)

def main():
    config = load_config()

    url = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    db  = create_client(url, key)

    brands = config.get("brands", [])
    for i, brand in enumerate(brands):
        # Per-brand key takes priority; fall back to global key if set
        api_key = brand.get("klaviyoApiKey") or config.get("klaviyoApiKey")
        if not api_key:
            print(f"  ↷ {brand.get('name')}: missing klaviyoApiKey, skipping")
            continue
        try:
            sync_brand(db, api_key, brand, i)
        except Exception as e:
            print(f"  ERROR {brand.get('name')}: {e}")

    print("\nDone.")

if __name__ == "__main__":
    main()
