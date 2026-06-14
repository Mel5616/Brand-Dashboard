#!/usr/bin/env python3
"""
Meta Ads Setup — lists all ad accounts accessible via your token
so you can match them to brands in stores.config.json.

Usage:
  1. Get a long-lived token:
       - business.facebook.com → Settings → Users → System Users
       - Create/select a System User → Generate Token
       - Permissions: ads_read + business_management
       - Copy the token

  2. Run:  python3 scripts/setup_meta.py <YOUR_TOKEN>
     (or set META_ACCESS_TOKEN in .env.local and run with no arg)
"""

import sys, json, ssl, urllib.request, urllib.parse, os

BASE_DIR    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(BASE_DIR, 'stores.config.json')
ENV_PATH    = os.path.join(BASE_DIR, '.env.local')

API = "https://graph.facebook.com/v20.0"

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

def get(path, params, token):
    params["access_token"] = token
    url = f"{API}/{path}?{urllib.parse.urlencode(params)}"
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(urllib.request.Request(url), context=ctx, timeout=15) as r:
        resp = json.loads(r.read().decode())
    if "error" in resp:
        raise SystemExit(f"Meta API error: {resp['error']['message']}")
    return resp

def paginate(path, params, token):
    items = []
    resp  = get(path, params, token)
    items.extend(resp.get("data", []))
    while resp.get("paging", {}).get("next"):
        with urllib.request.urlopen(resp["paging"]["next"], context=ssl.create_default_context(), timeout=15) as r:
            resp = json.loads(r.read().decode())
        items.extend(resp.get("data", []))
    return items

def main():
    token = (
        sys.argv[1] if len(sys.argv) > 1
        else os.environ.get("META_ACCESS_TOKEN")
        or open(CONFIG_PATH).read() and json.loads(open(CONFIG_PATH).read()).get("metaAccessToken")
    )
    if not token:
        print(__doc__)
        sys.exit(1)

    print("Fetching ad accounts...\n")
    try:
        accounts = paginate("me/adaccounts", {"fields": "id,name,account_status,currency"}, token)
    except urllib.error.HTTPError as e:
        raise SystemExit(f"HTTP {e.code}: {e.read().decode()[:300]}")

    STATUS = {1: "ACTIVE", 2: "DISABLED", 3: "UNSETTLED", 7: "PENDING_REVIEW",
              8: "PENDING_CLOSURE", 9: "IN_GRACE_PERIOD", 100: "TEMPORARILY_UNAVAILABLE",
              101: "CLOSED", 201: "ANY_ACTIVE", 202: "ANY_CLOSED"}

    active = [a for a in accounts if a.get("account_status") == 1]
    other  = [a for a in accounts if a.get("account_status") != 1]

    print(f"{'Account Name':<45}  {'Account ID':<20}  Status")
    print("-" * 80)
    for a in sorted(active, key=lambda x: x.get("name", "")):
        print(f"  {a.get('name',''):<43}  {a['id']:<20}  ACTIVE")
    for a in sorted(other, key=lambda x: x.get("name", "")):
        status = STATUS.get(a.get("account_status", 0), str(a.get("account_status")))
        print(f"  {a.get('name',''):<43}  {a['id']:<20}  {status}")

    print(f"\n{len(accounts)} total accounts ({len(active)} active)\n")

    # Also load brands for reference
    with open(CONFIG_PATH) as f:
        config = json.load(f)
    brands = config.get("brands", [])
    print("Your brands:")
    for b in brands:
        existing = b.get("metaAdAccountId", "")
        tag = f"  ← already set: {existing}" if existing else ""
        print(f"  [{b['id']:>2}] {b['name']}{tag}")

    print("""
Once you know which account belongs to which brand, tell Claude the mapping
(e.g. "Nanit = act_123456, Magic = act_789...") and it will update stores.config.json.

Or to save the token now, add this to stores.config.json at the top level:
  "metaAccessToken": "<token>"
""")

if __name__ == "__main__":
    main()
