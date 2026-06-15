#!/usr/bin/env python3
"""
Sync marketing actuals from Google Sheets → Supabase.

The actuals tab has columns: Month (YYYY-MM) | Brand | Channel | Spend ($) | Note
Channels include: Google Advertising, Social Media (Meta), Klaviyo,
                  Influencer Marketing, Photography, Shopify

Note: Google Advertising and Social Media (Meta) are excluded by default
since live API data (google_ads / meta_ads tables) is the source of truth.
Set INCLUDE_LIVE_CHANNELS = True to import them anyway.

Setup:
  1. In stores.config.json, add:
       "marketingActualsGid": "YOUR_ACTUALS_TAB_GID"
     (Click the Actuals tab → copy the #gid= number from the URL)

  2. Run SQL in Supabase (first time only):
       CREATE TABLE IF NOT EXISTS marketing_actuals (
         brand_id  INT NOT NULL,
         month_key TEXT NOT NULL,
         channel   TEXT NOT NULL,
         spend     NUMERIC DEFAULT 0,
         note      TEXT DEFAULT '',
         PRIMARY KEY (brand_id, month_key, channel)
       );
       ALTER TABLE marketing_actuals DISABLE ROW LEVEL SECURITY;

  3. python3 scripts/sync_marketing_actuals.py

Environment: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
"""

import sys, os, json, csv, re, urllib.request, ssl

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

# Set to True to also import Google + Meta (overrides live API data)
INCLUDE_LIVE_CHANNELS = False
LIVE_CHANNELS = {"google advertising", "social media (meta)"}

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

CHANNEL_MAP = {
    "google advertising":   "Google Advertising",
    "social media (meta)":  "Social Media (Meta)",
    "klaviyo":              "Klaviyo",
    "influencer marketing": "Influencer Marketing",
    "photography":          "Photography",
    "shopify":              "Shopify",
    "email marketing":      "Klaviyo",
}

def parse_money(s):
    if not s: return 0.0
    cleaned = re.sub(r'[$,\s]', '', s.strip())
    try: return float(cleaned)
    except ValueError: return 0.0

def fetch_csv(sheet_id, gid):
    url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv&gid={gid}"
    ctx = ssl.create_default_context()
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, context=ctx, timeout=15) as r:
        return r.read().decode("utf-8")

def main():
    with open(CONFIG_PATH) as f:
        config = json.load(f)

    gid = config.get("marketingActualsGid")
    if not gid:
        print("No marketingActualsGid in stores.config.json.")
        print("1. Open the Google Sheet")
        print("2. Click the Actuals tab")
        print("3. Copy the number after #gid= in the URL")
        print("4. Add: \"marketingActualsGid\": \"1234567890\"")
        sys.exit(1)

    url = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    db  = create_client(url, key)

    print(f"Fetching actuals sheet (gid={gid})...")
    raw  = fetch_csv(SHEET_ID, gid)
    rows = list(csv.reader(raw.splitlines()))

    if not rows:
        print("Empty CSV"); sys.exit(1)

    header = [h.strip().lower() for h in rows[0]]
    print(f"Headers: {rows[0]}")

    # Find columns flexibly
    def find_col(keywords):
        for i, h in enumerate(header):
            if any(k in h for k in keywords):
                return i
        return None

    month_col   = find_col(["month", "yyyy"])
    brand_col   = find_col(["brand"])
    channel_col = find_col(["channel"])
    spend_col   = find_col(["spend", "actual", "amount", "budget"])
    note_col    = find_col(["note"])

    if any(c is None for c in [month_col, brand_col, channel_col, spend_col]):
        print(f"Could not identify all required columns in: {rows[0]}")
        sys.exit(1)

    upserted = skipped = 0
    for row in rows[1:]:
        if not row or len(row) <= max(c for c in [month_col, brand_col, channel_col, spend_col] if c is not None):
            continue

        month_key   = row[month_col].strip()
        brand_name  = row[brand_col].strip()
        channel_raw = row[channel_col].strip()
        spend       = parse_money(row[spend_col])
        note        = row[note_col].strip() if note_col is not None and note_col < len(row) else ""

        # Validate month format YYYY-MM
        if not re.match(r'^\d{4}-\d{2}$', month_key):
            continue
        if not brand_name or not channel_raw:
            continue

        # Skip live channels unless opted in
        if channel_raw.lower() in LIVE_CHANNELS and not INCLUDE_LIVE_CHANNELS:
            continue

        brand_id = BRAND_MAP.get(brand_name.lower())
        if brand_id is None:
            print(f"  ⚠ Unknown brand: '{brand_name}'")
            skipped += 1
            continue

        channel = CHANNEL_MAP.get(channel_raw.lower(), channel_raw)

        db.table("marketing_actuals").upsert({
            "brand_id":  brand_id,
            "month_key": month_key,
            "channel":   channel,
            "spend":     spend,
            "note":      note,
        }, on_conflict="brand_id,month_key,channel").execute()

        print(f"  ✓ {month_key} | {brand_name} | {channel}: ${spend:,.0f}")
        upserted += 1

    print(f"\nDone — {upserted} rows upserted, {skipped} skipped.")

if __name__ == "__main__":
    main()
