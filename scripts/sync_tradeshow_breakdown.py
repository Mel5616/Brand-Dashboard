#!/usr/bin/env python3
"""Tradeshow report breakdown: per-brand top products, hourly sales and the QR
funnel summary for recent shows.

Same attribution as sync.py's tradeshow_sales (which is untouched):
  - own-store POS orders during the show dates (ex-GST)
  - Coolkidz booth till: all Coolkidz-site orders on show dates, line items
    split per brand by title/vendor/tag
  - QR = paid orders on the UPPAbaby headless QR channel, ex-GST, kept as its
    own bucket (agreed 17 Jul 2026 — Shopify ex-GST is the standard, not the
    booth app's GST-inclusive event log)
Line items use DISCOUNTED prices so product totals reconcile with brand totals
(originalTotalSet is pre-discount RRP and over-counts show pricing).

Only shows that have STARTED and ended within the last RECENT_DAYS are synced —
line-item pagination across every historical show would hammer Shopify for data
that never changes.
"""
import json, os, ssl, sys, urllib.request
from collections import defaultdict
from datetime import date, datetime, timedelta

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(BASE_DIR, "stores.config.json")
CTX = ssl.create_default_context()
RECENT_DAYS = 60
QR_SOURCE_PREFIX = "channel:"   # headless QR order form registers as channel:<id>

def load_env():
    p = os.path.join(BASE_DIR, ".env.local")
    if not os.path.exists(p):
        return
    with open(p) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            if k.strip() not in os.environ:
                os.environ[k.strip()] = v.strip().strip('"').strip("'")
load_env()

URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

def sb(method, path, data=None, extra=None):
    r = urllib.request.Request(f"{URL}{path}", data=data, method=method)
    r.add_header("Authorization", f"Bearer {KEY}"); r.add_header("apikey", KEY)
    if data is not None:
        r.add_header("Content-Type", "application/json")
    for k, v in (extra or {}).items():
        r.add_header(k, v)
    try:
        with urllib.request.urlopen(r, context=CTX, timeout=40) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()

