#!/usr/bin/env python3
"""Mirror AU-cleared Filecamp assets into the public "email-assets" Supabase
Storage bucket, and record each one in email_asset_map — the "approved asset
map" from the Email Engine build brief §11.

Filecamp has no public REST API (confirmed with their own support docs), but
does expose the library over WebDAV. This script walks specific approved
folders per brand (never the whole library — an unreviewed folder is not an
approved folder) and:
  1. Downloads the full-res source from Filecamp via WebDAV.
  2. Resizes to a sane email width (max 1200px, matching the brief's "1200px
     wide for a 600px email" guidance) and re-compresses, since Filecamp's
     originals are print-resolution (tens of MB) and the brief caps total
     email weight at 800KB.
  3. Uploads the result to Supabase Storage and upserts the mapping row.

Only smarTrike Wonder is wired up in v1 — FOLDERS below is intentionally
brand-specific and small; add entries here (not a blind full-library sync)
when the next brand's Email Engine work starts, so "approved" stays true.
"""
import io
import json
import os
import re
import ssl
import sys
import urllib.parse
import urllib.request

from PIL import Image

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CTX = ssl.create_default_context()
BUCKET = "email-assets"
MAX_WIDTH = 1200
JPEG_QUALITY = 78


def load_env():
    p = os.path.join(BASE_DIR, ".env.local")
    if not os.path.exists(p):
        return
    with open(p) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            if k.strip() not in os.environ:
                os.environ[k.strip()] = v.strip().strip('"').strip("'")


load_env()

SB_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SB_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
FC_HOST = os.environ.get("FILECAMP_WEBDAV_HOST", "")
FC_PORT = os.environ.get("FILECAMP_WEBDAV_PORT", "8444")
FC_USER = os.environ.get("FILECAMP_WEBDAV_USER", "")
FC_PASS = os.environ.get("FILECAMP_WEBDAV_PASS", "")

# brand_id (matches Supabase brands.id) -> list of (Filecamp folder, category, product|None)
FOLDERS = {
    12: [  # SmarTrike
        ("SmarTrike/4. Product Images/Wonder", "product", "wonder"),
        ("SmarTrike/4. Product Images/Wonder Max", "product", "wonder-max"),
        ("SmarTrike/5. Lifestyle Images/Wonder", "lifestyle", "wonder"),
        ("SmarTrike/5. Lifestyle Images/Wonder Max", "lifestyle", "wonder-max"),
        ("SmarTrike/3. Logo", "logo", None),
    ],
}


def sb(method, path, data=None, ctype="application/json", extra=None):
    req = urllib.request.Request(f"{SB_URL}{path}", data=data, method=method)
    req.add_header("Authorization", f"Bearer {SB_KEY}")
    req.add_header("apikey", SB_KEY)
    if ctype:
        req.add_header("Content-Type", ctype)
    for k, v in (extra or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, context=CTX, timeout=60) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def ensure_bucket():
    sb("POST", "/storage/v1/bucket", json.dumps({"id": BUCKET, "name": BUCKET, "public": True}).encode())


def webdav_list(path):
    """One level of PROPFIND — returns [(href, is_dir)], excluding the folder itself."""
    url = f"https://{FC_HOST}:{FC_PORT}/{urllib.parse.quote(path)}/"
    req = urllib.request.Request(url, method="PROPFIND")
    req.add_header("Depth", "1")
    auth = f"{FC_USER}:{FC_PASS}".encode()
    import base64
    req.add_header("Authorization", "Basic " + base64.b64encode(auth).decode())
    with urllib.request.urlopen(req, context=CTX, timeout=40) as r:
        xml = r.read().decode()
    hrefs = re.findall(r"<[Dd]:href>([^<]+)</[Dd]:href>", xml)
    self_path = urllib.parse.urlparse(url).path
    out = []
    for h in hrefs:
        if h.rstrip("/") == self_path.rstrip("/"):
            continue
        is_dir = h.endswith("/")
        out.append((urllib.parse.unquote(h), is_dir))
    return out


def webdav_get(href):
    url = f"https://{FC_HOST}:{FC_PORT}{urllib.parse.quote(href, safe='/')}"
    req = urllib.request.Request(url)
    auth = f"{FC_USER}:{FC_PASS}".encode()
    import base64
    req.add_header("Authorization", "Basic " + base64.b64encode(auth).decode())
    with urllib.request.urlopen(req, context=CTX, timeout=60) as r:
        return r.read()


