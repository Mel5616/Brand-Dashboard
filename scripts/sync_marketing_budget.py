#!/usr/bin/env python3
"""
Sync marketing budgets from Google Sheets to Supabase.

The sheet has columns: Brand | Channel | Budget ($)
Channels: Google Advertising, Social Media (Meta), Klaviyo,
          Influencer Marketing, Photography, Shopify

Setup:
  1. Run SQL in Supabase (first time only):
       CREATE TABLE IF NOT EXISTS marketing_budgets (
         brand_id INT NOT NULL,
         channel  TEXT NOT NULL,
         annual_budget NUMERIC DEFAULT 0,
         fy TEXT NOT NULL DEFAULT '2025-26',
         PRIMARY KEY (brand_id, channel, fy)
       );
       ALTER TABLE marketing_budgets DISABLE ROW LEVEL SECURITY;

  2. In stores.config.json, add (if not already there):
       "marketingBudgetSheetId": "1GjvL7SVJEPTI6utLlhGVGn_z1FL9OEBs6ZE00p9uPTc",
       "marketingBudgetGid":     "YOUR_BUDGET_TAB_GID"
       (Find the gid by clicking the Budget tab — it appears in the URL as #gid=XXXXXXXX)

  3. python3 scripts/sync_marketing_budget.py

Environment:
  NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
"""

import sys, os, json, csv, re, urllib.request, urllib.error, ssl

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

try:
    from supabase import create_client
except ImportError:
    print("Missing supabase. Run: pip3 install supabase"); sys.exit(1)

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(BASE_DIR, ".env.local"))
    load_dotenv()
except ImportError:
    pass
CONFIG_PATH = os.path.join(BASE_DIR, "stores.config.json")

SHEET_ID = "1GjvL7SVJEPTI6utLlhGVGn_z1FL9OEBs6ZE00p9uPTc"
FY       = "2025-26"

# Map sheet brand names → brand_id in Supabase
BRAND_MAP = {
    "nanit":             0,
    "magic":             1,
    "mcc magic":         1,
    "hannie":            2,
    "gaia baby":         3,
    "wonderfold":        4,
    "uppababy":          5,
    "zazu":              6,
    "miamily":           7,
    "frida":             8,
    "coolkidz":          9,
    "matchstick monkey": 10,
    "mamave":            11,
    "smartrike":         12,
}

# Normalise channel names
CHANNEL_MAP = {
    "google advertising":   "Google Advertising",
    "social media (meta)":  "Social Media (Meta)",
    "klaviyo":              "Klaviyo",
    "influencer marketing": "Influencer Marketing",
    "photography":          "Photography",
    "shopify":              "Shopify",
    "email marketing":      "Klaviyo",
    "meta":                 "Social Media (Meta)",
    "google ads":           "Google Advertising",
}

def parse_money(s):
    """Parse '$1,234' or '1234' → float"""
    if not s:
        return 0.0
    cleaned = re.sub(r'[$,\s]', '', s.strip())
    try:
        return float(cleaned)
    except ValueError:
        return 0.0

def fetch_csv(sheet_id, gid=None):
    url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv"
    if gid:
        url += f"&gid={gid}"
    ctx = ssl.create_default_context()
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    # Follow redirects manually
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=15) as r:
            return r.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        if e.code == 307:
            location = e.headers.get("Location")
            if location:
                with urllib.request.urlopen(location, context=ctx, timeout=15) as r2:
                    return r2.read().decode("utf-8")
        raise

def main():
    with open(CONFIG_PATH) as f:
        config = json.load(f)

    gid = config.get("marketingBudgetGid")
    if not gid:
        print("No marketingBudgetGid in stores.config.json.")
        print("1. Open the Google Sheet")
        print("2. Click the Budget tab")
        print("3. Copy the URL — the gid is the number after #gid=")
        print("4. Add to stores.config.json: \"marketingBudgetGid\": \"1234567890\"")
        sys.exit(1)

    url = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    db  = create_client(url, key)

    print(f"Fetching budget sheet (gid={gid})...")
    try:
        raw = fetch_csv(SHEET_ID, gid)
    except Exception as e:
        print(f"Failed to fetch sheet: {e}")
        sys.exit(1)

    rows = list(csv.reader(raw.splitlines()))
    if not rows:
        print("Empty CSV"); sys.exit(1)

    # Find header row
    header = [h.strip().lower() for h in rows[0]]
    try:
        brand_col   = header.index("brand")
        channel_col = header.index("channel")
        budget_col  = next(i for i, h in enumerate(header) if "budget" in h)
    except (ValueError, StopIteration):
        print(f"Could not find expected columns in: {rows[0]}")
        sys.exit(1)

    print(f"Columns: {rows[0]}")
    upserted = skipped = 0

    for row in rows[1:]:
        if len(row) <= max(brand_col, channel_col, budget_col):
            continue
        brand_name  = row[brand_col].strip()
        channel_raw = row[channel_col].strip()
        budget      = parse_money(row[budget_col])

        if brand_name.upper() == "TOTAL" or not brand_name or not channel_raw:
            continue

        brand_id = BRAND_MAP.get(brand_name.lower())
        if brand_id is None:
            print(f"  ⚠ Unknown brand: '{brand_name}' — skipping")
            skipped += 1
            continue

        channel = CHANNEL_MAP.get(channel_raw.lower(), channel_raw)

        record = {
            "brand_id":      brand_id,
            "channel":       channel,
            "annual_budget": budget,
            "fy":            FY,
        }
        db.table("marketing_budgets").upsert(record, on_conflict="brand_id,channel,fy").execute()
        print(f"  ✓ {brand_name} · {channel}: ${budget:,.0f}")
        upserted += 1

    print(f"\nDone — {upserted} rows upserted, {skipped} skipped.")
    print("\nTo update brand_targets with sales targets from the summary tab:")
    print("  python3 scripts/sync_sales_targets.py")

if __name__ == "__main__":
    main()
