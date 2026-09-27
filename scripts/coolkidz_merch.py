#!/usr/bin/env python3
"""Merchandising data for coolkidz.com.au, taken from the brand websites.

Every Coolkidz online product is matched to its brand-store product by SKU
(or the coolkidz.source metafield for SKU-less products), then:

  - Star ratings: the average and count of the brand product's published
    Klaviyo reviews (Supabase mirror klaviyo_reviews) go into the standard
    reviews.rating / reviews.rating_count metafields. Products without reviews
    are left without a rating (never invented).
  - Best sellers: units sold on the brand's own online store in the last
    DAYS days. The top TOP products fill the "Best sellers" collection
    (handle best-sellers), in rank order.
  - New: products the brand added in the last NEW_DAYS days get the tag
    ck-new (and lose it once they're older).

Runs daily from .github/workflows/coolkidz_merch.yml. Only writes what changed.

  python3 scripts/coolkidz_merch.py [--dry-run]
"""
import argparse, collections, json, os, sys, time, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(__file__))
from shopify_auth import store_token  # noqa: E402

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG = os.path.join(BASE, "stores.config.json")
DAYS, TOP, NEW_DAYS = 90, 24, 60
BEST_HANDLE = "best-sellers"


def env_local():
    try:
        for line in open(os.path.join(BASE, ".env.local")):
            if "=" in line and not line.startswith("#"):
                k, v = line.strip().split("=", 1)
                os.environ.setdefault(k, v.strip('"').strip("'"))
    except FileNotFoundError:
        pass


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


def sb(path):
    url, key = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/"), os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    req = urllib.request.Request(url + "/rest/v1/" + path, headers={"apikey": key, "Authorization": "Bearer " + key})
    return json.loads(urllib.request.urlopen(req, timeout=60).read())


