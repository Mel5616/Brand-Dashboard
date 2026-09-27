#!/usr/bin/env python3
"""Refresh coolkidz.com.au product photos from the brand websites.

Every Coolkidz online product is matched to its brand-store product by SKU
(or the coolkidz.source metafield). When the photos differ from the brand's
current live photos (compared by file name, in order), the Coolkidz photos are
replaced with the brand's, and each colour/option variant is re-linked to its
photo so picking a colour still shows the right image.

Products whose brand listing has no photos are left alone.

  python3 scripts/coolkidz_refresh_images.py [--brand Mamave] [--dry-run] [--limit N]
"""
import argparse, json, os, re, sys, time, urllib.request

sys.path.insert(0, os.path.dirname(__file__))
from shopify_auth import store_token  # noqa: E402

CONFIG = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "stores.config.json")


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


def pages(b, t, q, key, v=None):
    cur = None
    while True:
        d = gql(b, t, q, dict(v or {}, c=cur))[key]
        yield from d["nodes"]
        if not d["pageInfo"]["hasNextPage"]: return
        cur = d["pageInfo"]["endCursor"]


def stem(url):
    """File name without query, extension, Shopify's _<uuid> suffix or size suffix."""
    n = url.split("?")[0].rsplit("/", 1)[-1].rsplit(".", 1)[0].lower()
    n = re.sub(r"_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", "", n)  # Shopify's uniqueness suffix, wherever it sits
    return re.sub(r"_\d+x\d*$", "", n)


BRAND_Q = """query($c:String){products(first:50,after:$c,query:"status:active"){pageInfo{hasNextPage endCursor}
  nodes{title handle media(first:100){nodes{... on MediaImage{id alt image{url}}}} variants(first:100){nodes{sku media(first:1){nodes{id}}}}}}}"""
CK_Q = """query($c:String){products(first:50,after:$c,query:"published_status:published"){pageInfo{hasNextPage endCursor}
  nodes{id title vendor source: metafield(namespace:"coolkidz",key:"source"){value}
    media(first:100){nodes{id ... on MediaImage{image{url}}}} variants(first:100){nodes{id sku}}}}}"""


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--brand"); ap.add_argument("--dry-run", action="store_true"); ap.add_argument("--limit", type=int, default=0)
    a = ap.parse_args()
    cfg = json.load(open(CONFIG))
    ck = next(b for b in cfg["brands"] if b["name"] == "Coolkidz Australia"); ckt = store_token(ck)

    by_sku, by_handle = {}, {}
    for b in cfg["brands"]:
        if b["name"] == "Coolkidz Australia" or (a.brand and b["name"] != a.brand): continue
        try:
            t = store_token(b)
            for p in pages(b, t, BRAND_Q, "products"):
                p["_brand"] = b["name"]
                by_handle[(b["name"], p["handle"])] = p
                for v in p["variants"]["nodes"]:
                    if v["sku"]: by_sku.setdefault(v["sku"].strip().lower(), p)
        except Exception as e:
            print(f"! {b['name']}: {e}")

    todo = []
    for p in pages(ck, ckt, CK_Q, "products"):
        m = next((by_sku[v["sku"].strip().lower()] for v in p["variants"]["nodes"] if v["sku"] and v["sku"].strip().lower() in by_sku), None)
        if not m and p["source"] and ":" in p["source"]["value"]:
            m = by_handle.get(tuple(p["source"]["value"].split(":", 1)))
        if not m: continue
        imgs = [n for n in m["media"]["nodes"] if n.get("image")]
        if not imgs: continue
        have = [stem(n["image"]["url"]) for n in p["media"]["nodes"] if n.get("image")]
        want = [stem(n["image"]["url"]) for n in imgs]
        if have == want: continue
        todo.append((p, m, imgs))
    print(f"{len(todo)} product(s) with photos that differ from the brand site")
    for p, m, imgs in todo[:40]:
        print(f"  {m['_brand']}: {p['title'][:55]}  {len(p['media']['nodes'])} -> {len(imgs)}")
    if a.dry_run: return

    done = 0
    for p, m, imgs in todo[: a.limit or None]:
        old = [n["id"] for n in p["media"]["nodes"]]
        r = gql(ck, ckt, "mutation($p:ID!,$m:[CreateMediaInput!]!){productCreateMedia(productId:$p,media:$m){media{id} mediaUserErrors{message}}}",
                {"p": p["id"], "m": [{"originalSource": n["image"]["url"].split("?")[0], "mediaContentType": "IMAGE", "alt": n.get("alt") or m["title"]} for n in imgs]})["productCreateMedia"]
        if r["mediaUserErrors"] or len(r["media"]) != len(imgs):
            print("  !", p["title"][:50], r["mediaUserErrors"][:2]); continue
        new_ids = [x["id"] for x in r["media"]]
        # remove the old photos first: a variant can only hold one photo, so it must let go of the old one
        if old:
            d = gql(ck, ckt, "mutation($p:ID!,$ids:[ID!]!){productDeleteMedia(productId:$p,mediaIds:$ids){mediaUserErrors{message}}}", {"p": p["id"], "ids": old})["productDeleteMedia"]
            if d["mediaUserErrors"]: print("  ! delete", p["title"][:40], d["mediaUserErrors"][:2])

        # brand variant photo -> the matching new Coolkidz photo (same position)
        pos = {n["id"]: i for i, n in enumerate(imgs)}
        brand_var = {v["sku"].strip().lower(): (v["media"]["nodes"] or [{}])[0].get("id") for v in m["variants"]["nodes"] if v["sku"]}
        links = []
        for v in p["variants"]["nodes"]:
            bid = brand_var.get((v["sku"] or "").strip().lower())
            if bid in pos: links.append({"variantId": v["id"], "mediaIds": [new_ids[pos[bid]]]})
        if links and len(p["variants"]["nodes"]) > 1:
            for i in range(30):  # variant media can only be attached once the new photos are processed
                st = gql(ck, ckt, "query($id:ID!){product(id:$id){media(first:150){nodes{id status}}}}", {"id": p["id"]})["product"]["media"]["nodes"]
                if all(n["status"] in ("READY", "FAILED") for n in st if n["id"] in new_ids): break
                time.sleep(2)
            rr = gql(ck, ckt, "mutation($p:ID!,$v:[ProductVariantAppendMediaInput!]!){productVariantAppendMedia(productId:$p,variantMedia:$v){userErrors{message}}}",
                     {"p": p["id"], "v": links})["productVariantAppendMedia"]
            if rr["userErrors"]: print("  ! variant photos", p["title"][:40], rr["userErrors"][:2])
        done += 1
        time.sleep(0.3)
    print(f"refreshed {done}")


if __name__ == "__main__":
    main()
