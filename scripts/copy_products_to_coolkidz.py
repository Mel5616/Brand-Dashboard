#!/usr/bin/env python3
"""Copy every active product from the brand Shopify stores into the Coolkidz
store as DRAFT products, for the coolkidz.com.au multi-brand shop.

Brand sites can't cross-promote each other, so Coolkidz carries its own copy
of each product (same SKUs, so Cin7 can match stock and orders).

Safe to re-run:
  - products are created as DRAFT and published to no sales channel, so
    nothing appears on the online store or the expo POS till;
  - a product is skipped if ANY of its SKUs already exists in the Coolkidz
    store (the store already carries some brand products for the expo till);
  - gift cards and "damaged box" listings are skipped.

Usage:
  python3 scripts/copy_products_to_coolkidz.py --dry-run
  python3 scripts/copy_products_to_coolkidz.py [--brand Nanit] [--limit 1]
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.request

sys.path.insert(0, os.path.dirname(__file__))
from shopify_auth import store_token  # noqa: E402

API = "2025-01"
CONFIG = os.path.join(os.path.dirname(__file__), "..", "stores.config.json")
TARGET = "Coolkidz Australia"
VENDOR = {"SmarTrike": "smarTrike"}
SKIP_TITLE = re.compile(r"damaged|gift card|\btest\b", re.I)


def gql(brand, token, query, variables=None, tries=4):
    body = json.dumps({"query": query, "variables": variables or {}}).encode()
    for i in range(tries):
        req = urllib.request.Request(
            f"https://{brand['domain']}/admin/api/{API}/graphql.json", data=body,
            headers={"X-Shopify-Access-Token": token, "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                d = json.load(r)
        except Exception as e:
            if i == tries - 1:
                raise
            time.sleep(2 * (i + 1))
            continue
        if any(e.get("extensions", {}).get("code") == "THROTTLED" for e in d.get("errors", [])):
            time.sleep(3)
            continue
        if d.get("errors"):
            raise RuntimeError(json.dumps(d["errors"])[:500])
        return d["data"]


SOURCE_Q = """query($c:String){products(first:25,after:$c,query:"status:active AND published_status:published"){
 pageInfo{hasNextPage endCursor}
 nodes{title handle descriptionHtml vendor productType tags isGiftCard
  seo{title description}
  options{name position optionValues{name}}
  media(first:20){nodes{... on MediaImage{alt image{url}}}}
  variants(first:100){nodes{sku barcode price compareAtPrice taxable inventoryPolicy
   selectedOptions{name value} image{url}
   inventoryItem{measurement{weight{value unit}}}}}}}}"""


def source_products(brand, token):
    out, cur = [], None
    while True:
        d = gql(brand, token, SOURCE_Q, {"c": cur})["products"]
        out += d["nodes"]
        if not d["pageInfo"]["hasNextPage"]:
            return out
        cur = d["pageInfo"]["endCursor"]


def target_index(brand, token):
    skus, handles, cur = set(), set(), None
    while True:
        d = gql(brand, token, """query($c:String){products(first:100,after:$c){pageInfo{hasNextPage endCursor}
          nodes{handle variants(first:100){nodes{sku}}}}}""", {"c": cur})["products"]
        for p in d["nodes"]:
            handles.add(p["handle"])
            skus.update(v["sku"].strip().lower() for v in p["variants"]["nodes"] if v["sku"])
        if not d["pageInfo"]["hasNextPage"]:
            return skus, handles
        cur = d["pageInfo"]["endCursor"]


def strip_url(u):
    return u.split("?")[0] if u else u


def build_input(p, brand_name, handle):
    files, seen = [], set()
    for m in p["media"]["nodes"]:
        u = strip_url((m.get("image") or {}).get("url"))
        if u and u not in seen:
            seen.add(u)
            files.append({"originalSource": u, "contentType": "IMAGE", "alt": m.get("alt") or p["title"]})
    variants = []
    for v in p["variants"]["nodes"]:
        vi = {
            "optionValues": [{"optionName": o["name"], "name": o["value"]} for o in v["selectedOptions"]],
            "price": v["price"],
            "sku": v["sku"] or None,
            "barcode": v["barcode"] or None,
            "taxable": v["taxable"],
            "inventoryPolicy": v["inventoryPolicy"],
        }
        if v["compareAtPrice"]:
            vi["compareAtPrice"] = v["compareAtPrice"]
        w = ((v.get("inventoryItem") or {}).get("measurement") or {}).get("weight")
        if w and w.get("value"):
            vi["inventoryItem"] = {"measurement": {"weight": w}}
        img = strip_url((v.get("image") or {}).get("url"))
        if img and img in seen:
            vi["file"] = {"originalSource": img, "contentType": "IMAGE"}
        variants.append(vi)
    inp = {
        "title": p["title"],
        "handle": handle,
        "descriptionHtml": p["descriptionHtml"],
        "vendor": VENDOR.get(brand_name, brand_name),
        "productType": p["productType"],
        "tags": sorted(set(p["tags"]) | {"ck-import", f"brand-{re.sub(r'[^a-z0-9]+', '-', brand_name.lower()).strip('-')}"}),
        "status": "DRAFT",
        "productOptions": [{"name": o["name"], "position": o["position"],
                            "values": [{"name": x["name"]} for x in o["optionValues"]]} for o in p["options"]],
        "variants": variants,
        "files": files,
        "metafields": [{"namespace": "coolkidz", "key": "source", "type": "single_line_text_field",
                        "value": f"{brand_name}:{p['handle']}"}],
    }
    if p["seo"]["title"] or p["seo"]["description"]:
        inp["seo"] = {k: v for k, v in p["seo"].items() if v}
    return inp


SET_M = """mutation($i:ProductSetInput!){productSet(synchronous:true,input:$i){
  product{id handle} userErrors{field message code}}}"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--brand")
    ap.add_argument("--limit", type=int)
    a = ap.parse_args()

    cfg = json.load(open(CONFIG))
    target = next(b for b in cfg["brands"] if b["name"] == TARGET)
    ttok = store_token(target)
    skus, handles = target_index(target, ttok)
    print(f"Coolkidz store: {len(handles)} products, {len(skus)} SKUs already there")

    made = skipped = failed = 0
    log = []
    for brand in cfg["brands"]:
        if brand["name"] == TARGET or (a.brand and brand["name"] != a.brand):
            continue
        try:
            prods = source_products(brand, store_token(brand))
        except Exception as e:
            print(f"✗ {brand['name']}: could not read products ({e})")
            continue
        todo = []
        for p in prods:
            psk = {v["sku"].strip().lower() for v in p["variants"]["nodes"] if v["sku"]}
            if p["isGiftCard"] or SKIP_TITLE.search(p["title"]):
                skipped += 1
                log.append((brand["name"], p["title"], "skip: gift card/damaged/test"))
            elif psk & skus:
                skipped += 1
                log.append((brand["name"], p["title"], "skip: SKU already in Coolkidz"))
            else:
                todo.append(p)
        print(f"{brand['name']}: {len(prods)} active, {len(todo)} to copy")
        for p in todo[: a.limit] if a.limit else todo:
            h = p["handle"] if p["handle"] not in handles else f"{re.sub(r'[^a-z0-9]+', '-', brand['name'].lower())}-{p['handle']}"
            if a.dry_run:
                made += 1
                continue
            try:
                r = gql(target, ttok, SET_M, {"i": build_input(p, brand["name"], h)})["productSet"]
            except Exception as e:
                r = {"product": None, "userErrors": [{"message": str(e)}]}
            if r["userErrors"] or not r["product"]:
                failed += 1
                log.append((brand["name"], p["title"], "FAILED: " + "; ".join(x["message"] for x in r["userErrors"])))
                print(f"  ✗ {p['title']}: {r['userErrors']}")
            else:
                made += 1
                handles.add(r["product"]["handle"])
                skus.update(v["sku"].strip().lower() for v in p["variants"]["nodes"] if v["sku"])
                log.append((brand["name"], p["title"], "created draft " + r["product"]["handle"]))
    verb = "would create" if a.dry_run else "created"
    print(f"\n{verb} {made} draft products, skipped {skipped}, failed {failed}")
    with open(os.path.join(os.path.dirname(__file__), "..", "copy_products_log.json"), "w") as f:
        json.dump(log, f, indent=1)


if __name__ == "__main__":
    main()
