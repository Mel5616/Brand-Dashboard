#!/usr/bin/env python3
"""
Faire sync — pulls each brand's Faire orders from Shopify (source_name:faire) and
writes net (ex-GST) revenue per brand per month to faire_sales. The Sales-by-channel
report moves this out of Website Sales and into Partnerships.

Net revenue matches sync.py: totalPrice - tax (or totalPrice/1.1 when tax is 0).

Table (run once in Supabase):
  create table if not exists faire_sales (
    brand_id int not null, month_key text not null, revenue numeric default 0,
    primary key (brand_id, month_key));
  alter table faire_sales disable row level security;

Run: python3 scripts/sync_faire.py
"""

import os, sys, json, ssl, urllib.request
from collections import defaultdict

BASE_DIR    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(BASE_DIR, "stores.config.json")
ENV_PATH    = os.path.join(BASE_DIR, ".env.local")
RANGE_START = "2025-07-01"
RANGE_END   = "2026-06-30"
CTX = ssl.create_default_context()

def load_env():
    if not os.path.exists(ENV_PATH):
        return
    with open(ENV_PATH) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            if k.strip() not in os.environ:
                os.environ[k.strip()] = v.strip().strip('"').strip("'")
load_env()

URL  = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
KEY  = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
ANON = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")

def sb_upsert(rows):
    if not rows:
        return
    req = urllib.request.Request(f"{URL}/rest/v1/faire_sales?on_conflict=brand_id,month_key",
        data=json.dumps(rows).encode(), method="POST")
    req.add_header("Content-Type", "application/json"); req.add_header("apikey", ANON or KEY)
    req.add_header("Authorization", f"Bearer {KEY}"); req.add_header("Prefer", "resolution=merge-duplicates")
    try:
        with urllib.request.urlopen(req, context=CTX, timeout=30) as r:
            return r.status
    except urllib.error.HTTPError as e:
        print(f"    Supabase: {e.code} {e.read().decode()[:200]}")

def gql(domain, token, q):
    req = urllib.request.Request(f"https://{domain}/admin/api/2024-10/graphql.json",
        data=json.dumps({"query": q}).encode(), method="POST")
    req.add_header("X-Shopify-Access-Token", token); req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, context=CTX, timeout=40) as r:
        return json.loads(r.read().decode())

def faire_orders(domain, token):
    out, cursor = [], None
    while True:
        after = f', after: "{cursor}"' if cursor else ""
        q = f'''{{ orders(first: 250{after},
            query: "financial_status:paid source_name:faire created_at:>={RANGE_START} created_at:<={RANGE_END}",
            sortKey: CREATED_AT) {{
            edges {{ cursor node {{ createdAt totalPriceSet {{ shopMoney {{ amount }} }} totalTaxSet {{ shopMoney {{ amount }} }} }} }}
            pageInfo {{ hasNextPage }}
        }} }}'''
        data = gql(domain, token, q).get("data", {}).get("orders", {})
        edges = data.get("edges", [])
        out.extend(edges)
        if not data.get("pageInfo", {}).get("hasNextPage") or not edges:
            break
        cursor = edges[-1]["cursor"]
    return out

def sync_brand(brand_id, name, domain, token):
    print(f"  {name} ...", end=" ", flush=True)
    try:
        edges = faire_orders(domain, token)
    except Exception as e:
        print(f"error ({str(e)[:60]})"); return
    monthly = defaultdict(float)
    for e in edges:
        n = e["node"]
        gross = float(n.get("totalPriceSet", {}).get("shopMoney", {}).get("amount", 0))
        tax   = float(n.get("totalTaxSet", {}).get("shopMoney", {}).get("amount", 0))
        net   = (gross - tax) if tax > 0 else round(gross / 1.1, 2)
        monthly[n["createdAt"][:7]] += net
    rows = [{"brand_id": brand_id, "month_key": mk, "revenue": round(v, 2)} for mk, v in monthly.items()]
    sb_upsert(rows)
    print(f"{len(edges)} Faire orders · ${sum(monthly.values()):,.0f}")

def main():
    with open(CONFIG_PATH) as f:
        config = json.load(f)
    brands = [b for b in config.get("brands", []) if b.get("domain") and b.get("token")]
    if not brands:
        print("No brands with Shopify domain/token"); sys.exit(1)
    print(f"Syncing Faire orders for {len(brands)} brand(s)...\n")
    for b in brands:
        try:
            sync_brand(b["id"], b["name"], b["domain"], b["token"])
        except Exception as e:
            print(f"  ERROR {b['name']}: {e}")
    print("\nDone.")

if __name__ == "__main__":
    main()
