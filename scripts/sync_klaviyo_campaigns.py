#!/usr/bin/env python3
"""
Klaviyo campaigns (EDMs) sync — pulls each brand's sent email campaigns and caches
the creative's hero image in Supabase Storage so the dashboard serves a permanent
thumbnail. Powers the "Email creative" gallery on the Email tab and the Monthly
Snapshot report.

Setup:
  1. Table — run supabase/add_edm_campaigns.sql once.
  2. The script creates a public Storage bucket named 'edm'.
  3. Klaviyo API key needs read scopes for Campaigns and Templates.
     (Uses the same klaviyoApiKey from stores.config.json as sync_klaviyo.py.)
  4. python3 scripts/sync_klaviyo_campaigns.py

The thumbnail is the first real <img> in the campaign's rendered HTML (the hero
image), which is what most EDMs lead with. If a campaign has no usable image it is
still stored (subject + date) with no thumbnail.
"""

import os, sys, json, re, time, ssl, urllib.request, urllib.parse

BASE_DIR    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(BASE_DIR, "stores.config.json")
ENV_PATH    = os.path.join(BASE_DIR, ".env.local")
BUCKET      = "edm"
REVISION    = "2024-10-15"
CTX         = ssl.create_default_context()

# FY window — only keep campaigns sent within these months.
MONTH_KEYS = [
    "2025-07","2025-08","2025-09","2025-10","2025-11","2025-12",
    "2026-01","2026-02","2026-03","2026-04","2026-05","2026-06",
]
WINDOW_START = MONTH_KEYS[0] + "-01T00:00:00+00:00"

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

# ── Supabase (REST + Storage) via urllib, mirroring sync_instagram_media.py ──
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

def public_url(path):
    return f"{URL}/storage/v1/object/public/{BUCKET}/{path}"

def cache_image(src, path, ctype):
    try:
        img = urllib.request.urlopen(src, context=CTX, timeout=30).read()
    except Exception:
        return None
    st, _ = sb("POST", f"/storage/v1/object/{BUCKET}/{path}", img, ctype=ctype, extra={"x-upsert": "true"})
    return public_url(path) if st in (200, 201) else None

def existing(brand_id):
    st, b = sb("GET", f"/rest/v1/edm_campaigns?brand_id=eq.{brand_id}&select=campaign_id,image_url", ctype=None)
    if st != 200:
        return {}
    return {r["campaign_id"]: r.get("image_url") for r in json.loads(b.decode() or "[]")}

def upsert(rows):
    if not rows:
        return
    sb("POST", "/rest/v1/edm_campaigns?on_conflict=brand_id,campaign_id",
       json.dumps(rows).encode(), extra={"Prefer": "resolution=merge-duplicates"})

# ── Klaviyo ──────────────────────────────────────────────────────────────────
def kv(api_key, url, _tries=6):
    headers = {"Authorization": f"Klaviyo-API-Key {api_key}", "revision": REVISION, "Accept": "application/json"}
    for attempt in range(_tries):
        r = urllib.request.Request(url, headers=headers, method="GET")
        try:
            with urllib.request.urlopen(r, context=CTX, timeout=30) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < _tries - 1:
                wait = float(e.headers.get("Retry-After", 0)) or (2 ** attempt)
                time.sleep(min(wait, 30)); continue
            raise

def list_email_campaigns(api_key):
    """All email campaigns sent within the FY window, newest first."""
    flt = urllib.parse.quote(f'and(equals(messages.channel,"email"),greater-or-equal(scheduled_at,{WINDOW_START}))', safe="")
    url = f"https://a.klaviyo.com/api/campaigns/?filter={flt}&sort=-scheduled_at&page%5Bsize%5D=50"
    out = []
    while url:
        data = kv(api_key, url)
        out.extend(data.get("data", []))
        url = (data.get("links") or {}).get("next")
    return out

# Pull the campaign's first message + its template HTML to find a hero image and subject.
IMG_RE = re.compile(r'<img\b[^>]*?\bsrc=["\']([^"\']+)["\']', re.I)

def message_creative(api_key, campaign_id):
    subject, html = None, None
    try:
        msgs = kv(api_key, f"https://a.klaviyo.com/api/campaigns/{campaign_id}/campaign-messages/?include=template")
    except Exception:
        return subject, None
    data = (msgs.get("data") or [])
    if data:
        defn = (data[0].get("attributes") or {}).get("definition") or {}
        content = defn.get("content") or {}
        subject = content.get("subject")
    for inc in (msgs.get("included") or []):
        if inc.get("type") == "template":
            html = (inc.get("attributes") or {}).get("html")
            break
    return subject, html

def hero_image(html):
    """First plausible content image: http(s), not a 1px tracking pixel/spacer."""
    if not html:
        return None
    for m in IMG_RE.finditer(html):
        src = m.group(1).strip()
        if not src.lower().startswith("http"):
            continue
        low = src.lower()
        if "spacer" in low or "1x1" in low or "/o/" in low or low.endswith(".gif"):
            continue
        return src
    return None

def ctype_for(src):
    low = src.lower().split("?")[0]
    if low.endswith(".png"): return "image/png"
    if low.endswith(".webp"): return "image/webp"
    return "image/jpeg"

def sync_brand(api_key, brand, brand_id):
    if not api_key:
        print(f"  ↷ {brand.get('name')}: no klaviyoApiKey, skipping"); return
    print(f"  → {brand['name']}")
    try:
        campaigns = list_email_campaigns(api_key)
    except Exception as e:
        print(f"    Error listing campaigns: {e}"); return
    have = existing(brand_id)
    rows, cached = [], 0
    for c in campaigns:
        cid = c["id"]
        attrs = c.get("attributes") or {}
        sent_at = attrs.get("send_time") or attrs.get("scheduled_at")
        if not sent_at:
            continue
        mk = sent_at[:7]
        if mk not in MONTH_KEYS:
            continue
        subject, html = message_creative(api_key, cid)
        img_url = have.get(cid)
        if not img_url:  # cache the hero image once
            src = hero_image(html)
            if src:
                img_url = cache_image(src, f"{brand_id}/{cid}.jpg", ctype_for(src))
                if img_url:
                    cached += 1
        rows.append({
            "brand_id": brand_id, "campaign_id": cid, "month_key": mk,
            "name": (attrs.get("name") or "")[:300], "subject": (subject or "")[:300],
            "sent_at": sent_at, "image_url": img_url, "web_url": None,
        })
        time.sleep(0.1)
    upsert(rows)
    print(f"    {len(rows)} campaigns ({cached} new thumbnails cached)")

def main():
    if not URL or not KEY:
        print("Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)"); sys.exit(1)
    with open(CONFIG_PATH) as f:
        config = json.load(f)
    ensure_bucket()
    for i, brand in enumerate(config.get("brands", [])):
        api_key = brand.get("klaviyoApiKey") or config.get("klaviyoApiKey")
        try:
            sync_brand(api_key, brand, i)
        except Exception as e:
            print(f"  ERROR {brand.get('name')}: {e}")
    print("\nDone.")

if __name__ == "__main__":
    main()
