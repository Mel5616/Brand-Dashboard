#!/usr/bin/env python3
"""Keep coolkidz.com.au prices in step with the brand websites.

The brand's own Australian store is the source of truth. For every product on
the Coolkidz online store, each variant is matched by SKU to the brand stores,
and its price and compare-at ("was") price are updated when they differ. Runs
hourly from .github/workflows/coolkidz_price_sync.yml.

Only products published on the Coolkidz online store are touched, so expo-till
(POS-only) listings keep whatever pricing the team set for a show.

Also reports (does not change) Coolkidz products whose brand listing is no
longer active on the brand site, so someone can decide whether to hide them.

  python3 scripts/sync_coolkidz_prices.py [--dry-run]
"""
import argparse, collections, json, os, sys, time, urllib.request

sys.path.insert(0, os.path.dirname(__file__))
from shopify_auth import store_token  # noqa: E402

CONFIG = os.path.join(os.path.dirname(__file__), "..", "stores.config.json")


def gql(b, t, q, v=None):
    for i in range(6):
        r = urllib.request.Request(f"https://{b['domain']}/admin/api/2025-07/graphql.json", data=json.dumps({"query": q, "variables": v or {}}).encode(),
                                   headers={"X-Shopify-Access-Token": t, "Content-Type": "application/json"})
        d = json.load(urllib.request.urlopen(r, timeout=120))
        if any(e.get("extensions", {}).get("code") == "THROTTLED" for e in d.get("errors", [])):
            time.sleep(3); continue
        if d.get("errors"): raise RuntimeError(str(d["errors"])[:300])
        return d["data"]
    raise RuntimeError("throttled")


def money(x):
    return None if x in (None, "") else f"{float(x):.2f}"


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--dry-run", action="store_true"); a = ap.parse_args()
    cfg = json.load(open(CONFIG))
    ck = next(b for b in cfg["brands"] if b["name"] == "Coolkidz Australia"); ckt = store_token(ck)

    # brand prices by SKU (active products only)
    brand_price, brand_seen = {}, set()
    for b in cfg["brands"]:
        if b["name"] == "Coolkidz Australia": continue
        try:
            t = store_token(b)
        except Exception as e:
            print(f"! {b['name']}: no token ({e})"); continue
        cur = None
        while True:
            d = gql(b, t, """query($c:String){productVariants(first:250,after:$c,query:"product_status:active"){pageInfo{hasNextPage endCursor}
                nodes{sku price compareAtPrice}}}""", {"c": cur})["productVariants"]
            for v in d["nodes"]:
                pr = money(v["price"])
                if not v["sku"] or not pr or float(pr) == 0:
                    continue  # $0 free-gift listings share SKUs with the real product
                cmp_ = money(v["compareAtPrice"])
                if cmp_ and float(cmp_) <= float(pr):
                    cmp_ = None  # a "was" price that isn't higher isn't a sale
                brand_price.setdefault(v["sku"].strip().lower(), set()).add((pr, cmp_, b["name"]))
            if not d["pageInfo"]["hasNextPage"]: break
            cur = d["pageInfo"]["endCursor"]
        brand_seen.add(b["name"])
    ambiguous = {k for k, v in brand_price.items() if len({x[0] for x in v}) > 1}
    brand_price = {k: sorted(v)[0] for k, v in brand_price.items() if k not in ambiguous}
    print(f"{len(brand_price)} brand SKUs across {len(brand_seen)} stores ({len(ambiguous)} with conflicting prices skipped)")

    # Coolkidz online-store variants
    todo, gone, checked, cur = collections.defaultdict(list), [], 0, None
    ambiguous = ambiguous
    while True:
        d = gql(ck, ckt, """query($c:String){products(first:100,after:$c,query:"published_status:published"){pageInfo{hasNextPage endCursor}
            nodes{id title variants(first:100){nodes{id sku price compareAtPrice}}}}}""", {"c": cur})["products"]
        for p in d["nodes"]:
            for v in p["variants"]["nodes"]:
                if not v["sku"]: continue
                k = v["sku"].strip().lower(); checked += 1
                if k in ambiguous: continue
                if k not in brand_price:
                    gone.append(p["title"]); continue
                bp, bc, brand = brand_price[k]
                if bp and (money(v["price"]) != bp or money(v["compareAtPrice"]) != bc):
                    todo[p["id"]].append({"id": v["id"], "price": bp, "compareAtPrice": bc,
                                          "_log": f"{brand}: {p['title'][:55]} {money(v['price'])} -> {bp}" + (f" (was {bc})" if bc else "")})
        if not d["pageInfo"]["hasNextPage"]: break
        cur = d["pageInfo"]["endCursor"]

    changes = sum(len(v) for v in todo.values())
    print(f"checked {checked} Coolkidz variants; {changes} price change(s)")
    for pid, vs in todo.items():
        for v in vs: print("  ", v["_log"])
        if a.dry_run: continue
        r = gql(ck, ckt, "mutation($p:ID!,$v:[ProductVariantsBulkInput!]!){productVariantsBulkUpdate(productId:$p,variants:$v){userErrors{message}}}",
                {"p": pid, "v": [{k: x for k, x in v.items() if k != "_log"} for v in vs]})["productVariantsBulkUpdate"]
        if r["userErrors"]: print("   !", r["userErrors"])
    if gone:
        print(f"{len(set(gone))} Coolkidz product(s) not active on any brand site (left as is):")
        for t in sorted(set(gone))[:30]: print("   -", t)


if __name__ == "__main__":
    main()
