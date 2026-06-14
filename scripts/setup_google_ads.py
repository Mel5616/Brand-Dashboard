#!/usr/bin/env python3
"""
Brand Dashboard — Google Ads Setup
Gets OAuth2 credentials and Customer IDs for each brand.

Run: python3 scripts/setup_google_ads.py
"""

import json, ssl, urllib.request, urllib.parse, os, webbrowser, http.server, threading

BASE_DIR    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(BASE_DIR, 'stores.config.json')
CREDS_PATH  = os.path.join(BASE_DIR, 'google_ads_creds.json')

# OAuth callback server
_auth_code = None

class _Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        global _auth_code
        params = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        _auth_code = params.get('code', [None])[0]
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'<h2>Done! Return to your terminal.</h2><script>window.close()</script>')
    def log_message(self, *a): pass

def get_auth_code(client_id, redirect_uri):
    params = urllib.parse.urlencode({
        'client_id':     client_id,
        'redirect_uri':  redirect_uri,
        'response_type': 'code',
        'scope':         'https://www.googleapis.com/auth/adwords',
        'access_type':   'offline',
        'prompt':        'consent',
    })
    url = f'https://accounts.google.com/o/oauth2/auth?{params}'
    print(f'\n  Opening browser for Google login...')
    webbrowser.open(url)

    server = http.server.HTTPServer(('localhost', 8080), _Handler)
    t = threading.Thread(target=server.handle_request)
    t.start(); t.join(timeout=120)
    return _auth_code

def exchange_code(client_id, client_secret, code, redirect_uri):
    data = urllib.parse.urlencode({
        'code':          code,
        'client_id':     client_id,
        'client_secret': client_secret,
        'redirect_uri':  redirect_uri,
        'grant_type':    'authorization_code',
    }).encode()
    req = urllib.request.Request('https://oauth2.googleapis.com/token', data=data, method='POST')
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, context=ctx, timeout=15) as r:
        return json.loads(r.read().decode())

def test_customer(customer_id, developer_token, refresh_token, client_id, client_secret):
    """Test that we can access the given Google Ads customer."""
    # Get access token
    data = urllib.parse.urlencode({
        'refresh_token': refresh_token,
        'client_id':     client_id,
        'client_secret': client_secret,
        'grant_type':    'refresh_token',
    }).encode()
    req = urllib.request.Request('https://oauth2.googleapis.com/token', data=data, method='POST')
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, context=ctx, timeout=15) as r:
        tokens = json.loads(r.read().decode())
    access_token = tokens['access_token']

    # Clean customer ID (remove dashes)
    cid = customer_id.replace('-', '').replace(' ', '')
    query = json.dumps({'query': 'SELECT customer.id, customer.descriptive_name FROM customer LIMIT 1'})
    url = f'https://googleads.googleapis.com/v20/customers/{cid}/googleAds:search'
    req = urllib.request.Request(url, data=query.encode(), method='POST')
    req.add_header('Authorization', f'Bearer {access_token}')
    req.add_header('developer-token', developer_token)
    req.add_header('Content-Type', 'application/json')
    req.add_header('login-customer-id', '8923727576')  # MCC ID
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=15) as r:
            result = json.loads(r.read().decode())
        name = result.get('results', [{}])[0].get('customer', {}).get('descriptiveName', 'Unknown')
        return True, name
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        try:
            err = json.loads(body)
            msg = err.get('error', {}).get('message', str(e))
        except Exception:
            msg = f'HTTP {e.code}: {body[:200] or str(e)}'
        return False, msg
    except Exception as e:
        return False, str(e)

