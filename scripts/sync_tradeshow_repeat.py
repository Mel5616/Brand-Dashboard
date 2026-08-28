#!/usr/bin/env python3
"""Tradeshow → online repeat-purchase tracking.

For each show, per brand: identify the customers who bought at the show (own-
store POS + UPPAbaby QR-channel orders — see sync_tradeshow_breakdown.py for
why the Coolkidz booth till is excluded: walk-up till sales carry no reliable
customer identity), then check how many of them placed a further paid order
on that SAME brand's online store within 90 days after the show ended.

Repeat detection is a SINGLE bulk fetch of the brand's paid orders in the
90-day window, intersected client-side against the show-customer-id set —
NOT a per-customer API call. Shopify's GraphQL Admin API has no
customer_id:in:[...] filter, so N+1 calls per customer would be both slow
and a real rate-limit risk; bulk-fetch-then-intersect reuses the same shape
sync_ltv.py already uses safely.

Only counts show orders as PII in-memory, never written to Supabase —
tradeshow_repeat stores aggregate counts/revenue only, matching every other
tradeshow_* table's open-RLS convention.

A show's repeat window doesn't close until date_end + 90 days, so this script
looks further back than sync_tradeshow_breakdown.py's RECENT_DAYS=60 — see
REPEAT_RECENT_DAYS below. Rows for a still-open window get window_complete =
false and whatever has accumulated so far; the API/UI must treat that as
"still accumulating", never as a final 0% repeat rate.
"""
import json, os, ssl, sys, time, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sync_tradeshow_breakdown as breakdown
from sync_tradeshow_breakdown import order_ex_gst, QR_SOURCE_PREFIX, load_env, sb
from shopify_auth import store_token
from datetime import date, datetime, timedelta

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(BASE_DIR, "stores.config.json")
REPEAT_WINDOW_DAYS = 90
# Wider than sync_tradeshow_breakdown.py's RECENT_DAYS=60 — a show's repeat
# window doesn't close until date_end + 90, so we need to keep re-checking
# shows for a while after that script has stopped touching them, to catch
# the window flipping window_complete false -> true.
REPEAT_RECENT_DAYS = 150

load_env()
URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")


