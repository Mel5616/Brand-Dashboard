#!/usr/bin/env python3
"""
One-time Pinterest OAuth helper.

Prereqs (in the app console at developers.pinterest.com/apps → app 1587816):
  1. The app must have API access (trial or standard) approved.
  2. Add  http://localhost:8085/callback  as a Redirect URI.
  3. Put the App ID + App secret in stores.config.json:
       "pinterestAppId": "1587816",
       "pinterestAppSecret": "..."

Run:  python3 scripts/pinterest_oauth.py
It prints an authorize URL — open it, log in / click Allow, and the script
captures the code, exchanges it, and prints the access + refresh tokens to
paste into stores.config.json ("pinterestAccessToken", "pinterestRefreshToken").
The refresh token lasts ~a year; sync_pinterest.py auto-refreshes with it.
"""

import base64, json, os, ssl, urllib.parse, urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG   = json.load(open(os.path.join(BASE_DIR, "stores.config.json")))
APP_ID   = CONFIG.get("pinterestAppId") or "1587816"
SECRET   = CONFIG.get("pinterestAppSecret")
REDIRECT = "http://localhost:8085/callback"
SCOPES   = "ads:read,user_accounts:read"

if not SECRET:
    raise SystemExit('✗ Add "pinterestAppSecret" to stores.config.json first (app console → App secret).')

auth_url = "https://www.pinterest.com/oauth/?" + urllib.parse.urlencode({
    "client_id": APP_ID, "redirect_uri": REDIRECT, "response_type": "code", "scope": SCOPES,
})
print("\nOpen this URL, log in to Pinterest and click Allow:\n\n  " + auth_url + "\n\nWaiting on http://localhost:8085 ...")

code_holder = {}

class H(BaseHTTPRequestHandler):
    def do_GET(self):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        code_holder["code"] = (q.get("code") or [None])[0]
        self.send_response(200); self.send_header("Content-Type", "text/html"); self.end_headers()
        self.wfile.write(b"<h2>Done - you can close this tab and go back to the terminal.</h2>")
    def log_message(self, *a): pass

srv = HTTPServer(("localhost", 8085), H)
while not code_holder.get("code"):
    srv.handle_request()

body = urllib.parse.urlencode({
    "grant_type": "authorization_code", "code": code_holder["code"], "redirect_uri": REDIRECT,
}).encode()
req = urllib.request.Request("https://api.pinterest.com/v5/oauth/token", data=body, method="POST")
req.add_header("Content-Type", "application/x-www-form-urlencoded")
req.add_header("Authorization", "Basic " + base64.b64encode(f"{APP_ID}:{SECRET}".encode()).decode())
with urllib.request.urlopen(req, context=ssl.create_default_context(), timeout=30) as r:
    tok = json.loads(r.read().decode())

print("\nPaste these into stores.config.json (top level):\n")
print(f'  "pinterestAccessToken": "{tok.get("access_token")}",')
print(f'  "pinterestRefreshToken": "{tok.get("refresh_token")}",')
print("\n(then update the STORES_CONFIG_JSON GitHub secret so Actions gets them too)")
