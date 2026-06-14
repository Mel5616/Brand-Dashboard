#!/usr/bin/env python3
"""
Instagram Setup — discovers Instagram Business Accounts connected to your Facebook Pages
and shows you which brands to map them to in stores.config.json.

Before running this you must regenerate your Meta token with these additional permissions:
  instagram_basic  +  read_insights  +  pages_show_list  +  pages_read_engagement

Steps:
  1. Go to developers.facebook.com/tools/explorer
  2. Select app: CK Dashboard
  3. Click "Generate Access Token"
  4. Add these permissions (in addition to the existing ads_read, business_management):
       instagram_basic
       read_insights
       pages_show_list
       pages_read_engagement
  5. Click "Generate Access Token" and accept
  6. Exchange it for a long-lived token:
       python3 scripts/exchange_meta_token.py <SHORT_LIVED_TOKEN>
  7. Copy the new token into stores.config.json as "metaAccessToken"
  8. Run this script:  python3 scripts/setup_instagram.py

Usage: python3 scripts/setup_instagram.py
"""

import json, ssl, urllib.request, urllib.parse, os, sys

BASE_DIR    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(BASE_DIR, 'stores.config.json')
ENV_PATH    = os.path.join(BASE_DIR, '.env.local')
API         = "https://graph.facebook.com/v20.0"

def load_env():
    if not os.path.exists(ENV_PATH):
        return
    with open(ENV_PATH) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            k, _, v = line.partition('=')
            if k.strip() not in os.environ:
                os.environ[k.strip()] = v.strip().strip('"').strip("'")
load_env()

def get(path, params):
    url = f"{API}/{path}?{urllib.parse.urlencode(params)}"
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(url, context=ctx, timeout=15) as r:
        return json.loads(r.read().decode())

def paginate(path, params):
    items, resp = [], get(path, params)
    items.extend(resp.get("data", []))
    while resp.get("paging", {}).get("next"):
        with urllib.request.urlopen(resp["paging"]["next"], context=ssl.create_default_context(), timeout=15) as r:
            resp = json.loads(r.read().decode())
        items.extend(resp.get("data", []))
    return items

def main():
    with open(CONFIG_PATH) as f:
        config = json.load(f)

    token = config.get("metaAccessToken")
    if not token:
        print("✗  No metaAccessToken in stores.config.json")
        sys.exit(1)

    print("Fetching Facebook Pages...\n")
    try:
        pages = paginate("me/accounts", {"fields": "id,name,instagram_business_account{id,name,username,followers_count}", "access_token": token})
    except Exception as e:
        print(f"✗  {e}")
        print("\nDoes your token have pages_show_list permission?")
        print("Regenerate via developers.facebook.com/tools/explorer with:")
        print("  ads_read + business_management + instagram_basic + read_insights + pages_show_list + pages_read_engagement")
        sys.exit(1)

    print(f"{'Page Name':<40}  {'Instagram Account':<30}  {'Username':<25}  Followers")
    print("-" * 115)

    ig_accounts = []
    for page in sorted(pages, key=lambda p: p.get("name", "")):
        ig = page.get("instagram_business_account")
        if ig:
            print(f"  {page.get('name',''):<38}  {ig.get('name',''):<28}  @{ig.get('username',''):<23}  {ig.get('followers_count', 'n/a')}")
            ig_accounts.append({
                "page_name": page.get("name"),
                "ig_id":     ig.get("id"),
                "ig_name":   ig.get("name"),
                "username":  ig.get("username"),
                "followers": ig.get("followers_count"),
            })
        else:
            print(f"  {page.get('name',''):<38}  — no Instagram account connected")

    print(f"\n{len(ig_accounts)} Instagram Business Accounts found\n")

    brands = config.get("brands", [])
    print("Your brands (current instagramAccountId):")
    for b in brands:
        existing = b.get("instagramAccountId", "")
        tag = f"  ← {existing}" if existing else "  ← not set"
        print(f"  [{b['id']:>2}] {b['name']:<25}{tag}")

    print("""
To map brands to Instagram accounts, tell Claude:
  "Nanit Instagram = <ig_id>, Magic Instagram = <ig_id>, ..."

Or add instagramAccountId to each brand in stores.config.json manually:
  "instagramAccountId": "<ig_id from above>"

Then run:  python3 scripts/sync_instagram.py
""")

if __name__ == "__main__":
    main()
