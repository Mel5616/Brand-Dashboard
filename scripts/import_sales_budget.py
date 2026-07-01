#!/usr/bin/env python3
"""
One-off import of the FY27 channel sales budget spreadsheet into `sales_budget`.
Usage: python3 scripts/import_sales_budget.py "/path/to/Coolkidz_Sales_Budget_by_Brand.xlsx"
Idempotent (upsert on brand_id,channel,month_key).
"""
import os, sys, json, urllib.request, openpyxl

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV = os.path.join(BASE, ".env.local")
for line in open(ENV):
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, _, v = line.partition("="); os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
U = os.environ["NEXT_PUBLIC_SUPABASE_URL"]; K = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

def norm(s): return "".join(c for c in str(s).lower() if c.isalnum())

def get(path):
    r = urllib.request.Request(f"{U}/rest/v1/{path}", headers={"apikey": K, "Authorization": f"Bearer {K}"})
    return json.loads(urllib.request.urlopen(r).read())

def upsert(table, rows):
    r = urllib.request.Request(f"{U}/rest/v1/{table}", data=json.dumps(rows).encode(),
        headers={"apikey": K, "Authorization": f"Bearer {K}", "Content-Type": "application/json",
                 "Prefer": "resolution=merge-duplicates,return=minimal"}, method="POST")
    return urllib.request.urlopen(r).status

path = sys.argv[1] if len(sys.argv) > 1 else "/Users/melaniekingsford/Desktop/Coolkidz_Sales_Budget_by_Brand_2026-07-01-13.xlsx"
brands = get("brands?select=id,name")
bmap = {norm(b["name"]): b["id"] for b in brands}
bmap[norm("Zazu")] = bmap.get(norm("ZAZU"), bmap.get(norm("Zazu")))

wb = openpyxl.load_workbook(path, data_only=True)
ws = wb[wb.sheetnames[0]]
rows = list(ws.iter_rows(values_only=True))
# header row with month columns
hdr = next(r for r in rows if r and r[0] == "Account")
# map month columns Jul-26.. -> YYYY-MM
MONMAP = {"Jan": "01", "Feb": "02", "Mar": "03", "Apr": "04", "May": "05", "Jun": "06",
          "Jul": "07", "Aug": "08", "Sep": "09", "Oct": "10", "Nov": "11", "Dec": "12"}
month_cols = {}
for i, h in enumerate(hdr):
    if isinstance(h, str) and "-" in h and h[:3] in MONMAP:
        mon, yy = h.split("-"); month_cols[i] = f"20{yy}-{MONMAP[mon]}"

out = []
cur = None
brand_names = set(bmap.keys())
for r in rows[rows.index(hdr) + 1:]:
    if not r or r[0] is None: continue
    acct = str(r[0]).strip()
    if acct.startswith("Total "): cur = None; continue
    nonempty = [x for x in r[1:] if x not in (None, "")]
    if not nonempty and norm(acct) in brand_names:
        cur = bmap[norm(acct)]; continue
    if cur is None: continue
    fy26 = r[1] if isinstance(r[1], (int, float)) else 0
    fy27 = r[6] if isinstance(r[6], (int, float)) else 0
    if (fy27 or 0) == 0 and (fy26 or 0) == 0: continue   # skip empty channels
    for i, mk in month_cols.items():
        v = r[i] if isinstance(r[i], (int, float)) else 0
        out.append({"brand_id": cur, "channel": acct, "month_key": mk, "target": round(v or 0, 2), "fy26_actual": round(fy26 or 0, 2)})

print(f"Prepared {len(out)} rows across {len({(o['brand_id'],o['channel']) for o in out})} brand-channels.")
# upsert in chunks
for i in range(0, len(out), 500):
    print("  upsert", i, "->", upsert("sales_budget", out[i:i+500]))
print("Done.")
