#!/usr/bin/env python3
"""
Sync GA4 session/conversion stats for UTM Tracking (Plan > UTM Tracking).

For each brand's GA4 property, pulls sessions/conversions/revenue for the
last 180 days broken down by source × medium × campaign, and upserts into
utm_link_stats — keyed lower-case so it matches a tracked link regardless of
how the UTM was typed in (UTM values are otherwise case-sensitive in GA4).
The dashboard joins utm_links to this table on (brand, source, medium,
campaign) to show real traffic against each link.

Setup: same as scripts/sync_ga4.py (credentials.json + stores.config.json
ga4PropertyId per brand) — this reuses both, no extra setup.

Run:   python3 scripts/sync_utm_stats.py
"""

import sys, os, json
from datetime import date, timedelta, datetime, timezone

try:
    from google.analytics.data_v1beta import BetaAnalyticsDataClient
    from google.analytics.data_v1beta.types import RunReportRequest, DateRange, Dimension, Metric
    from google.oauth2 import service_account
except ImportError:
    print("Missing Google Analytics package. Run: pip3 install google-analytics-data")
    sys.exit(1)

try:
    from supabase import create_client
except ImportError:
    print("Missing supabase. Run: pip3 install supabase"); sys.exit(1)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(BASE_DIR, "stores.config.json")
ENV_PATH = os.path.join(BASE_DIR, ".env.local")

def load_env():
    if not os.path.exists(ENV_PATH):
        return
    with open(ENV_PATH) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            k = k.strip(); v = v.strip().strip('"').strip("'")
            if k not in os.environ:
                os.environ[k] = v

load_env()

WINDOW_DAYS = 180

def load_config():
    with open(CONFIG_PATH) as f:
        return json.load(f)

def get_ga4_client(credentials_path):
    creds = service_account.Credentials.from_service_account_file(
        credentials_path, scopes=["https://www.googleapis.com/auth/analytics.readonly"],
    )
    return BetaAnalyticsDataClient(credentials=creds)

def fetch_by_utm(client, property_id):
    end = date.today()
    start = end - timedelta(days=WINDOW_DAYS)
    req = RunReportRequest(
        property=f"properties/{property_id}",
        date_ranges=[DateRange(start_date=start.isoformat(), end_date=end.isoformat())],
        dimensions=[Dimension(name="sessionSource"), Dimension(name="sessionMedium"), Dimension(name="sessionCampaignName")],
        metrics=[Metric(name="sessions"), Metric(name="conversions"), Metric(name="totalRevenue")],
        limit=100000,
    )
    resp = client.run_report(req)
    out = []
    for row in resp.rows:
        source, medium, campaign = (d.value or "" for d in row.dimension_values)
        sessions, conversions, revenue = (float(m.value or 0) for m in row.metric_values)
        # (direct)/(none) is untracked traffic, not a UTM link — skip, keeps the table relevant
        if medium in ("(none)", "(not set)"):
            continue
        out.append({
            "source": source, "medium": medium, "campaign": campaign,
            "sessions": int(sessions), "conversions": conversions, "revenue": revenue,
        })
    return out

def sync_brand(db, client, brand, brand_id):
    property_id = brand.get("ga4PropertyId")
    if not property_id:
        print(f"  ↷ {brand['name']}: no ga4PropertyId, skipping")
        return
    print(f"  → {brand['name']} (property {property_id})")
    try:
        rows = fetch_by_utm(client, property_id)
    except Exception as e:
        print(f"    error — {e}")
        return
    for r in rows:
        row = {
            "brand_id": brand_id,
            "source": r["source"].strip().lower()[:200],
            "medium": r["medium"].strip().lower()[:100],
            "campaign": (r["campaign"] or "").strip().lower()[:150],
            "sessions": r["sessions"], "conversions": round(r["conversions"], 2), "revenue": round(r["revenue"], 2),
            "synced_at": datetime.now(timezone.utc).isoformat(),
        }
        db.table("utm_link_stats").upsert(row, on_conflict="brand_id,source,medium,campaign").execute()
    print(f"    {len(rows)} source/medium/campaign rows")

def main():
    config = load_config()
    creds_path = config.get("ga4ServiceAccountPath", "credentials.json")
    creds_full = os.path.join(BASE_DIR, creds_path)
    if not os.path.exists(creds_full):
        print(f"Service account credentials not found at: {creds_full}")
        sys.exit(1)

    url = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    db = create_client(url, key)
    client = get_ga4_client(creds_full)

    brands = config.get("brands", [])
    for i, brand in enumerate(brands):
        if not brand.get("ga4PropertyId"):
            continue
        try:
            sync_brand(db, client, brand, i)
        except Exception as e:
            print(f"  ERROR {brand.get('name')}: {e}")

    print("\nDone.")

if __name__ == "__main__":
    from sync_status_util import record
    try:
        main(); record("UTM stats", True)
    except Exception as e:
        record("UTM stats", False, str(e)); raise
