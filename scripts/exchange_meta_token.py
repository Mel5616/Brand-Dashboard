#!/usr/bin/env python3
"""
Exchange a short-lived Meta token for a 60-day long-lived token,
then save it directly to stores.config.json.

Usage:
  1. Go to developers.facebook.com/tools/explorer
  2. Select CK Dashboard, generate a short-lived token with all permissions:
       ads_read, business_management, pages_show_list, pages_read_engagement,
       instagram_basic, instagram_manage_insights
  3. Run:  python3 scripts/exchange_meta_token.py <SHORT_LIVED_TOKEN>
"""

import sys, json, ssl, urllib.request, urllib.parse, os
from datetime import date, timedelta

BASE_DIR    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(BASE_DIR, 'stores.config.json')

APP_ID     = "1033446446030115"
APP_SECRET = "6f73f8f64447eec87cc86f2a6cb934a9"

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    short_token = sys.argv[1].strip()

    print("Exchanging token...", flush=True)
    url = (
        f"https://graph.facebook.com/oauth/access_token"
        f"?grant_type=fb_exchange_token"
        f"&client_id={APP_ID}"
        f"&client_secret={APP_SECRET}"
        f"&fb_exchange_token={urllib.parse.quote(short_token)}"
    )
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(url, context=ctx, timeout=15) as r:
            data = json.loads(r.read())
    except urllib.error.HTTPError as e:
        print(f"✗  Exchange failed: {e.read().decode()[:300]}")
        sys.exit(1)

    long_token  = data.get("access_token", "")
    expires_sec = data.get("expires_in", 0)
    expires_days = expires_sec // 86400
    expires_on   = (date.today() + timedelta(days=expires_days)).strftime("%Y-%m-%d")

    if not long_token:
        print("✗  No token in response:", data)
        sys.exit(1)

    # Verify permissions
    verify_url = f"https://graph.facebook.com/v20.0/me/permissions?access_token={long_token}"
    with urllib.request.urlopen(verify_url, context=ctx, timeout=15) as r:
        perms_data = json.loads(r.read())
    granted = [p["permission"] for p in perms_data.get("data", []) if p["status"] == "granted"]
    print(f"✓  Permissions: {', '.join(granted)}")

    required = {"ads_read", "instagram_basic", "instagram_manage_insights"}
    missing  = required - set(granted)
    if missing:
        print(f"⚠️  Missing permissions: {', '.join(missing)}")
        print("   Regenerate the token with all required permissions and try again.")
        sys.exit(1)

    # Save to config
    with open(CONFIG_PATH) as f:
        config = json.load(f)
    config["metaAccessToken"] = long_token
    with open(CONFIG_PATH, "w") as f:
        json.dump(config, f, indent=2)

    print(f"✓  Token saved to stores.config.json")
    print(f"✓  Expires in {expires_days} days ({expires_on})")
    print(f"\nNext steps:")
    print(f"  python3 scripts/sync_meta.py")
    print(f"  python3 scripts/sync_instagram.py")

if __name__ == "__main__":
    main()
