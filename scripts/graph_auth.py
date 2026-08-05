"""Microsoft Graph auth helper — mints an app-only access token via the
client-credentials flow, using the Azure AD app registered for the dashboard
(stores.config.json → "graph": {tenantId, clientId, clientSecret}).
"""
from __future__ import annotations
import json
import ssl
import urllib.parse
import urllib.request

_CTX = ssl.create_default_context()
_cache = {"token": None}


def get_token(config: dict) -> str | None:
    g = config.get("graph") or {}
    tenant, cid, secret = g.get("tenantId"), g.get("clientId"), g.get("clientSecret")
    if not (tenant and cid and secret):
        return None
    if _cache["token"]:
        return _cache["token"]
    body = urllib.parse.urlencode({
        "client_id": cid, "client_secret": secret,
        "scope": "https://graph.microsoft.com/.default", "grant_type": "client_credentials",
    }).encode()
    req = urllib.request.Request(f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token", data=body, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    try:
        with urllib.request.urlopen(req, context=_CTX, timeout=30) as r:
            tok = json.loads(r.read().decode()).get("access_token")
        _cache["token"] = tok
        return tok
    except Exception as e:
        print(f"  ⚠ Graph token mint failed: {e}")
        return None


def graph_get(token: str, path: str):
    req = urllib.request.Request(f"https://graph.microsoft.com/v1.0{path}")
    req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req, context=_CTX, timeout=60) as r:
        return json.loads(r.read().decode())


def resolve_share(token: str, share_url: str):
    """Turn a SharePoint 'sharing link' into its driveItem (id + driveId)."""
    import base64
    b64 = base64.urlsafe_b64encode(share_url.encode()).decode().rstrip("=")
    share_id = "u!" + b64
    return graph_get(token, f"/shares/{share_id}/driveItem")