def gql(domain, token, q):
    req = urllib.request.Request(f"https://{domain}/admin/api/2024-07/graphql.json",
        data=json.dumps({"query": q}).encode(), method="POST",
        headers={"X-Shopify-Access-Token": token, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, context=CTX, timeout=40) as r:
        return json.load(r)

def fetch_orders(domain, token, ds, de):
    out, cursor = [], None
    while True:
        after = f', after: "{cursor}"' if cursor else ""
        q = f'''{{ orders(first: 100{after},
            query: "financial_status:paid created_at:>={ds} created_at:<={de}", sortKey: CREATED_AT) {{
          edges {{ cursor node {{ sourceName createdAt
            totalPriceSet {{ shopMoney {{ amount }} }} totalTaxSet {{ shopMoney {{ amount }} }}
            lineItems(first: 50) {{ edges {{ node {{ title quantity
              discountedTotalSet {{ shopMoney {{ amount }} }}
              product {{ vendor tags }} }} }} }}
          }} }} pageInfo {{ hasNextPage }} }} }}'''
        r = gql(domain, token, q)
        d = r.get("data", {}).get("orders", {})
        for e in d.get("edges", []):
            out.append(e["node"])
        if not d.get("pageInfo", {}).get("hasNextPage") or not d.get("edges"):
            break
        cursor = d["edges"][-1]["cursor"]
    return out

def order_ex_gst(o):
    gross = float(o["totalPriceSet"]["shopMoney"]["amount"])
    tax = float((o.get("totalTaxSet") or {}).get("shopMoney", {}).get("amount") or 0)
    return (gross - tax) if tax > 0 else round(gross / 1.1, 2)

def tz_offset(state):
    s = (state or "").lower()
    if "western" in s: return 8.0
    if "south australia" in s or "northern territory" in s: return 9.5
    return 10.0

def slot_of(created_at, offset_h):
    dt = datetime.fromisoformat(created_at.replace("Z", "+00:00")) + timedelta(hours=offset_h)
    return dt.date().isoformat(), dt.hour, dt.strftime("%a %I%p").replace(" 0", " ")

def brand_matcher(brands):
    names = [(b["name"], b["name"].lower().replace(" australia", "")) for b in brands]
    def match(title, vendor, tags):
        hay = f"{title} {vendor} {' '.join(tags or [])}".lower()
        for full, short in names:
            if short and short in hay:
                return full
        return None
    return match

def main():
    if not URL or not KEY:
        print("Missing Supabase env"); sys.exit(1)
    with open(CONFIG_PATH) as f:
        config = json.load(f)
    brands = config.get("brands", [])
    by_name = {b["name"]: b for b in brands}
    match = brand_matcher(brands)
    today = date.today()
    cutoff = today - timedelta(days=RECENT_DAYS)

    # Show list comes from the dashboard's tradeshows table (incl. manually
    # added shows), not just the config.
    st, body = sb("GET", "/rest/v1/tradeshows?select=id,name,state,date_start,date_end")
    shows = json.loads(body.decode()) if st == 200 else []
    recent = [s for s in shows if s.get("date_start") and s["date_start"] <= today.isoformat()
              and date.fromisoformat(s.get("date_end") or s["date_start"]) >= cutoff]
    if not recent:
        print("No recent shows to break down"); return

    ck = by_name.get("Coolkidz Australia")
    ub = by_name.get("UPPAbaby")

    for show in recent:
        sid, ds, de = str(show["id"]), show["date_start"], show["date_end"] or show["date_start"]
        off = tz_offset(show.get("state"))
        print(f"⟳  {show['name']} ({ds}) breakdown", flush=True)
        prod = defaultdict(lambda: defaultdict(lambda: [0.0, 0]))   # bucket -> product -> [rev, units]
        hourly = defaultdict(lambda: [0.0, 0, ""])                  # (day,hour) -> [rev, orders, slot]
        qr_rev, qr_orders = 0.0, 0

        def add_hour(created, amount):
            d, h, slot = slot_of(created, off)
            hourly[(d, h)][0] += amount; hourly[(d, h)][1] += 1; hourly[(d, h)][2] = slot

        # Own-store POS per brand (+ the QR channel on the UPPAbaby store).
        for b in brands:
            if b["name"] == "Coolkidz Australia" or not b.get("domain") or not b.get("token"):
                continue
            try:
                orders = fetch_orders(b["domain"], b["token"], ds, de)
            except Exception as e:
                print(f"   ✗ {b['name']}: {e}"); continue
            for o in orders:
                src = (o.get("sourceName") or "").lower()
                is_qr = b is ub and src.startswith(QR_SOURCE_PREFIX)
                if src != "pos" and not is_qr:
                    continue
                ex = order_ex_gst(o)
                bucket = "QR" if is_qr else b["name"]
                if is_qr:
                    qr_rev += ex; qr_orders += 1
                add_hour(o["createdAt"], ex)
                for li in o["lineItems"]["edges"]:
                    n = li["node"]
                    amt = round(float(n["discountedTotalSet"]["shopMoney"]["amount"]) / 1.1, 2)
                    p = prod[bucket][n["title"][:200]]; p[0] += amt; p[1] += int(n.get("quantity") or 0)

        # Coolkidz booth till: line items split per brand.
        if ck and ck.get("domain") and ck.get("token"):
            try:
                for o in fetch_orders(ck["domain"], ck["token"], ds, de):
                    order_amt = 0.0
                    for li in o["lineItems"]["edges"]:
                        n = li["node"]
                        bn = match(n["title"], (n.get("product") or {}).get("vendor", ""), (n.get("product") or {}).get("tags", []))
                        if not bn:
                            continue
                        amt = round(float(n["discountedTotalSet"]["shopMoney"]["amount"]) / 1.1, 2)
                        p = prod[bn][n["title"][:200]]; p[0] += amt; p[1] += int(n.get("quantity") or 0)
                        order_amt += amt
                    if order_amt > 0:
                        add_hour(o["createdAt"], order_amt)
            except Exception as e:
                print(f"   ✗ Coolkidz till: {e}")

        # Replace this show's rows.
        now = datetime.utcnow().isoformat() + "Z"
        for table in ("tradeshow_products", "tradeshow_hourly"):
            sb("DELETE", f"/rest/v1/{table}?tradeshow_id=eq.{sid}")
        p_rows = [{"tradeshow_id": sid, "bucket": bkt, "product": t, "revenue": round(v[0], 2), "units": v[1], "synced_at": now}
                  for bkt, items in prod.items() for t, v in items.items() if v[0] > 0 or v[1] > 0]
        h_rows = [{"tradeshow_id": sid, "day": d, "hour": h, "slot": v[2], "revenue": round(v[0], 2), "orders": v[1], "synced_at": now}
                  for (d, h), v in hourly.items()]
        for table, rows in (("tradeshow_products", p_rows), ("tradeshow_hourly", h_rows)):
            if not rows:
                continue
            st, body = sb("POST", f"/rest/v1/{table}?on_conflict={'tradeshow_id,bucket,product' if table=='tradeshow_products' else 'tradeshow_id,day,hour'}",
                          json.dumps(rows).encode(), extra={"Prefer": "resolution=merge-duplicates"})
            if st not in (200, 201, 204):
                print(f"   ✗ {table} upsert {st}: {body.decode(errors='replace')[:200]}")
        sb("POST", "/rest/v1/tradeshow_qr?on_conflict=tradeshow_id",
           json.dumps({"tradeshow_id": sid, "revenue": round(qr_rev, 2), "orders": qr_orders, "synced_at": now}).encode(),
           extra={"Prefer": "resolution=merge-duplicates"})
        tot = sum(v[0] for v in hourly.values())
        print(f"   {len(p_rows)} product rows · {len(h_rows)} hourly rows · QR ${round(qr_rev):,} ({qr_orders}) · hourly total ${round(tot):,}", flush=True)

if __name__ == "__main__":
    try:
        from sync_status_util import record
    except ImportError:
        record = lambda *a, **k: None
    try:
        main(); record("Tradeshow breakdown", True)
    except Exception as e:
        record("Tradeshow breakdown", False, str(e)[:300]); raise
