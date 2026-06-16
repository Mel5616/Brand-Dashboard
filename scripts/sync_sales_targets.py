#!/usr/bin/env python3
"""
Sync FY sales targets from the Google Sheet summary tab → brand_targets table.
Distributes the annual target evenly across 12 months.

python3 scripts/sync_sales_targets.py
"""

import sys, os, json, csv, re, urllib.request, ssl

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

SHEET_ID   = "1GjvL7SVJEPTI6utLlhGVGn_z1FL9OEBs6ZE00p9uPTc"
MONTH_KEYS = [
    "2025-07","2025-08","2025-09","2025-10","2025-11","2025-12",
    "2026-01","2026-02","2026-03","2026-04","2026-05","2026-06",
]

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

MKTG_CHANNEL_MAP = {
    "google advertising":   "Google Advertising",
    "social media (meta)":  "Social Media (Meta)",
    "klaviyo":              "Klaviyo",
    "influencer marketing": "Influencer Marketing",
    "photography":          "Photography",
    "shopify":              "Shopify",
}

def parse_money(s):
    if not s: return 0.0
    cleaned = re.sub(r'[$,%\s]', '', s.strip())
    try: return float(cleaned)
    except ValueError: return 0.0

def fetch_csv(sheet_id, gid=None):
    url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv"
    if gid:
        url += f"&gid={gid}"
    ctx = ssl.create_default_context()
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, context=ctx, timeout=15) as r:
        return r.read().decode("utf-8")

def fy_months(start_year):
    """12 month_keys (YYYY-MM) for a FY starting July of start_year."""
    return [f"{start_year}-{m:02d}" for m in range(7, 13)] + [f"{start_year + 1}-{m:02d}" for m in range(1, 7)]

def main():
    url = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    db  = create_client(url, key)

    print("Fetching summary tab (FY sales targets)...")
    raw  = fetch_csv(SHEET_ID)  # default tab = summary
    rows = list(csv.reader(raw.splitlines()))

    header = [h.strip() for h in rows[0]]
    try:
        brand_col = next(i for i, h in enumerate(header) if h.lower() == "brand")
    except StopIteration:
        print(f"No 'Brand' column. Headers: {rows[0]}"); sys.exit(1)

    # Detect every "FY<yy>/<yy> Sales Target" column → its FY start year + month range
    target_cols = []  # (col_index, start_year, label)
    for i, h in enumerate(header):
        hl = h.lower()
        if "sales target" not in hl:
            continue
        m = re.search(r"fy\s*(\d{2})\s*/\s*(\d{2})", hl)
        if not m:
            continue
        start_year = 2000 + int(m.group(1))
        target_cols.append((i, start_year, h))

    if not target_cols:
        print(f"No 'FY../.. Sales Target' columns found. Headers: {rows[0]}"); sys.exit(1)
    print("Target columns:", [f"{lbl} (FY{sy}-{sy+1})" for _, sy, lbl in target_cols])

    total = 0
    for col, start_year, label in target_cols:
        months = fy_months(start_year)
        for row in rows[1:]:
            if len(row) <= max(brand_col, col):
                continue
            brand_name = row[brand_col].strip()
            if brand_name.upper() in ("TOTAL", "TOTAL PORTFOLIO") or not brand_name:
                continue
            brand_id = BRAND_MAP.get(brand_name.lower())
            if brand_id is None:
                continue
            annual = parse_money(row[col])
            if annual <= 0:
                continue
            monthly = round(annual / 12, 2)
            for mk in months:
                db.table("brand_targets").upsert({
                    "brand_id":       brand_id,
                    "month_key":      mk,
                    "revenue_target": monthly,
                }, on_conflict="brand_id,month_key").execute()
            total += 1
            print(f"  {label}: {brand_name} ${annual:,.0f}/yr → ${monthly:,.0f}/mo")

    print(f"\n{total} brand-FY targets synced to brand_targets.")
    print("Pacing bars + the Budget tab's sales-target view now reflect these.")

if __name__ == "__main__":
    main()
