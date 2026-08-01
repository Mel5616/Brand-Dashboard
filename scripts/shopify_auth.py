"""Shopify auth helper for sync scripts.

Newer dev-dashboard apps don't expose a permanent Admin token — instead the
client ID + secret mint short-lived (24h) tokens on demand via the OAuth
client-credentials grant. Brands with shopifyClientId/shopifyClientSecret in
stores.config.json get a freshly minted token (cached per run); everyone else
falls back to the legacy static token.
"""
import json
import ssl
import urllib.request

_CTX = ssl.create_default_context()
_CACHE = {}


def store_token(brand):
    cid, secret = brand.get("shopifyClientId"), brand.get("shopifyClientSecret")
    if not (cid and secret):
        return brand.get("token")
    key = brand.get("domain")
    if key in _CACHE:
        return _CACHE[key]
    body = json.dumps({"client_id": cid, "client_secret": secret, "grant_type": "client_credentials"}).encode()
    req = urllib.request.Request(f"https://{brand['domain']}/admin/oauth/access_token", data=body, method="POST")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, context=_CTX, timeout=30) as r:
            tok = json.loads(r.read().decode()).get("access_token")
        if tok:
            _CACHE[key] = tok
            return tok
    except Exception as e:
        print(f"  ⚠ token mint failed for {brand.get('name')}: {e} — using static token")
    return brand.get("token")
