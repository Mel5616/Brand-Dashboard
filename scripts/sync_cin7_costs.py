#!/usr/bin/env python3
"""Real per-show, per-SKU tradeshow COGS from Cin7 Omni.

Per Mel's steer (28 Aug 2026): don't approximate from Products.priceColumns
(88% of SKUs only carry costUSD there, not costAUD — unreliable) — instead
read the ACTUAL landed unit cost Cin7 recorded when the real stock for a sale
was dispatched (SalesOrders[].lineItems[].unitCost, FIFO-consumed batch
cost). This is the exact cost of what shipped, not an average.

For each show: fetch every Cin7 SalesOrder created in the show's date window
(+1 day buffer for timezone slop), take dispatched line items (qtyShipped >
0, unitCost > 0), and compute a qty-weighted average unit cost per SKU —
weighted because a SKU can appear on multiple orders in the window at
slightly different FIFO-consumed costs as batches turn over.

Auth: Cin7 Omni Basic Auth (username:api_key base64), NOT the Core
account-id/application-key header pair. Rate limit: 3/sec, 60/min, 5000/day
(Cin7's own documented cap) — this script paginates at the API's own page-size
ceiling (50, regardless of a larger `limit` requested) with a small delay
between calls to stay well under both.
"""
import base64, json, os, sys, time, urllib.error, urllib.parse, urllib.request
from datetime import date, datetime, timedelta

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CTX = None
RECENT_DAYS = 60  # same freshness window as sync_tradeshow_breakdown.py


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
SB_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SB_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
CIN7_USER = os.environ.get("CIN7_USERNAME", "")
CIN7_KEY = os.environ.get("CIN7_API_KEY", "")
CIN7_AUTH = "Basic " + base64.b64encode(f"{CIN7_USER}:{CIN7_KEY}".encode()).decode() if CIN7_USER and CIN7_KEY else ""


def sb(method, path, data=None, extra=None):
    req = urllib.request.Request(f"{SB_URL}/rest/v1/{path}", data=data, method=method)
    req.add_header("Authorization", f"Bearer {SB_KEY}")
    req.add_header("apikey", SB_KEY)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    for k, v in (extra or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def cin7_get(path):
    req = urllib.request.Request(f"https://api.cin7.com/api{path}", headers={"Authorization": CIN7_AUTH})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(2 ** attempt + 1)
                continue
            raise
    return []


def fetch_sales_orders(window_start_iso, window_end_iso):
    """All Cin7 SalesOrders created in [window_start_iso, window_end_iso)
    (both UTC datetimes). Paginates at the API's own 50-per-page ceiling."""
    where = urllib.parse.quote(f"CreatedDate>='{window_start_iso}' AND CreatedDate<'{window_end_iso}'")
    out, page = [], 1
    while True:
        batch = cin7_get(f"/v1/SalesOrders?limit=50&page={page}&where={where}")
        if not batch:
            break
        out.extend(batch)
        if len(batch) < 50:
            break
        page += 1
        time.sleep(0.4)  # stay well under 3 req/sec
    return out


def show_costs(show):
    ds, de = show["date_start"], show["date_end"] or show["date_start"]
    window_start = f"{ds}T00:00:00Z"
    window_end = f"{(date.fromisoformat(de) + timedelta(days=1)).isoformat()}T00:00:00Z"
    orders = fetch_sales_orders(window_start, window_end)

    # sku -> [total_cost_weighted, total_qty]
    acc = {}
    for o in orders:
        for li in o.get("lineItems", []):
            qty = float(li.get("qtyShipped") or 0)
            cost = float(li.get("unitCost") or 0)
            sku = (li.get("styleCode") or li.get("code") or "").strip()
            if qty <= 0 or cost <= 0 or not sku:
                continue
            cur = acc.setdefault(sku, [0.0, 0.0])
            cur[0] += cost * qty
            cur[1] += qty
    return {sku: (total_cost / total_qty, total_qty) for sku, (total_cost, total_qty) in acc.items() if total_qty > 0}


def main():
    if not (SB_URL and SB_KEY and CIN7_AUTH):
        print("Missing Supabase or Cin7 env — see .env.local")
        sys.exit(1)

    st, body = sb("GET", "tradeshows?select=id,name,date_start,date_end")
    shows = json.loads(body.decode()) if st == 200 else []
    today = date.today()
    cutoff = today - timedelta(days=RECENT_DAYS)
    recent = [s for s in shows if s.get("date_start") and s["date_start"] <= today.isoformat()
              and date.fromisoformat(s.get("date_end") or s["date_start"]) >= cutoff]
    if not recent:
        print("No recent shows to cost")
        return

    all_rows = []
    for show in recent:
        print(f"⟳  {show['name']} ({show['date_start']})", flush=True)
        try:
            costs = show_costs(show)
        except Exception as e:
            print(f"   ✗ {e}")
            continue
        now = datetime.utcnow().isoformat() + "Z"
        rows = [{"tradeshow_id": str(show["id"]), "sku": sku, "unit_cost": round(unit_cost, 4), "qty": int(qty), "synced_at": now}
                for sku, (unit_cost, qty) in costs.items()]
        all_rows.extend(rows)
        print(f"   {len(rows)} SKUs costed")

    if all_rows:
        st, body = sb("DELETE", f"cin7_show_costs?tradeshow_id=in.({','.join(sorted({r['tradeshow_id'] for r in all_rows}))})")
        st, body = sb("POST", "cin7_show_costs?on_conflict=tradeshow_id,sku", json.dumps(all_rows).encode(),
                       extra={"Prefer": "resolution=merge-duplicates"})
        if st not in (200, 201, 204):
            print(f"✗ upsert failed {st}: {body.decode(errors='replace')[:200]}")
        else:
            print(f"{len(all_rows)} rows synced")


if __name__ == "__main__":
    try:
        from sync_status_util import record
    except ImportError:
        record = lambda *a, **k: None
    try:
        main(); record("Cin7 show costs", True)
    except Exception as e:
        record("Cin7 show costs", False, str(e)[:300]); raise
