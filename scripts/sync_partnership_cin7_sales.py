#!/usr/bin/env python3
"""Real Shopify+wholesale revenue for partners tracked by Cin7 customer
account rather than a Shopify discount code (e.g. Baby and Car — a reseller
with no code to match orders by, just a standing account).

Reads every partnership_entries.cin7_email (case-insensitive email/memberEmail
match on Cin7 SalesOrders), sums orders + total (tax-inclusive, matching this
codebase's other Cin7 reads) per month, and upserts into cin7_customer_sales
(customer_email, month_key) — mirrors influencer_sales' shape so the
Partnerships Revenue tab can merge both without special-casing either.

Only scans a trailing window each run (RECENT_DAYS), not full history — a
full company-wide Cin7 pull is expensive (thousands of orders, 3 req/sec
cap) and older months don't change once synced once. Run the full-history
backfill manually the first time a partner is added.

Auth: Cin7 Omni Basic Auth (see sync_cin7_costs.py for the same pattern).
"""
import base64, json, os, sys, time, urllib.error, urllib.request
from collections import defaultdict
from datetime import datetime, timedelta

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RECENT_DAYS = 60


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


def fetch_recent_orders(since_iso):
    import urllib.parse
    where = urllib.parse.quote(f"CreatedDate>='{since_iso}'")
    out, page = [], 1
    while True:
        batch = cin7_get(f"/v1/SalesOrders?limit=50&page={page}&where={where}")
        if not batch:
            break
        out.extend(batch)
        if len(batch) < 50:
            break
        page += 1
        time.sleep(0.4)
    return out


def main():
    if not (SB_URL and SB_KEY and CIN7_AUTH):
        print("Missing Supabase or Cin7 credentials — skipping.")
        return
    status, body = sb("GET", "partnership_entries?select=cin7_email&cin7_email=not.is.null")
    if status != 200:
        print(f"Couldn't read partnership_entries: {status} {body[:200]}")
        return
    rows = json.loads(body or b"[]")
    emails = {r["cin7_email"].strip().lower() for r in rows if r.get("cin7_email")}
    if not emails:
        print("No Cin7-tracked partners recorded yet — nothing to sync.")
        return

    since = (datetime.utcnow() - timedelta(days=RECENT_DAYS)).strftime("%Y-%m-%dT00:00:00Z")
    orders = fetch_recent_orders(since)
    print(f"Scanned {len(orders)} Cin7 orders since {since[:10]}.")

    by_email_month = defaultdict(lambda: {"orders": 0, "revenue": 0.0})
    for o in orders:
        if o.get("isVoid"):
            continue
        email = (o.get("email") or "").strip().lower()
        member_email = (o.get("memberEmail") or "").strip().lower()
        match = email if email in emails else (member_email if member_email in emails else None)
        if not match:
            continue
        mk = (o.get("createdDate") or "")[:7]
        if len(mk) != 7:
            continue
        key = (match, mk)
        by_email_month[key]["orders"] += 1
        by_email_month[key]["revenue"] += float(o.get("total") or 0)

    up = [{"customer_email": email, "month_key": mk, "orders": v["orders"], "revenue": round(v["revenue"], 2)}
          for (email, mk), v in by_email_month.items()]
    if up:
        status, body = sb("POST", "cin7_customer_sales?on_conflict=customer_email,month_key", json.dumps(up).encode(),
                           {"Prefer": "resolution=merge-duplicates"})
        print(f"Upserted {len(up)} rows: {status}")
        for (email, mk), v in sorted(by_email_month.items()):
            print(f"  {email} · {mk}: {v['orders']} orders, ${v['revenue']:,.2f}")
    else:
        print("No matching orders in the recent window for any tracked partner.")

    from sync_status_util import record
    record("Partnership Cin7 Sales", True, "")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        from sync_status_util import record
        record("Partnership Cin7 Sales", False, str(e))
        raise
