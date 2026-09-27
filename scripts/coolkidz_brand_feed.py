#!/usr/bin/env python3
"""Refresh "From our brands' journals" on coolkidz.com.au.

Takes the newest published article from each brand site (blog_articles, kept
up to date by sync_blogs.py), finds its share image, and writes one block per
brand into every ck-journal section in the chosen Coolkidz theme's templates.
Coolkidz links out to the brand sites; the brand sites link back to Coolkidz
(scripts/coolkidz_backlinks.py).

  python3 scripts/coolkidz_brand_feed.py --theme 189044785441 [--dry-run]

Also importable: build_blocks() returns the block dict for the theme builder.
"""
import argparse
import json
import os
import re
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(__file__))
from shopify_auth import store_token  # noqa: E402

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG = os.path.join(BASE, "stores.config.json")
SITES = {  # brand id -> (display name, public site)
    5: ("UPPAbaby", "https://uppababy.com.au"), 0: ("Nanit", "https://nanit.com.au"),
    3: ("Gaia Baby", "https://www.gaia-baby.com.au"), 4: ("WonderFold", "https://wonderfold.com.au"),
    1: ("Magic", "https://magicbabyproducts.com.au"), 8: ("Frida", "https://fridaaustralia.com.au"),
    6: ("ZAZU", "https://zazu-kids.com.au"), 7: ("MiaMily", "https://miamily.com.au"),
    12: ("smarTrike", "https://smartrike.com.au"), 11: ("Mamave", "https://mamave.com.au"),
    10: ("Matchstick Monkey", "https://www.matchstickmonkey.com.au"), 2: ("Hannie", "https://hannie.com.au"),
}


def env():
    out = {}
    for line in open(os.path.join(BASE, ".env.local")):
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def og_image(url):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        html = urllib.request.urlopen(req, timeout=20).read().decode("utf8", "ignore")
    except Exception:
        return ""
    m = re.search(r'<meta[^>]+property="og:image(?::secure_url)?"[^>]+content="([^"]+)"', html)
    u = m.group(1) if m else ""
    if u.startswith("//"):
        u = "https:" + u
    if u and "width=" not in u:
        u += ("&" if "?" in u else "?") + "width=600"
    return u


def build_blocks(limit=8):
    e = env()
    url, key = e["NEXT_PUBLIC_SUPABASE_URL"], e["SUPABASE_SERVICE_ROLE_KEY"]
    req = urllib.request.Request(
        f"{url}/rest/v1/blog_articles?select=brand_id,title,url,path,published_at&published_at=not.is.null&order=published_at.desc&limit=400",
        headers={"apikey": key, "Authorization": f"Bearer {key}"})
    rows = json.load(urllib.request.urlopen(req, timeout=30))
    seen, blocks, order = set(), {}, []
    for r in rows:
        bid = r["brand_id"]
        if bid not in SITES or bid in seen:
            continue
        name, site = SITES[bid]
        link = r.get("url") or (site + (r.get("path") or ""))
        if not link.startswith("http"):
            link = site + link
        seen.add(bid)
        k = f"brand_{bid}"
        blocks[k] = {"type": "external", "settings": {
            "brand": name, "title": r["title"], "url": link, "image_url": og_image(link)}}
        order.append(k)
        if len(order) >= limit:
            break
    return blocks, order


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--theme", required=True)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    blocks, order = build_blocks()
    print(f"{len(order)} brand articles")
    cfg = json.load(open(CONFIG))
    store = next(b for b in cfg["brands"] if b["name"] == "Coolkidz Australia")
    tok = store_token(store)
    tid = f"gid://shopify/OnlineStoreTheme/{a.theme}"

    def gql(q, v=None):
        req = urllib.request.Request(f"https://{store['domain']}/admin/api/2025-07/graphql.json",
                                     data=json.dumps({"query": q, "variables": v or {}}).encode(),
                                     headers={"X-Shopify-Access-Token": tok, "Content-Type": "application/json"})
        return json.load(urllib.request.urlopen(req, timeout=90))["data"]

    files = gql('query($id:ID!){theme(id:$id){files(first:250,filenames:["templates/*.json"]){nodes{filename body{... on OnlineStoreThemeFileBodyText{content}}}}}}',
                {"id": tid})["theme"]["files"]["nodes"]
    out = []
    for f in files:
        txt = re.sub(r"^/\*.*?\*/\s*", "", f["body"]["content"], flags=re.S)
        try:
            d = json.loads(txt)
        except ValueError:
            continue
        hit = False
        for sec in d.get("sections", {}).values():
            if sec.get("type") == "ck-journal":
                sec["blocks"], sec["block_order"] = blocks, order
                hit = True
        if hit:
            out.append({"filename": f["filename"], "body": {"type": "TEXT", "value": json.dumps(d, indent=2)}})
    print("templates:", [o["filename"] for o in out])
    if out and not a.dry_run:
        r = gql("""mutation($id:ID!,$f:[OnlineStoreThemeFilesUpsertFileInput!]!){themeFilesUpsert(themeId:$id,files:$f){userErrors{filename message}}}""",
                {"id": tid, "f": out})
        print(r["themeFilesUpsert"]["userErrors"] or "updated")


if __name__ == "__main__":
    main()
