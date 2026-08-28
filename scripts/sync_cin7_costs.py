#!/usr/bin/env python3
"""Real per-show, per-SKU tradeshow COGS from Cin7 Omni.

Per Mel's steer (28 Aug 2026): don't approximate from Products.priceColumns
(88% of SKUs only carry costUSD there, not costAUD — unreliable) — instead
read the ACTUAL landed unit cost Cin7 recorded when the real stock for a sale
was dispatched (SalesOrders[].lineItems[].unitCost, FIFO-consumed batch
cost). This is the exact cost of what shipped, not an average.

CRITICAL: a date-range fetch of Cin7 SalesOrders pulls EVERY order in the
account created in that window — every brand, every channel, wholesale, the
lot — not just this show's orders (verified: One Fine Baby Sydney's 2-day
window had 475 Cin7 orders company-wide against 233 that actually belong to
the show). So this script does NOT trust a Cin7 date-range dump directly.
Instead it:
  1. Gets the AUTHORITATIVE set of Shopify order names for the show, using
     the exact same attribution as sync_tradeshow_breakdown.py (own-store
     POS + UPPAbaby QR channel per brand, + every order on the Coolkidz
     store in the window — the booth till).
  2. Fetches Cin7 SalesOrders in the window and keeps only those whose
     `reference` field matches one of those Shopify order names — Cin7's
     `reference` is written verbatim from Shopify's order `name` (confirmed:
     Shopify "UB#31513" == Cin7 SalesOrders[].reference "UB#31513").
  3. Sums real dispatched-line unitCost×qtyShipped from ONLY that matched
     set. Verified against a real Cin7-native COGS export from Mel (28 Aug
     2026): 233/233 orders matched, COGS within ~1% (was ~15% low before
     this fix, purely from including unrelated orders' costs... actually
     UNDER-counting, because unmatched SKUs in the broad dump diluted the
     per-SKU weighted average — the real fix is the reference-scoping here).

Both fetches need a LOCAL-timezone-aware window, not raw UTC — Shopify's
`created_at:>=2026-07-25` resolves in the store's own timezone, but Cin7
stores CreatedDate in UTC, so a naive UTC midnight boundary silently drops
the show's first ~10 hours of orders (NSW is UTC+10). tz_offset() below
matches sync_tradeshow_breakdown.py's existing per-state handling.

Auth: Cin7 Omni Basic Auth (username:api_key base64), NOT the Core
account-id/application-key header pair. Rate limit: 3/sec, 60/min, 5000/day
(Cin7's own documented cap) — this script paginates at the API's own page-size
ceiling (50, regardless of a larger `limit` requested) with a small delay
between calls to stay well under both.
"""
import base64, json, os, sys, time, urllib.error, urllib.parse, urllib.request
from datetime import date, datetime, timedelta

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(BASE_DIR, "stores.config.json")
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

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from shopify_auth import store_token  # noqa: E402
import sync_tradeshow_breakdown as breakdown  # noqa: E402
from sync_tradeshow_breakdown import QR_SOURCE_PREFIX, tz_offset  # noqa: E402


