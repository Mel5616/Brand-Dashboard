#!/usr/bin/env python3
"""
Shopify special-source sync — some orders flow through Shopify from marketplaces /
wholesale partners (Faire, Baby Bunting via Mirakl, …) and should be reported under
their own channel, not Website Sales. This pulls net (ex-GST) revenue per brand /
month / source for the SOURCES below, into shopify_source_sales. The Sales report
maps each source to a channel and nets it out of the live Website Sales total.

Add a new source here and it just works (then map it in SalesPanel.SOURCE_CHANNEL).

Table (run once in Supabase):
  create table if not exists shopify_source_sales (
    brand_id int not null, month_key text not null, source text not null,
    revenue numeric default 0, primary key (brand_id, month_key, source));
  alter table shopify_source_sales disable row level security;

Run: python3 scripts/sync_shopify_sources.py
"""

import os, sys, json, ssl, urllib.request
from collections import defaultdict

BASE_DIR    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(BASE_DIR, "stores.config.json")
ENV_PATH    = os.path.join(BASE_DIR, ".env.local")
from datetime import date as _date
RANGE_START = "2025-07-01"
RANGE_END   = _date.today().isoformat()   # rolls with today instead of a fixed end
SOURCES     = ["faire", "Baby Bunting"]   # Shopify source_name values to break out
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
    req = urllib.request.Request(f"{URL}/rest/v1/shopify_source_sales?on_conflict=brand_id,month_key,source",
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

def source_orders(domain, token, source):
    # Quote the value for Shopify search if it contains a space.
    val = f'\\"{source}\\"' if " " in source else source
    out, cursor = [], None
    while True:
        after = f', after: "{cursor}"' if cursor else ""
        q = f'''{{ orders(first: 250{after},
            query: "financial_status:paid source_name:{val} created_at:>={RANGE_START} created_at:<={RANGE_END}",
            sortKey: CREATED_AT) {{
            edges {{ cursor node {{ createdAt sourceName totalPriceSet {{ shopMoney {{ amount }} }} totalTaxSet {{ shopMoney {{ amount }} }} }} }}
            pageInfo {{ hasNextPage }}
        }} }}'''
        data = gql(domain, token, q).get("data", {}).get("orders", {})
        edges = data.get("edges", [])
        out.extend(edges)
        if not data.get("pageInfo", {}).get("hasNextPage") or not edges:
            break
        cursor = edges[-1]["cursor"]
    return out

def net(node):
    gross = float(node.get("totalPriceSet", {}).get("shopMoney", {}).get("amount", 0))
    tax   = float(node.get("totalTaxSet", {}).get("shopMoney", {}).get("amount", 0))
    return (gross - tax) if tax > 0 else round(gross / 1.1, 2)

def sync_brand(brand_id, name, domain, token):
    rows, parts = [], []
    for source in SOURCES:
        try:
            edges = source_orders(domain, token, source)
        except Exception as e:
            print(f"  {name} / {source}: error ({str(e)[:50]})"); continue
        # exact match on sourceName (the search can be fuzzy)
        edges = [e for e in edges if (e["node"].get("sourceName") or "").lower() == source.lower()]
        monthly = defaultdict(float)
        for e in edges:
            monthly[e["node"]["createdAt"][:7]] += net(e["node"])
        for mk, v in monthly.items():
            rows.append({"brand_id": brand_id, "month_key": mk, "source": source, "revenue": round(v, 2)})
        if monthly:
            parts.append(f"{source} ${sum(monthly.values()):,.0f}")
    sb_upsert(rows)
    if parts:
        print(f"  {name}: " + " · ".join(parts))

def main():
    with open(CONFIG_PATH) as f:
        config = json.load(f)
    brands = [b for b in config.get("brands", []) if b.get("domain") and b.get("token")]
    if not brands:
        print("No brands with Shopify domain/token"); sys.exit(1)
    print(f"Syncing Shopify special sources {SOURCES} for {len(brands)} brand(s)...\n")
    for b in brands:
        try:
            sync_brand(b["id"], b["name"], b["domain"], b["token"])
        except Exception as e:
            print(f"  ERROR {b['name']}: {e}")
    print("\nDone.")

if __name__ == "__main__":
    from sync_status_util import record
    try:
        main(); record("Shopify sources", True)
    except Exception as e:
        record("Shopify sources", False, str(e)); raise