def slugify(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def is_image(href):
    return re.search(r"\.(jpe?g|png)$", href, re.I) and ".filecamp" not in href


def collect_images(folder):
    """(href, name_hint) pairs — one level of colourway subfolders is
    expected under Product Images (e.g. Wonder/Moonlight/*.png); Lifestyle
    Images are flat. name_hint carries the colourway when nested, else None."""
    entries = webdav_list(folder)
    out = []
    for href, is_dir in entries:
        if is_dir:
            sub_name = os.path.basename(href.rstrip("/"))
            for sub_href, sub_is_dir in webdav_list(f"{folder}/{sub_name}"):
                if not sub_is_dir and is_image(sub_href):
                    out.append((sub_href, sub_name))
        elif is_image(href):
            out.append((href, None))
    return out


def main():
    if not (SB_URL and SB_KEY and FC_HOST and FC_USER and FC_PASS):
        print("Missing Supabase or Filecamp env — see .env.local")
        sys.exit(1)
    ensure_bucket()

    for brand_id, folders in FOLDERS.items():
        for folder, category, product in folders:
            print(f"⟳  {folder}", flush=True)
            try:
                files = collect_images(folder)
            except Exception as e:
                print(f"   ✗ list failed: {e}")
                continue
            files.sort(key=lambda x: x[0])
            seen = {}
            for href, colourway in files:
                fname = os.path.basename(href)
                # e.g. "5800501_Wonder  Moonlight_Stage 1.png" -> tag "stage-1"
                stem = os.path.splitext(fname)[0]
                tag = slugify(stem.split("_")[-1]) or "img"
                base = f"{product}-{category}" if product else category
                if colourway:
                    base = f"{base}-{slugify(colourway)}"
                base = f"{base}-{tag}"
                seen[base] = seen.get(base, 0) + 1
                image_ref = base if seen[base] == 1 else f"{base}-{seen[base]}"
                # Logos (and anything else with real transparency) must stay PNG —
                # flattening to JPEG bakes in a white/black box behind the mark.
                keep_alpha = category == "logo"
                try:
                    raw = webdav_get(href)
                    im = Image.open(io.BytesIO(raw))
                    has_alpha = im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info)
                    if keep_alpha and has_alpha:
                        im = im.convert("RGBA")
                    elif has_alpha:
                        # Flattening straight to RGB fills transparent areas BLACK —
                        # product/lifestyle shots need a white backing to match the
                        # white card background they sit on in the email.
                        bg = Image.new("RGB", im.size, (255, 255, 255))
                        bg.paste(im.convert("RGBA"), mask=im.convert("RGBA").split()[3])
                        im = bg
                    else:
                        im = im.convert("RGB")
                    cap = 600 if category == "logo" else MAX_WIDTH
                    if im.width > cap:
                        h = int(im.height * (cap / im.width))
                        im = im.resize((cap, h), Image.LANCZOS)
                    out = io.BytesIO()
                    if im.mode == "RGBA":
                        im.save(out, format="PNG", optimize=True)
                        ext, ctype = "png", "image/png"
                    else:
                        im.save(out, format="JPEG", quality=JPEG_QUALITY, optimize=True)
                        ext, ctype = "jpg", "image/jpeg"
                    payload = out.getvalue()
                except Exception as e:
                    print(f"   ✗ {fname}: {e}")
                    continue

                storage_path = f"{brand_id}/{image_ref}.{ext}"
                st, _ = sb("POST", f"/storage/v1/object/{BUCKET}/{storage_path}", payload, ctype=ctype, extra={"x-upsert": "true"})
                if st not in (200, 201):
                    print(f"   ✗ upload failed ({st}): {fname}")
                    continue
                public_url = f"{SB_URL}/storage/v1/object/public/{BUCKET}/{storage_path}"

                row = {
                    "brand_id": brand_id, "image_ref": image_ref, "category": category, "product": product,
                    "public_url": public_url, "source_path": f"/{folder}/{fname}",
                    "width": im.width, "height": im.height,
                }
                sb("POST", "/rest/v1/email_asset_map?on_conflict=brand_id,image_ref", json.dumps(row).encode(),
                   extra={"Prefer": "resolution=merge-duplicates,return=minimal"})
                print(f"   ✓ {image_ref}  ({len(payload)//1024}KB, {im.width}x{im.height}, {ext})")


if __name__ == "__main__":
    main()