def _gql_with_retry(domain, token, q):
    """This script's show_order_refs() makes an extra Shopify pass beyond
    what sync_tradeshow_breakdown.py itself needs — reuse the retry/backoff
    pattern (from sync_ltv.py / sync_tradeshow_repeat.py) rather than the
    bare gql() breakdown ships with, for the same reason: more calls per
    brand-show pair means more THROTTLED exposure."""
    req_data = json.dumps({"query": q}).encode()
    for attempt in range(4):
        req = urllib.request.Request(f"https://{domain}/admin/api/2024-07/graphql.json",
            data=req_data, method="POST",
            headers={"X-Shopify-Access-Token": token, "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                d = json.load(r)
            if d.get("errors") and "THROTTLED" in json.dumps(d["errors"]):
                time.sleep(2 ** attempt); continue
            return d
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(2 ** attempt); continue
            raise
    return {}


breakdown.gql = _gql_with_retry


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
    """Every Cin7 SalesOrder created in [window_start_iso, window_end_iso)
    (UTC datetimes) — company-wide, NOT scoped to one show. Callers must
    filter by `reference` against a real Shopify order-name set; see
    module docstring for why. Paginates at the API's own 50-per-page ceiling."""
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


def fetch_order_names(domain, token, ds, de):
    """Shopify order `name` (e.g. "UB#31513", "#CK1679") + sourceName for
    every paid order in [ds, de] — deliberately minimal (no line items) since
    this script only needs the reference to hand to Cin7, not the order
    contents themselves."""
    out, cursor = [], None
    while True:
        after = f', after: "{cursor}"' if cursor else ""
        q = f'''{{ orders(first: 100{after},
            query: "financial_status:paid created_at:>={ds} created_at:<={de}", sortKey: CREATED_AT) {{
          edges {{ cursor node {{ name sourceName }} }} pageInfo {{ hasNextPage }} }} }}'''
        r = breakdown.gql(domain, token, q)
        d = r.get("data", {}).get("orders", {})
        for e in d.get("edges", []):
            out.append(e["node"])
        if not d.get("pageInfo", {}).get("hasNextPage") or not d.get("edges"):
            break
        cursor = d["edges"][-1]["cursor"]
    return out


def show_order_refs(show, brands):
    """The authoritative set of Shopify order `name`s belonging to this show
    — own-store POS + UPPAbaby QR channel per brand, plus every order on the
    Coolkidz store in the window (the booth till) — mirroring
    sync_tradeshow_breakdown.py's exact bucket definition."""
    ds, de = show["date_start"], show["date_end"] or show["date_start"]
    ub = next((b for b in brands if b["name"] == "UPPAbaby"), None)
    refs = set()
    for b in brands:
        if b["name"] == "Coolkidz Australia" or not b.get("domain") or not b.get("token"):
            continue
        try:
            orders = fetch_order_names(b["domain"], store_token(b), ds, de)
        except Exception as e:
            print(f"   ✗ {b['name']} order lookup: {e}")
            continue
        is_ub = b is ub
        for o in orders:
            src = (o.get("sourceName") or "").lower()
            if src == "pos" or (is_ub and src.startswith(QR_SOURCE_PREFIX)):
                refs.add(o["name"])

    ck = next((b for b in brands if b["name"] == "Coolkidz Australia"), None)
    if ck and ck.get("domain") and ck.get("token"):
        try:
            for o in fetch_order_names(ck["domain"], ck["token"], ds, de):
                refs.add(o["name"])
        except Exception as e:
            print(f"   ✗ Coolkidz order lookup: {e}")
    return refs


def show_costs(show, refs):
    """Returns (per_sku_costs, totals) — per_sku_costs is a {sku: (unit_cost,
    qty)} map for the product-level breakdown (top products / unmatched
    worklist), and totals is the DIRECT show-level COGS figure, summed from
    every matched order's line items regardless of whether that line has a
    usable SKU. The direct total is the authoritative COGS number — see
    supabase/add_cin7_show_totals.sql for why the per-SKU join alone
    undercounts (bundled/demo/no-SKU lines Cin7 still has real cost for)."""
    ds, de = show["date_start"], show["date_end"] or show["date_start"]
    off = tz_offset(show.get("state"))
    # Local midnight of date_start / (date_end + 1) converted to UTC.
    window_start = (datetime.fromisoformat(f"{ds}T00:00:00") - timedelta(hours=off)).isoformat() + "Z"
    window_end = (datetime.fromisoformat(f"{(date.fromisoformat(de) + timedelta(days=1)).isoformat()}T00:00:00") - timedelta(hours=off)).isoformat() + "Z"
    orders = [o for o in fetch_sales_orders(window_start, window_end) if o.get("reference") in refs]

    matched_refs = {o.get("reference") for o in orders}
    missing = len(refs) - len(matched_refs)
    if missing > 0:
        print(f"   ({missing} of {len(refs)} show orders had no matching Cin7 sales order)")

    # sku -> [total_cost_weighted, total_qty] (for the per-product breakdown)
    acc = {}
    total_cogs = 0.0
    for o in orders:
        for li in o.get("lineItems", []):
            qty = float(li.get("qtyShipped") or 0)
            cost = float(li.get("unitCost") or 0)
            if qty <= 0 or cost <= 0:
                continue
            total_cogs += qty * cost  # every dispatched line counts toward the direct total, SKU or not
            sku = (li.get("styleCode") or li.get("code") or "").strip()
            if not sku:
                continue
            cur = acc.setdefault(sku, [0.0, 0.0])
            cur[0] += cost * qty
            cur[1] += qty
    per_sku = {sku: (c / q, q) for sku, (c, q) in acc.items() if q > 0}
    totals = {"total_cogs": total_cogs, "matched_orders": len(matched_refs), "total_orders": len(refs)}
    return per_sku, totals


def main():
    if not (SB_URL and SB_KEY and CIN7_AUTH):
        print("Missing Supabase or Cin7 env — see .env.local")
        sys.exit(1)
    with open(CONFIG_PATH) as f:
        config = json.load(f)
    brands = config.get("brands", [])

    st, body = sb("GET", "tradeshows?select=id,name,date_start,date_end,state")
    shows = json.loads(body.decode()) if st == 200 else []
    today = date.today()
    cutoff = today - timedelta(days=RECENT_DAYS)
    recent = [s for s in shows if s.get("date_start") and s["date_start"] <= today.isoformat()
              and date.fromisoformat(s.get("date_end") or s["date_start"]) >= cutoff]
    if not recent:
        print("No recent shows to cost")
        return

    all_rows, total_rows = [], []
    for show in recent:
        print(f"⟳  {show['name']} ({show['date_start']})", flush=True)
        try:
            refs = show_order_refs(show, brands)
            per_sku, totals = show_costs(show, refs)
        except Exception as e:
            print(f"   ✗ {e}")
            continue
        now = datetime.utcnow().isoformat() + "Z"
        rows = [{"tradeshow_id": str(show["id"]), "sku": sku, "unit_cost": round(unit_cost, 4), "qty": int(qty), "synced_at": now}
                for sku, (unit_cost, qty) in per_sku.items()]
        all_rows.extend(rows)
        total_rows.append({"tradeshow_id": str(show["id"]), "total_cogs": round(totals["total_cogs"], 2),
                            "matched_orders": totals["matched_orders"], "total_orders": totals["total_orders"], "synced_at": now})
        print(f"   {len(rows)} SKUs costed · ${totals['total_cogs']:,.0f} total COGS from {totals['matched_orders']}/{totals['total_orders']} show orders")

    if all_rows:
        sb("DELETE", f"cin7_show_costs?tradeshow_id=in.({','.join(sorted({r['tradeshow_id'] for r in all_rows}))})")
        st, body = sb("POST", "cin7_show_costs?on_conflict=tradeshow_id,sku", json.dumps(all_rows).encode(),
                       extra={"Prefer": "resolution=merge-duplicates"})
        if st not in (200, 201, 204):
            # Raise rather than just print — a failed write here (e.g. the
            # table not existing yet) must show up as a failed sync, not a
            # silent no-op that looks identical to "nothing to sync".
            raise RuntimeError(f"cin7_show_costs upsert failed {st}: {body.decode(errors='replace')[:300]}")
        print(f"{len(all_rows)} SKU rows synced")

    if total_rows:
        st, body = sb("POST", "cin7_show_totals?on_conflict=tradeshow_id", json.dumps(total_rows).encode(),
                       extra={"Prefer": "resolution=merge-duplicates"})
        if st not in (200, 201, 204):
            raise RuntimeError(f"cin7_show_totals upsert failed {st}: {body.decode(errors='replace')[:300]}")
        print(f"{len(total_rows)} show totals synced")


if __name__ == "__main__":
    try:
        from sync_status_util import record
    except ImportError:
        record = lambda *a, **k: None
    try:
        main(); record("Cin7 show costs", True)
    except Exception as e:
        record("Cin7 show costs", False, str(e)[:300]); raise
