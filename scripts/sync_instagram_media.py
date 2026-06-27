#!/usr/bin/env python3
"""
Instagram media sync — pulls each brand's recent posts (image, caption, likes,
comments, permalink) and caches the images in Supabase Storage so the dashboard
serves permanent URLs (Instagram's own image URLs expire within a day).

Keeps the most recent RECENT_N posts per brand; prunes older rows + their cached
images so storage stays bounded.

Table (run once in Supabase):
  create table if not exists instagram_media (
    brand_id int not null, media_id text not null,
    caption text, media_type text, permalink text, posted_at timestamptz,
    like_count int default 0, comments_count int default 0,
    image_url text, synced_at timestamptz default now(),
    primary key (brand_id, media_id));
  alter table instagram_media disable row level security;

Also needs a public Storage bucket named 'instagram' (the script creates it).

Run: python3 scripts/sync_instagram_media.py
"""

import os, sys, json, ssl, time, urllib.request, urllib.parse

BASE_DIR    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(BASE_DIR, "stores.config.json")
ENV_PATH    = os.path.join(BASE_DIR, ".env.local")
API         = "https://graph.facebook.com/v20.0"
BUCKET      = "instagram"
RECENT_N    = 24
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

def sb(method, path, data=None, ctype="application/json", extra=None):
    r = urllib.request.Request(f"{URL}{path}", data=data, method=method)
    r.add_header("Authorization", f"Bearer {KEY}"); r.add_header("apikey", ANON or KEY)
    if ctype:
        r.add_header("Content-Type", ctype)
    for k, v in (extra or {}).items():
        r.add_header(k, v)
    try:
        with urllib.request.urlopen(r, context=CTX, timeout=40) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()

def ensure_bucket():
    sb("POST", "/storage/v1/bucket", json.dumps({"id": BUCKET, "name": BUCKET, "public": True}).encode())

def ig_get(path, params, token):
    url = f"{API}/{path}?{urllib.parse.urlencode(dict(params, access_token=token))}"
    with urllib.request.urlopen(url, context=CTX, timeout=25) as r:
        return json.loads(r.read().decode())

def public_url(path):
    return f"{URL}/storage/v1/object/public/{BUCKET}/{path}"

def cache_image(src, path):
    try:
        img = urllib.request.urlopen(src, context=CTX, timeout=30).read()
    except Exception:
        return None
    st, _ = sb("POST", f"/storage/v1/object/{BUCKET}/{path}", img, ctype="image/jpeg", extra={"x-upsert": "true"})
    return public_url(path) if st in (200, 201) else None

def existing(brand_id):
    st, b = sb("GET", f"/rest/v1/instagram_media?brand_id=eq.{brand_id}&select=media_id,image_url", ctype=None)
    if st != 200:
        return {}
    return {r["media_id"]: r.get("image_url") for r in json.loads(b.decode() or "[]")}

def upsert(rows):
    if not rows:
        return
    sb("POST", "/rest/v1/instagram_media?on_conflict=brand_id,media_id",
       json.dumps(rows).encode(), extra={"Prefer": "resolution=merge-duplicates"})

def sync_brand(brand_id, name, ig_id, token):
    print(f"  {name} ...", end=" ", flush=True)
    try:
        data = ig_get(f"{ig_id}/media", {
            "fields": "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count",
            "limit": RECENT_N,
        }, token)
    except urllib.error.HTTPError as e:
        print(f"no media ({e.code})"); return
    media = data.get("data", [])
    have = existing(brand_id)
    rows, kept, new_imgs = [], set(), 0
    for m in media:
        mid = m["id"]; kept.add(mid)
        img_url = have.get(mid)
        if not img_url:  # new post — cache its image once
            src = m.get("thumbnail_url") if m.get("media_type") == "VIDEO" else (m.get("media_url") or m.get("thumbnail_url"))
            if src:
                img_url = cache_image(src, f"{brand_id}/{mid}.jpg")
                if img_url:
                    new_imgs += 1
        rows.append({
            "brand_id": brand_id, "media_id": mid, "caption": (m.get("caption") or "")[:2000],
            "media_type": m.get("media_type"), "permalink": m.get("permalink"),
            "posted_at": m.get("timestamp"), "like_count": int(m.get("like_count", 0) or 0),
            "comments_count": int(m.get("comments_count", 0) or 0), "image_url": img_url,
        })
    upsert(rows)
    # Prune posts no longer in the recent set (rows + cached images)
    for mid in have:
        if mid not in kept:
            sb("DELETE", f"/rest/v1/instagram_media?brand_id=eq.{brand_id}&media_id=eq.{mid}", ctype=None)
            sb("DELETE", f"/storage/v1/object/{BUCKET}/{brand_id}/{mid}.jpg", ctype=None)
    print(f"{len(rows)} posts ({new_imgs} new images)")

def main():
    with open(CONFIG_PATH) as f:
        config = json.load(f)
    token = config.get("metaAccessToken")
    brands = [b for b in config.get("brands", []) if b.get("instagramAccountId")]
    if not token or not brands:
        print("Missing metaAccessToken or no instagramAccountId brands"); sys.exit(1)
    ensure_bucket()
    print(f"Syncing Instagram media for {len(brands)} brand(s)...\n")
    for b in brands:
        try:
            sync_brand(b["id"], b["name"], b["instagramAccountId"], token)
        except Exception as e:
            print(f"  ERROR {b['name']}: {e}")
        time.sleep(0.3)
    print("\nDone.")

if __name__ == "__main__":
    main()