def main():
    print('\n⚡ Brand Dashboard — Google Ads Setup\n')
    print('You need 3 things:')
    print('  1. Developer Token  — from Google Ads → Tools → API Center')
    print('  2. OAuth Client ID & Secret — from Google Cloud Console')
    print('  3. Customer IDs     — the XXX-XXX-XXXX number for each brand in Google Ads\n')
    print('HOW TO GET YOUR DEVELOPER TOKEN:')
    print('  • In any Google Ads account → Tools (wrench icon) → Setup → API Center')
    print('  • Copy the Developer token shown there\n')
    print('HOW TO GET OAUTH CREDENTIALS:')
    print('  • Go to console.cloud.google.com → Select/create a project')
    print('  • APIs & Services → Enable APIs → search "Google Ads API" → Enable')
    print('  • Credentials → Create Credentials → OAuth Client ID')
    print('  • Application type: Desktop app → Create')
    print('  • Copy the Client ID and Client Secret\n')
    print('─' * 60)

    # Load or create creds file
    creds = {}
    if os.path.exists(CREDS_PATH):
        creds = json.loads(open(CREDS_PATH).read())
        print(f'\nExisting credentials found at google_ads_creds.json')

    # Developer token
    existing_dt = creds.get('developerToken', '')
    if existing_dt:
        change = input(f'Developer token already saved. Change it? [y/N]: ').strip().lower()
        if change != 'y':
            developer_token = existing_dt
        else:
            developer_token = input('Developer Token: ').strip()
    else:
        developer_token = input('\nDeveloper Token: ').strip()

    # OAuth credentials
    existing_cid = creds.get('clientId', '')
    if existing_cid:
        change = input(f'OAuth Client ID already saved ({existing_cid[:20]}...). Change it? [y/N]: ').strip().lower()
        if change != 'y':
            client_id     = existing_cid
            client_secret = creds.get('clientSecret', '')
            refresh_token = creds.get('refreshToken', '')
        else:
            existing_cid = ''

    if not existing_cid:
        client_id     = input('OAuth Client ID: ').strip()
        client_secret = input('OAuth Client Secret: ').strip()
        refresh_token = ''

    # OAuth flow if we don't have a refresh token
    if not refresh_token:
        redirect_uri = 'http://localhost:8080'
        code = get_auth_code(client_id, redirect_uri)
        if not code:
            print('  ✗ No auth code received. Make sure localhost:8080 is in your OAuth redirect URIs.')
            return
        print('  ✓ Auth code received. Exchanging for tokens...')
        tokens = exchange_code(client_id, client_secret, code, redirect_uri)
        if 'error' in tokens:
            print(f'  ✗ Token exchange failed: {tokens}')
            return
        refresh_token = tokens.get('refresh_token', '')
        print(f'  ✓ Refresh token obtained')

    # Save global creds
    creds.update({'developerToken': developer_token, 'clientId': client_id, 'clientSecret': client_secret, 'refreshToken': refresh_token})
    with open(CREDS_PATH, 'w') as f:
        json.dump(creds, f, indent=2)
    print(f'  ✓ Credentials saved to google_ads_creds.json')

    # Per-brand Customer IDs
    print('\n─' * 60)
    print('\nNow enter the Google Ads Customer ID for each brand.')
    print('Find it in Google Ads — shown at the top right as XXX-XXX-XXXX\n')

    config = json.loads(open(CONFIG_PATH).read())
    updated = 0

    for brand in config['brands']:
        name     = brand['name']
        existing = brand.get('googleAdsCustomerId', '')
        print(f'\n→ {name}')
        if existing:
            skip = input(f'  Already set ({existing}). Skip? [Y/n]: ').strip().lower()
            if skip != 'n':
                print('  ⏭  Skipped')
                continue

        cid = input(f'  Customer ID (leave blank to skip): ').strip().replace('-', '').replace(' ', '')
        if not cid:
            print('  ⏭  Skipped')
            continue

        print(f'  Testing connection...')
        ok, msg = test_customer(cid, developer_token, refresh_token, client_id, client_secret)
        if ok:
            print(f'  ✓ Connected: {msg}')
            brand['googleAdsCustomerId'] = cid
            with open(CONFIG_PATH, 'w') as f:
                json.dump(config, f, indent=2)
            updated += 1
        else:
            print(f'  ✗ Error: {msg}')
            save = input('  Save anyway? [y/N]: ').strip().lower()
            if save == 'y':
                brand['googleAdsCustomerId'] = cid
                with open(CONFIG_PATH, 'w') as f:
                    json.dump(config, f, indent=2)
                updated += 1

    print(f'\n✅ Done — {updated} brand(s) configured.')
    print('   Run python3 scripts/sync.py to pull Google Ads data.\n')

if __name__ == '__main__':
    main()