def _gql_with_retry(domain, token, q):
    """This script makes 2 Shopify passes per brand-show pair (show-window +
    90-day repeat-window), roughly doubling THROTTLED exposure vs
    sync_tradeshow_breakdown.py's single pass — reuse sync_ltv.py's
    retry/backoff instead of sync_tradeshow_breakdown's bare gql()."""
    ctx = ssl.create_default_context()
    req_data = json.dumps({"query": q}).encode()
    for attempt in range(4):
        req = urllib.request.Request(f"https://{domain}/admin/api/2024-07/graphql.json",
            data=req_data, method="POST",
            headers={"X-Shopify-Access-Token": token, "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, context=ctx, timeout=60) as r:
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


def fetch_orders(domain, token, ds, de):
    """Same shape as sync_tradeshow_breakdown.fetch_orders, but this script
    needs customer identity — breakdown's query never selects `customer` at
    all (it only aggregates line items), so reusing it verbatim would make
    every order silently look customer-less. Only extra field: customer.id."""
    out, cursor = [], None
    while True:
        after = f', after: "{cursor}"' if cursor else ""
        q = f'''{{ orders(first: 100{after},
            query: "financial_status:paid created_at:>={ds} created_at:<={de}", sortKey: CREATED_AT) {{
          edges {{ cursor node {{ sourceName createdAt customer {{ id }}
            totalPriceSet {{ shopMoney {{ amount }} }} totalTaxSet {{ shopMoney {{ amount }} }}
          }} }} pageInfo {{ hasNextPage }} }} }}'''
        r = breakdown.gql(domain, token, q)
        d = r.get("data", {}).get("orders", {})
        for e in d.get("edges", []):
            out.append(e["node"])
        if not d.get("pageInfo", {}).get("hasNextPage") or not d.get("edges"):
            break
        cursor = d["edges"][-1]["cursor"]
    return out


def show_customers_for_brand(brand, ds, de, is_uppababy):
    """Distinct show-day customer ids for this brand's own-store POS orders
    (+ the UPPAbaby QR channel, if applicable) — same bucket definition
    sync_tradeshow_breakdown.py uses. Returns (customer_ids, orders_with_no_customer)."""
    orders = fetch_orders(brand["domain"], store_token(brand), ds, de)
    ids, no_id = set(), 0
    for o in orders:
        src = (o.get("sourceName") or "").lower()
        is_qr = is_uppababy and src.startswith(QR_SOURCE_PREFIX)
        if src != "pos" and not is_qr:
            continue
        cid = (o.get("customer") or {}).get("id")
        if cid:
            ids.add(cid)
        else:
            no_id += 1
    return ids, no_id


def repeat_orders_for_brand(brand, window_start, window_end):
    """One bulk fetch of every paid order on the brand's store in the repeat
    window — filtering to the show-customer set happens by the caller."""
    orders = fetch_orders(brand["domain"], store_token(brand), window_start, window_end)
    out = []
    for o in orders:
        cid = (o.get("customer") or {}).get("id")
        if cid:
            out.append((cid, order_ex_gst(o)))
    return out


def sync_show_brand(show, brand, is_uppababy):
    sid = str(show["id"])
    ds, de = show["date_start"], show["date_end"] or show["date_start"]
    window_start = de
    window_end_d = date.fromisoformat(de) + timedelta(days=REPEAT_WINDOW_DAYS)
    window_end = window_end_d.isoformat()
    window_complete = date.today() >= window_end_d

    show_ids, no_id = show_customers_for_brand(brand, ds, de, is_uppababy)
    if not show_ids and no_id == 0:
        return None  # brand had no presence at this show

    repeat_orders = repeat_orders_for_brand(brand, window_start, window_end)
    matched = [(cid, rev) for cid, rev in repeat_orders if cid in show_ids]
    repeat_customer_ids = {cid for cid, _ in matched}

    return {
        "tradeshow_id": sid, "brand_id": brand["id"],
        "show_customers": len(show_ids), "show_customers_no_id": no_id,
        "repeat_customers": len(repeat_customer_ids),
        "repeat_orders_90d": len(matched),
        "repeat_revenue_90d": round(sum(rev for _, rev in matched), 2),
        "window_complete": window_complete,
        "window_ends_at": window_end,
        "synced_at": datetime.utcnow().isoformat() + "Z",
    }


def main():
    if not URL or not KEY:
        print("Missing Supabase env"); sys.exit(1)
    with open(CONFIG_PATH) as f:
        config = json.load(f)
    brands = config.get("brands", [])
    ub = next((b for b in brands if b["name"] == "UPPAbaby"), None)
    today = date.today()
    cutoff = today - timedelta(days=REPEAT_RECENT_DAYS)

    st, body = sb("GET", "/rest/v1/tradeshows?select=id,name,date_start,date_end")
    shows = json.loads(body.decode()) if st == 200 else []
    started = [s for s in shows if s.get("date_start") and s["date_start"] <= today.isoformat()
               and date.fromisoformat(s.get("date_end") or s["date_start"]) >= cutoff]
    if not started:
        print("No shows in the repeat-tracking window"); return

    rows = []
    for show in started:
        print(f"⟳  {show['name']} ({show['date_start']})", flush=True)
        for b in brands:
            if b["name"] == "Coolkidz Australia" or not b.get("domain") or not b.get("token"):
                continue
            try:
                row = sync_show_brand(show, b, is_uppababy=(b is ub))
                if row:
                    rows.append(row)
                    status = "final" if row["window_complete"] else f"accumulating (final {row['window_ends_at']})"
                    print(f"   {b['name']}: {row['repeat_customers']}/{row['show_customers']} repeat — {status}")
            except Exception as e:
                print(f"   ✗ {b['name']}: {e}")

    if rows:
        st, body = sb("POST", "/rest/v1/tradeshow_repeat?on_conflict=tradeshow_id,brand_id",
                       json.dumps(rows).encode(), extra={"Prefer": "resolution=merge-duplicates"})
        if st not in (200, 201, 204):
            print(f"✗ upsert failed {st}: {body.decode(errors='replace')[:200]}")
        else:
            print(f"{len(rows)} rows synced")


if __name__ == "__main__":
    try:
        from sync_status_util import record
    except ImportError:
        record = lambda *a, **k: None
    try:
        main(); record("Tradeshow repeat-purchase", True)
    except Exception as e:
        record("Tradeshow repeat-purchase", False, str(e)[:300]); raise
