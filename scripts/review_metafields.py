#!/usr/bin/env python3
"""Copy each product's published Klaviyo reviews from the Supabase mirror (klaviyo_reviews) into a Shopify
product metafield, custom.reviews_json, so the brand theme can render reviews server-side (readable by
Google and answer engines, styled by the theme, independent of Klaviyo's on-site widget).

Only reviews rated MIN_RATING (default 3) or higher are published.
Brands: REVIEW_METAFIELD_BRANDS (comma-separated brand names, default "WonderFold"). Only writes when a
product's review list actually changed. Needs stores.config.json + NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY.
"""
import json, os, re, sys, urllib.parse, urllib.request

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SB_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
SB_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
BRANDS = [b.strip() for b in os.environ.get("REVIEW_METAFIELD_BRANDS", "WonderFold").split(",") if b.strip()]
MAX_PER_PRODUCT = 20
MIN_RATING = int(os.environ.get("REVIEW_METAFIELD_MIN_RATING", "3"))  # Mel, 25 Sep 2026: nothing under 3 stars on site


def env_local():
    try:
        for line in open(os.path.join(BASE_DIR, ".env.local")):
            if "=" in line and not line.startswith("#"):
                k, v = line.strip().split("=", 1)
                os.environ.setdefault(k, v.strip('"').strip("'"))
    except FileNotFoundError:
        pass


def sb(path):
    req = urllib.request.Request(SB_URL + "/rest/v1/" + path, headers={"apikey": SB_KEY, "Authorization": "Bearer " + SB_KEY})
    return json.loads(urllib.request.urlopen(req, timeout=60).read())


class Shop:
    def __init__(self, c):
        self.dom = c["domain"]
        self.c = c
        self._tok = None

    def tok(self):
        if self._tok:
            return self._tok
        for cid, sec in ((self.c.get("shopifyClientId"), self.c.get("shopifyClientSecret")), (self.c.get("clientId"), self.c.get("clientSecret"))):
            if not cid or not sec:
                continue
            try:
                d = urllib.parse.urlencode({"grant_type": "client_credentials", "client_id": cid, "client_secret": sec}).encode()
                r = json.loads(urllib.request.urlopen(urllib.request.Request("https://%s/admin/oauth/access_token" % self.dom, data=d, headers={"Content-Type": "application/x-www-form-urlencoded"}), timeout=30).read())
                self._tok = r["access_token"]
                return self._tok
            except Exception as e:
                sys.stderr.write("client credentials failed: %s\n" % e)
        self._tok = self.c.get("token")
        return self._tok

    def gql(self, q, v=None):
        req = urllib.request.Request("https://%s/admin/api/2025-01/graphql.json" % self.dom, data=json.dumps({"query": q, "variables": v or {}}).encode(), headers={"X-Shopify-Access-Token": self.tok(), "Content-Type": "application/json"})
        r = json.loads(urllib.request.urlopen(req, timeout=120).read())
        if r.get("errors"):
            raise RuntimeError(r["errors"])
        return r["data"]


def norm(s):
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


def sync_brand(brand, c):
    shop = Shop(c)
    rows = sb("klaviyo_reviews?select=rating,title,content,author,product_name,product_url,verified,status,created"
              "&brand_name=ilike.*" + urllib.parse.quote(brand) + "*&review_type=eq.review&status=in.(published,featured)&order=created.desc")
    rows = [r for r in rows if (r.get("content") or "").strip() and int(r.get("rating") or 0) >= MIN_RATING]
    products, cur = [], None
    while True:
        d = shop.gql("query($c:String){products(first:100,after:$c){pageInfo{hasNextPage endCursor} nodes{id handle title metafield(namespace:\"custom\",key:\"reviews_json\"){value}}}}", {"c": cur})["products"]
        products += d["nodes"]
        if not d["pageInfo"]["hasNextPage"]:
            break
        cur = d["pageInfo"]["endCursor"]
    by_handle = {p["handle"]: p for p in products}
    by_title = {norm(p["title"]): p for p in products}
    lists = {p["id"]: [] for p in products}
    unmatched = 0
    for r in rows:
        p = None
        m = re.search(r"/products/([^/?#]+)", r.get("product_url") or "")
        if m:
            p = by_handle.get(urllib.parse.unquote(m.group(1)))
        if not p:
            p = by_title.get(norm(r.get("product_name")))
        if not p:
            unmatched += 1
            continue
        lists[p["id"]].append(r)
    changed = 0
    batch = []
    for p in products:
        rs = sorted(lists[p["id"]], key=lambda r: (r["status"] != "featured", r["created"] and -int(re.sub(r"\D", "", r["created"][:19]) or 0)))[:MAX_PER_PRODUCT]
        val = json.dumps([{"r": int(r["rating"] or 0), "t": (r.get("title") or "").strip(), "c": r["content"].strip(), "a": (r.get("author") or "A WonderFold customer").strip(),
                            "d": (r.get("created") or "")[:10], "v": bool(r.get("verified"))} for r in rs], ensure_ascii=False, separators=(",", ":"))
        old = (p.get("metafield") or {}).get("value")
        if old == val or (old is None and val == "[]"):
            continue
        batch.append({"ownerId": p["id"], "namespace": "custom", "key": "reviews_json", "type": "json", "value": val})
        changed += 1
    for i in range(0, len(batch), 25):
        r = shop.gql("mutation($m:[MetafieldsSetInput!]!){metafieldsSet(metafields:$m){userErrors{field message}}}", {"m": batch[i:i + 25]})
        errs = r["metafieldsSet"]["userErrors"]
        if errs:
            print(brand, "metafield errors:", errs)
    print("%s: %d reviews, %d products updated, %d reviews not matched to a product" % (brand, len(rows), changed, unmatched))


def main():
    env_local()
    global SB_URL, SB_KEY
    SB_URL = SB_URL or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
    SB_KEY = SB_KEY or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not SB_URL or not SB_KEY:
        sys.exit("Supabase env missing")
    cfg = json.load(open(os.path.join(BASE_DIR, "stores.config.json")))
    for brand in BRANDS:
        c = next((b for b in cfg.get("brands", []) if brand.lower() in json.dumps({k: b.get(k) for k in ("name", "brand", "domain")}).lower()), None)
        if not c:
            print("no store config for", brand)
            continue
        sync_brand(brand, c)


if __name__ == "__main__":
    main()
