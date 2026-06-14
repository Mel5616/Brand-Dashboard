#!/usr/bin/env python3
"""
Sync GA4 organic traffic metrics to Supabase.

Setup:
  1. In Google Cloud Console:
     - Create a project (or reuse one)
     - Enable "Google Analytics Data API"
     - Create a service account, download JSON key → save as credentials.json in project root

  2. In GA4:
     - Admin → Property Access Management → Add the service account email as Viewer

  3. In stores.config.json, add:
       "ga4ServiceAccountPath": "credentials.json"
     For each brand:
       "ga4PropertyId": "123456789"  (numeric ID from GA4 Admin → Property Settings)

  4. Run SQL in Supabase:
       CREATE TABLE IF NOT EXISTS ga4_metrics (
         brand_id INT NOT NULL, month_key TEXT NOT NULL,
         sessions INT DEFAULT 0, organic_sessions INT DEFAULT 0,
         new_users INT DEFAULT 0, engagement_rate NUMERIC DEFAULT 0,
         PRIMARY KEY (brand_id, month_key)
       );
       ALTER TABLE ga4_metrics DISABLE ROW LEVEL SECURITY;

  5. pip3 install google-analytics-data supabase python-dotenv
  6. python3 scripts/sync_ga4.py
"""

import sys, os, json
from datetime import date
from calendar import monthrange

try:
    from google.analytics.data_v1beta import BetaAnalyticsDataClient
    from google.analytics.data_v1beta.types import (
        RunReportRequest, DateRange, Dimension, Metric, FilterExpression,
        Filter, FilterExpressionList,
    )
    from google.oauth2 import service_account
except ImportError:
    print("Missing Google Analytics package.")
    print("Run: pip3 install google-analytics-data")
    sys.exit(1)

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

def get_ga4_client(credentials_path):
    creds = service_account.Credentials.from_service_account_file(
        credentials_path,
        scopes=["https://www.googleapis.com/auth/analytics.readonly"],
    )
    return BetaAnalyticsDataClient(credentials=creds)

def fetch_month(client, property_id, year, month):
    first = date(year, month, 1)
    last  = date(year, month, monthrange(year, month)[1])
    date_range = DateRange(start_date=first.isoformat(), end_date=last.isoformat())

    # Total sessions + new users + engagement rate
    total_req = RunReportRequest(
        property=f"properties/{property_id}",
        date_ranges=[date_range],
        metrics=[
            Metric(name="sessions"),
            Metric(name="newUsers"),
            Metric(name="engagementRate"),
        ],
    )
    total_resp = client.run_report(total_req)
    sessions = new_users = eng_rate = 0
    if total_resp.rows:
        row = total_resp.rows[0]
        sessions  = int(row.metric_values[0].value or 0)
        new_users = int(row.metric_values[1].value or 0)
        eng_rate  = float(row.metric_values[2].value or 0)

    # Organic sessions only
    organic_req = RunReportRequest(
        property=f"properties/{property_id}",
        date_ranges=[date_range],
        dimensions=[Dimension(name="sessionDefaultChannelGroup")],
        metrics=[Metric(name="sessions")],
        dimension_filter=FilterExpression(
            filter=Filter(
                field_name="sessionDefaultChannelGroup",
                string_filter=Filter.StringFilter(value="Organic Search"),
            )
        ),
    )
    organic_resp  = client.run_report(organic_req)
    organic_sessions = 0
    if organic_resp.rows:
        organic_sessions = int(organic_resp.rows[0].metric_values[0].value or 0)

    return sessions, organic_sessions, new_users, eng_rate

def sync_brand(db, client, brand, brand_id):
    property_id = brand.get("ga4PropertyId")
    if not property_id:
        print(f"  ↷ {brand['name']}: no ga4PropertyId, skipping")
        return

    print(f"  → {brand['name']} (property {property_id})")

    for mk in MONTH_KEYS:
        year, month = int(mk[:4]), int(mk[5:])
        try:
            sessions, organic, new_users, eng_rate = fetch_month(client, property_id, year, month)
        except Exception as e:
            print(f"    {mk}: error — {e}")
            continue

        row = {
            "brand_id": brand_id,
            "month_key": mk,
            "sessions": sessions,
            "organic_sessions": organic,
            "new_users": new_users,
            "engagement_rate": round(eng_rate, 4),
        }
        db.table("ga4_metrics").upsert(row, on_conflict="brand_id,month_key").execute()
        organic_pct = f"{organic/sessions*100:.0f}%" if sessions > 0 else "—"
        print(f"    {mk}: sessions={sessions:,} organic={organic:,} ({organic_pct}) new_users={new_users:,} eng={eng_rate:.1%}")

def main():
    config = load_config()
    creds_path = config.get("ga4ServiceAccountPath", "credentials.json")
    creds_full = os.path.join(BASE_DIR, creds_path)

    if not os.path.exists(creds_full):
        print(f"Service account credentials not found at: {creds_full}")
        print("See setup instructions at the top of this file.")
        sys.exit(1)

    url = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    db  = create_client(url, key)
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
    main()
