#!/usr/bin/env python3
"""Parse the Monthly Promo Tracker (xlsx) and upsert sale periods into `promotions`.

Usage: python3 scripts/load_promotions.py "/path/to/Promo Calendar.xlsx"

Reads the "Monthly Promo Tracker" sheet: each quarter block has a "Brand" header
row whose columns hold week-start dates, then one row per brand. A non-empty cell
means that brand is on sale that week; the cell text is the retailer/channel.
Consecutive on-sale weeks with the same channel merge into one period.

Pricing/notes entered in the dashboard are NEVER overwritten — the upsert only
touches brand/date/channel columns. Stale sheet-sourced rows are pruned.
"""
import os, sys, json, datetime, urllib.request
import openpyxl

SB_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
SB_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

# sheet brand name -> brands.id
BRANDS = {0:"nanit",1:"magic",2:"hannie",3:"gaiababy",4:"wonderfold",5:"uppababy",
          6:"zazu",7:"miamily",8:"frida",10:"matchstickmonkey",11:"mamave"}
def norm(s): return "".join(str(s).lower().split())
def brand_id_for(name):
    n = norm(name)
    for bid, bn in BRANDS.items():
        if n == bn or bn.startswith(n) or n.startswith(bn):
            return bid
    return None

# Cell shading -> tier: theme7 (blue #0F9ED5) = Tier 1, theme9 (green #4EA72E) = Tier 2.
def tier_of(cell):
    f = cell.fill
    if not (f and f.patternType): return None
    t = getattr(f.fgColor, "theme", None)
    return 1 if t == 7 else 2 if t == 9 else None

def parse(path):
    wv = openpyxl.load_workbook(path, data_only=True)
    ws = wv["Monthly Promo Tracker"]
    st = openpyxl.load_workbook(path)["Monthly Promo Tracker"]  # for fill colours
    rows = []
    headers = [r for r in range(1, ws.max_row+1) if str(ws.cell(r,1).value).strip().lower() == "brand"]
    for hr in headers:
        cols = []
        for c in range(2, ws.max_column+1):
            v = ws.cell(hr, c).value
            if isinstance(v, (datetime.datetime, datetime.date)):
                cols.append((c, v.date() if isinstance(v, datetime.datetime) else v))
        r = hr + 1
        while r <= ws.max_row:
            b = ws.cell(r, 1).value
            if b is None or str(b).strip() == "" or str(b).strip().lower() == "brand":
                break
            brand = str(b).strip()
            for (c, wkstart) in cols:
                t = ws.cell(r, c).value
                if t is not None and str(t).strip() != "":
                    chan = " ".join(str(t).split())
                    rows.append([brand, wkstart, wkstart + datetime.timedelta(days=6), chan, tier_of(st.cell(r, c))])
            r += 1
    # merge contiguous weeks for same brand+channel+tier
    rows.sort(key=lambda p: (p[0], p[3], p[1]))
    merged = []
    for b, s, e, ch, ti in rows:
        if merged and merged[-1][0] == b and merged[-1][3] == ch and merged[-1][4] == ti and (s - merged[-1][2]).days <= 1:
            merged[-1][2] = e
        else:
            merged.append([b, s, e, ch, ti])
    return merged

def parse_lines(path):
    """Parse the Promo Details sheet into marketing-facing product-promo lines."""
    d = openpyxl.load_workbook(path, data_only=True)["Promo Details"]
    def num(v):
        try: return float(v) if v not in (None, "") else None
        except Exception: return None
    def dt(v): return v.date().isoformat() if isinstance(v, (datetime.datetime, datetime.date)) else None
    out = []
    for r in range(3, d.max_row + 1):
        if not d.cell(r, 2).value:  # no brand → skip
            continue
        out.append({
            "customer": d.cell(r, 1).value, "brand": str(d.cell(r, 2).value).strip(),
            "brand_id": brand_id_for(d.cell(r, 2).value), "sku": d.cell(r, 3).value,
            "promo_name": d.cell(r, 4).value, "product": d.cell(r, 5).value,
            "category": d.cell(r, 9).value, "month": d.cell(r, 10).value,
            "tier": int(d.cell(r, 11).value) if str(d.cell(r, 11).value).strip() in ("1", "2") else None,
            "start_date": dt(d.cell(r, 12).value), "end_date": dt(d.cell(r, 13).value),
            "days": int(num(d.cell(r, 14).value)) if num(d.cell(r, 14).value) else None,
            "rrp": num(d.cell(r, 16).value), "current_price": num(d.cell(r, 17).value),
            "promo_price": num(d.cell(r, 19).value), "discount_rrp": num(d.cell(r, 20).value),
            "source": "sheet",
        })
    return out

def req(method, path, body=None, prefer=None):
    h = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}", "Content-Type": "application/json"}
    if prefer: h["Prefer"] = prefer
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(f"{SB_URL}/rest/v1/{path}", data=data, headers=h, method=method)
    with urllib.request.urlopen(r) as resp:
        return resp.status, resp.read().decode()

def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "/Users/melaniekingsford/Downloads/Promo Calendar.xlsx"
    periods = parse(path)
    payload = []
    for brand, s, e, ch, ti in periods:
        payload.append({
            "brand_id": brand_id_for(brand), "brand": brand,
            "period_start": s.isoformat(), "period_end": e.isoformat(),
            "channel": ch, "tier": ti, "source": "sheet", "updated_at": datetime.datetime.utcnow().isoformat(),
        })
    # upsert calendar (price/note untouched), then prune stale sheet rows
    st, _ = req("POST", "promotions?on_conflict=brand,period_start,channel", payload,
                "resolution=merge-duplicates,return=minimal")
    keep = {(p["brand"], p["period_start"], p["channel"]) for p in payload}
    _, existing = req("GET", "promotions?select=id,brand,period_start,channel&source=eq.sheet")
    stale = [row["id"] for row in json.loads(existing) if (row["brand"], row["period_start"], row["channel"]) not in keep]
    for i in stale:
        req("DELETE", f"promotions?id=eq.{i}", prefer="return=minimal")
    print(f"calendar: upserted {len(payload)} promo periods (HTTP {st}); pruned {len(stale)} stale")

    # promo_lines have no manual edits → replace all sheet rows
    lines = parse_lines(path)
    req("DELETE", "promo_lines?source=eq.sheet", prefer="return=minimal")
    for i in range(0, len(lines), 200):
        req("POST", "promo_lines", lines[i:i+200], "return=minimal")
    print(f"lines: loaded {len(lines)} product-promo lines")

if __name__ == "__main__":
    main()
