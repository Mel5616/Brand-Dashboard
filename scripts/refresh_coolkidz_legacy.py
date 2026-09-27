#!/usr/bin/env python3
"""Refresh old Coolkidz-store copies of brand products, then publish them.

copy_products_to_coolkidz.py skips a brand product when its SKU already exists
in the Coolkidz store. Many of those existing copies are old drafts from past
expo/warehouse sales (often with vendor "Coolkidz Australia" and old prices),
so the product never reached the online store. This brings each one up to date
from the brand's live store and publishes it:

  - title, description, vendor, product type, tags (+ ck-import), SEO text
  - variant price / compare-at price, matched by SKU (variants are kept, so
    order history and the expo POS are unaffected)
  - brand photos added when the Coolkidz copy has fewer than two images
  - status ACTIVE and published to the Online Store

Skips damaged-box, donation, voucher, box-part and $0 listings.

  python3 scripts/refresh_coolkidz_legacy.py [--dry-run] [--brand ZAZU]
"""
import argparse, json, os, re, sys, time, urllib.request, urllib.error

sys.path.insert(0, os.path.dirname(__file__))
from shopify_auth import store_token  # noqa: E402

CONFIG = os.path.join(os.path.dirname(__file__), "..", "stores.config.json")
SKIP = re.compile(r"damaged|gift card|donation|voucher|\bbox \d+ of \d+\b|\bbundle\b", re.I)
VENDOR = {"SmarTrike": "smarTrike"}


def gql(b, t, q, v=None):
    for i in range(5):
        r = urllib.request.Request(f"https://{b['domain']}/admin/api/2025-07/graphql.json", data=json.dumps({"query": q, "variables": v or {}}).encode(),
                                   headers={"X-Shopify-Access-Token": t, "Content-Type": "application/json"})
        d = json.load(urllib.request.urlopen(r, timeout=120))
        if any(e.get("extensions", {}).get("code") == "THROTTLED" for e in d.get("errors", [])):
            time.sleep(3); continue
        if d.get("errors"): raise RuntimeError(str(d["errors"])[:300])
        return d["data"]


def rest_put(b, t, pid, body):
    for i in range(5):
        try:
            r = urllib.request.Request(f"https://{b['domain']}/admin/api/2025-07/products/{pid}.json", data=json.dumps(body).encode(), method="PUT",
                                       headers={"X-Shopify-Access-Token": t, "Content-Type": "application/json"})
            return json.load(urllib.request.urlopen(r, timeout=60))
        except urllib.error.HTTPError as e:
            if e.code == 429: time.sleep(2); continue
            raise


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--dry-run", action="store_true"); ap.add_argument("--brand"); a = ap.parse_args()
    cfg = json.load(open(CONFIG))
    ck = next(b for b in cfg["brands"] if b["name"] == "Coolkidz Australia"); ckt = store_token(ck)

    cks, cur = {}, None
    while True:
        d = gql(ck, ckt, """query($c:String){products(first:100,after:$c){pageInfo{hasNextPage endCursor} nodes{id handle title status onlineStoreUrl
            media(first:1){nodes{id}} mediaCount{count} variants(first:100){nodes{id sku}}}}}""", {"c": cur})["products"]
        for p in d["nodes"]:
            for v in p["variants"]["nodes"]:
                if v["sku"]: cks[v["sku"].strip().lower()] = p
        if not d["pageInfo"]["hasNextPage"]: break
        cur = d["pageInfo"]["endCursor"]

    done = 0
    for b in cfg["brands"]:
        if b["name"] == "Coolkidz Australia" or (a.brand and b["name"] != a.brand): continue
        t, cur = store_token(b), None
        while True:
            d = gql(b, t, """query($c:String){products(first:50,after:$c,query:"status:active AND published_status:published"){pageInfo{hasNextPage endCursor}
                nodes{title descriptionHtml vendor productType tags seo{title description}
                  media(first:12){nodes{... on MediaImage{alt image{url}}}}
                  variants(first:100){nodes{sku price compareAtPrice}}}}}""", {"c": cur})["products"]
            for p in d["nodes"]:
                vs = p["variants"]["nodes"]
                if SKIP.search(p["title"]) or all(float(v["price"] or 0) == 0 for v in vs): continue
                hits = {cks[v["sku"].strip().lower()]["id"]: cks[v["sku"].strip().lower()] for v in vs if v["sku"] and v["sku"].strip().lower() in cks}
                if not hits or any(h["onlineStoreUrl"] for h in hits.values()): continue
                target = list(hits.values())[0]
                if SKIP.search(target["title"]): continue
                print(f"{b['name']}: {p['title'][:60]}  ->  {target['handle']}")
                if a.dry_run: done += 1; continue
                tags = sorted(set(p["tags"]) | {"ck-import", "ck-refresh", "brand-" + re.sub(r"[^a-z0-9]+", "-", b["name"].lower()).strip("-")})
                inp = {"id": target["id"], "title": p["title"], "descriptionHtml": p["descriptionHtml"], "vendor": VENDOR.get(b["name"], b["name"]),
                       "productType": p["productType"], "tags": tags}
                if p["seo"]["title"] or p["seo"]["description"]: inp["seo"] = {k: v for k, v in p["seo"].items() if v}
                r = gql(ck, ckt, "mutation($i:ProductInput!){productUpdate(input:$i){userErrors{message}}}", {"i": inp})["productUpdate"]
                if r["userErrors"]: print("   update:", r["userErrors"])
                price_by = {v["sku"].strip().lower(): v for v in vs if v["sku"]}
                upd = [{"id": v["id"], "price": price_by[v["sku"].strip().lower()]["price"],
                        "compareAtPrice": price_by[v["sku"].strip().lower()]["compareAtPrice"]}
                       for v in target["variants"]["nodes"] if v["sku"] and v["sku"].strip().lower() in price_by]
                if upd:
                    r = gql(ck, ckt, "mutation($p:ID!,$v:[ProductVariantsBulkInput!]!){productVariantsBulkUpdate(productId:$p,variants:$v){userErrors{message}}}",
                            {"p": target["id"], "v": upd})["productVariantsBulkUpdate"]
                    if r["userErrors"]: print("   prices:", r["userErrors"])
                if target["mediaCount"]["count"] < 2:
                    media = [{"originalSource": m["image"]["url"].split("?")[0], "mediaContentType": "IMAGE", "alt": m.get("alt") or p["title"]}
                             for m in p["media"]["nodes"] if m.get("image")]
                    if media:
                        r = gql(ck, ckt, "mutation($p:ID!,$m:[CreateMediaInput!]!){productCreateMedia(productId:$p,media:$m){mediaUserErrors{message}}}",
                                {"p": target["id"], "m": media})["productCreateMedia"]
                        if r["mediaUserErrors"]: print("   media:", r["mediaUserErrors"][:2])
                pid = int(target["id"].split("/")[-1])
                rest_put(ck, ckt, pid, {"product": {"id": pid, "status": "active", "published": True}})
                target["onlineStoreUrl"] = "published"
                done += 1
                time.sleep(0.3)
            if not d["pageInfo"]["hasNextPage"]: break
            cur = d["pageInfo"]["endCursor"]
    print(("would refresh" if a.dry_run else "refreshed and published"), done)


if __name__ == "__main__":
    main()
