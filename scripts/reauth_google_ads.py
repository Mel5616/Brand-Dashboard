#!/usr/bin/env python3
"""
One-shot Google Ads OAuth refresh — reuses the existing developer token,
client ID and client secret already in google_ads_creds.json, and only
redoes the browser login to get a fresh refresh token. Use this instead
of the full setup_google_ads.py wizard when only the refresh token has
expired/been revoked (the wizard silently skips the login step if you
answer "no" to changing the OAuth Client ID).

Run: python3 scripts/reauth_google_ads.py
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from setup_google_ads import get_auth_code, exchange_code, CREDS_PATH

creds = json.loads(open(CREDS_PATH).read())
client_id = creds['clientId']
client_secret = creds['clientSecret']
redirect_uri = 'http://localhost:8080'

print('Opening browser — log in with the Google account that manages the Coolkidz AU MCC, then click Allow.')
code = get_auth_code(client_id, redirect_uri)
if not code:
    print('✗ No auth code received (login window may have been closed or timed out).')
    sys.exit(1)

tokens = exchange_code(client_id, client_secret, code, redirect_uri)
if 'error' in tokens or 'refresh_token' not in tokens:
    print(f'✗ Token exchange failed: {tokens}')
    sys.exit(1)

creds['refreshToken'] = tokens['refresh_token']
with open(CREDS_PATH, 'w') as f:
    json.dump(creds, f, indent=2)
print('✓ New refresh token saved to google_ads_creds.json')