def handle_of(url):
    p = urllib.parse.urlparse(url or "").path.rstrip("/").split("/")
    return p[p.index("products") + 1] if "products" in p and p.index("products") + 1 < len(p) else None


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--dry-run", action="store_true"); a = ap.parse_args()
    env_local()
    cfg = json.load(open(CONFIG))
    ck = next(b for b in cfg["brands"] if b["name"] == "Coolkidz Australia"); ckt = store_token(ck)
    now = datetime.now(timezone.utc)

    # brand products: key (brand, handle) -> created, skus; plus units sold
    by_sku, created, sold = {}, {}, collections.Counter()
    since = (now - timedelta(days=DAYS)).strftime("%Y-%m-%d")
    for b in cfg["brands"]:
        if b["name"] == "Coolkidz Australia": continue
        try:
            t = store_token(b)
            for p in pages(b, t, """query($c:String){products(first:100,after:$c,query:"status:active"){pageInfo{hasNextPage endCursor}
                    nodes{id handle createdAt variants(first:100){nodes{sku}}}}}""", "products"):
                k = (b["name"], p["handle"]); created[k] = p["createdAt"]
                for v in p["variants"]["nodes"]:
                    if v["sku"]: by_sku.setdefault(v["sku"].strip().lower(), k)
            q = f"created_at:>={since} AND -status:cancelled AND source_name:web"
            for o in pages(b, t, """query($c:String,$q:String){orders(first:100,after:$c,query:$q){pageInfo{hasNextPage endCursor}
                    nodes{lineItems(first:50){nodes{sku quantity product{handle}}}}}}""", "orders", {"q": q}):
                for li in o["lineItems"]["nodes"]:
                    h = (li.get("product") or {}).get("handle")
                    if h: sold[(b["name"], h)] += li["quantity"]
        except Exception as e:
            print(f"! {b['name']}: {e}")
    print(f"{len(created)} brand products, {sum(sold.values())} units sold online in {DAYS} days")

    # reviews by (brand, handle)
    stars = collections.defaultdict(list)
    try:
        off = 0
        while True:
            rows = sb(f"klaviyo_reviews?select=brand_name,rating,product_url&status=eq.published&review_type=eq.review&rating=not.is.null&limit=1000&offset={off}")
            for r in rows:
                h = handle_of(r["product_url"])
                if h: stars[(r["brand_name"], h)].append(r["rating"])
            if len(rows) < 1000: break
            off += 1000
    except Exception as e:
        print("! reviews:", e)
    print(f"{sum(len(v) for v in stars.values())} published reviews across {len(stars)} brand products")

    # Coolkidz online products -> brand key
    cks = []
    for p in pages(ck, ckt, """query($c:String){products(first:100,after:$c,query:"published_status:published"){pageInfo{hasNextPage endCursor}
            nodes{id tags source: metafield(namespace:"coolkidz",key:"source"){value}
              rating: metafield(namespace:"reviews",key:"rating"){value} count: metafield(namespace:"reviews",key:"rating_count"){value}
              variants(first:100){nodes{sku}}}}}""", "products"):
        k = next((by_sku[v["sku"].strip().lower()] for v in p["variants"]["nodes"] if v["sku"] and v["sku"].strip().lower() in by_sku), None)
        if not k and p["source"] and ":" in p["source"]["value"]:
            bn, bh = p["source"]["value"].split(":", 1); k = (bn, bh)
        cks.append((p, k))

    mf, tag_add, tag_rm = [], [], []
    for p, k in cks:
        r = stars.get(k) if k else None
        if r:
            val = json.dumps({"value": f"{sum(r) / len(r):.1f}", "scale_min": "1.0", "scale_max": "5.0"})
            cur = json.loads(p["rating"]["value"])["value"] if p["rating"] else None
            if cur != f"{sum(r) / len(r):.1f}" or (p["count"] or {}).get("value") != str(len(r)):
                mf += [{"ownerId": p["id"], "namespace": "reviews", "key": "rating", "type": "rating", "value": val},
                       {"ownerId": p["id"], "namespace": "reviews", "key": "rating_count", "type": "number_integer", "value": str(len(r))}]
        is_new = bool(k and created.get(k) and datetime.fromisoformat(created[k].replace("Z", "+00:00")) > now - timedelta(days=NEW_DAYS))
        if is_new and "ck-new" not in p["tags"]: tag_add.append(p["id"])
        if not is_new and "ck-new" in p["tags"]: tag_rm.append(p["id"])
    print(f"ratings to write: {len(mf) // 2}; new tag +{len(tag_add)} -{len(tag_rm)}")

    ranked = sorted(((sold[k], p["id"]) for p, k in cks if k and sold.get(k)), reverse=True)
    best, seen = [], set()
    for n, pid in ranked:
        if pid not in seen: seen.add(pid); best.append(pid)
    best = best[:TOP]
    print(f"best sellers: {len(best)}")
    if a.dry_run: return

    for i in range(0, len(mf), 24):
        r = gql(ck, ckt, "mutation($m:[MetafieldsSetInput!]!){metafieldsSet(metafields:$m){userErrors{message}}}", {"m": mf[i:i + 24]})["metafieldsSet"]
        if r["userErrors"]: print("  !", r["userErrors"][:2])
    for pid in tag_add:
        gql(ck, ckt, "mutation($id:ID!){tagsAdd(id:$id,tags:[\"ck-new\"]){userErrors{message}}}", {"id": pid})
    for pid in tag_rm:
        gql(ck, ckt, "mutation($id:ID!){tagsRemove(id:$id,tags:[\"ck-new\"]){userErrors{message}}}", {"id": pid})

    # best sellers collection (manual, ordered)
    col = gql(ck, ckt, 'query{collectionByHandle(handle:"%s"){id products(first:250){nodes{id}}}}' % BEST_HANDLE)["collectionByHandle"]
    if not col:
        r = gql(ck, ckt, """mutation($i:CollectionInput!){collectionCreate(input:$i){collection{id} userErrors{message}}}""",
                {"i": {"title": "Best sellers", "handle": BEST_HANDLE, "sortOrder": "MANUAL",
                       "descriptionHtml": "<p>The most-bought products across our brands right now, updated every day from the brands' own online sales.</p>"}})["collectionCreate"]
        col = {"id": r["collection"]["id"], "products": {"nodes": []}}
        cid = col["id"].split("/")[-1]  # publish to the online store (REST; the app has no publications scope)
        urllib.request.urlopen(urllib.request.Request(f"https://{ck['domain']}/admin/api/2025-07/custom_collections/{cid}.json", method="PUT",
            data=json.dumps({"custom_collection": {"id": int(cid), "published": True}}).encode(),
            headers={"X-Shopify-Access-Token": ckt, "Content-Type": "application/json"}), timeout=60)
        print("created collection", col["id"])
    have = [n["id"] for n in col["products"]["nodes"]]
    if have != best:
        gone = [x for x in have if x not in best]
        if gone: gql(ck, ckt, "mutation($id:ID!,$p:[ID!]!){collectionRemoveProducts(id:$id,productIds:$p){userErrors{message}}}", {"id": col["id"], "p": gone})
        add = [x for x in best if x not in have]
        if add: gql(ck, ckt, "mutation($id:ID!,$p:[ID!]!){collectionAddProducts(id:$id,productIds:$p){userErrors{message}}}", {"id": col["id"], "p": add})
        moves = [{"id": pid, "newPosition": str(i)} for i, pid in enumerate(best)]
        if moves: gql(ck, ckt, "mutation($id:ID!,$m:[MoveInput!]!){collectionReorderProducts(id:$id,moves:$m){userErrors{message}}}", {"id": col["id"], "m": moves})
        print("best sellers updated")


if __name__ == "__main__":
    main()
