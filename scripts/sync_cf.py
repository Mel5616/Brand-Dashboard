#!/usr/bin/env python3
"""
Commission Factory (affiliate) sync.

Pulls merchant transactions per brand and writes:
  * commission_factory              — monthly rollup, split by status
  * commission_factory_transactions — raw rows (top affiliates, coupon performance)

Setup: add each brand's own CF merchant API key to stores.config.json:
    "commissionFactoryApiKey": "..."
Generate it in Commission Factory: profile menu → Profile and preferences →
Apps and API keys → Generate API Key. The account identifies the brand, so no
per-item brand mapping is needed.

Two things this deliberately gets right:
  * CF seeds every new account with a "Test Transaction" from its own test
    affiliate. Those are skipped — otherwise a brand-new program looks like it
    has sales.
  * The true affiliate cost is Commission + OverrideFee (CF's platform fee sits
    on top of the affiliate's commission). Commission alone understates it.

Run: python3 scripts/sync_cf.py
"""

import json, ssl, urllib.request, urllib.parse, urllib.error, os
from collections import defaultdict
from datetime import date as _date, timedelta as _timedelta

BASE_DIR    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(BASE_DIR, 'stores.config.json')
ENV_PATH    = os.path.join(BASE_DIR, '.env.local')

API_URL = "https://api.commissionfactory.com/V1/Merchant/Transactions"
# Rolling ~18-month window. The API's max range isn't documented, so page through
# in 90-day windows (same defensive approach as the Pinterest sync).
START = _date.today() - _timedelta(days=550)
TODAY = _date.today()

def load_env():
    if not os.path.exists(ENV_PATH):
        return
    with open(ENV_PATH) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            k, _, v = line.partition('=')
            k = k.strip(); v = v.strip().strip('"').strip("'")
            if k not in os.environ:
                os.environ[k] = v

load_env()

SUPABASE_URL      = os.environ.get('NEXT_PUBLIC_SUPABASE_URL', '')
SUPABASE_SVC_KEY  = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
SUPABASE_ANON_KEY = os.environ.get('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')

def _sb(method, path, body=None, prefer=None):
    if not SUPABASE_URL or not SUPABASE_SVC_KEY:
        return None
    req = urllib.request.Request(f'{SUPABASE_URL}/rest/v1/{path}',
                                 data=json.dumps(body).encode() if body is not None else None,
                                 method=method)
    req.add_header('Authorization', f'Bearer {SUPABASE_SVC_KEY}')
    req.add_header('apikey', SUPABASE_ANON_KEY or SUPABASE_SVC_KEY)
    if body is not None:
        req.add_header('Content-Type', 'application/json')
    if prefer:
        req.add_header('Prefer', prefer)
    try:
        with urllib.request.urlopen(req, context=ssl.create_default_context(), timeout=30) as r:
            return r.status
    except urllib.error.HTTPError as e:
        print(f'  ✗ Supabase {method} {path.split("?")[0]}: {e.code} {e.read().decode()[:200]}')

def sb_upsert(table, rows, on_conflict):
    if rows:
        _sb('POST', f'{table}?on_conflict={on_conflict}', rows, 'resolution=merge-duplicates')

def _windows(start, end, size=90):
    cur = start
    while cur <= end:
        stop = min(cur + _timedelta(days=size - 1), end)
        yield cur.isoformat(), stop.isoformat()
        cur = stop + _timedelta(days=1)

def fetch(api_key, since, until):
    params = {'apiKey': api_key, 'fromDate': since, 'toDate': until, 'dateProperty': 'DateCreated'}
    req = urllib.request.Request(f'{API_URL}?{urllib.parse.urlencode(params)}')
    req.add_header('Accept', 'application/json')
    with urllib.request.urlopen(req, context=ssl.create_default_context(), timeout=60) as r:
        data = json.loads(r.read().decode())
    return data if isinstance(data, list) else []

def is_test(t):
    """CF seeds new accounts with its own test transaction — never count it."""
    return (t.get('VoidReason') or '') == 'Test Transaction' \
        or 'test affiliate' in (t.get('AffiliateBusinessName') or '').lower()

def sync_brand(brand_id, name, api_key):
    print(f'  {name} ...', end=' ', flush=True)
    txns = []
    try:
        for since, until in _windows(START, TODAY):
            txns.extend(fetch(api_key, since, until))
    except (urllib.error.HTTPError, urllib.error.URLError) as e:
        body = ''
        try:
            if hasattr(e, 'read'): body = e.read().decode()[:250]
        except Exception:
            pass
        print(f'✗  {e} {body}')
        return f'{e} {body}'.strip()

    real = [t for t in txns if not is_test(t)]
    skipped = len(txns) - len(real)

    if not real:
        print(f'—  no real transactions ({skipped} test rows skipped)')
        return None

    # Raw rows
    raw = [{
        'id':           int(t['Id']),
        'brand_id':     brand_id,
        'date':         (t.get('DateCreated') or '')[:10],
        'status':       t.get('Status'),
        'sale_value':   round(float(t.get('SaleValue') or 0), 2),
        'commission':   round(float(t.get('Commission') or 0), 2),
        'override_fee': round(float(t.get('OverrideFee') or 0), 2),
        'affiliate':    t.get('AffiliateBusinessName') or t.get('AffiliateContactName'),
        'coupon':       (t.get('CouponCode') or None),
        'order_id':     t.get('OrderId'),
        'currency':     t.get('ReportedCurrencyCode'),
    } for t in real if t.get('Id') and (t.get('DateCreated') or '')[:10]]
    sb_upsert('commission_factory_transactions', raw, 'id')

    # Monthly rollup, split by status. Statuses change over time (Pending →
    # Approved), so clear this brand's rows for the window before reinserting,
    # otherwise a stale Pending row keeps its old totals forever.
    agg = defaultdict(lambda: {'transactions': 0, 'sale_value': 0.0, 'commission': 0.0, 'override_fee': 0.0})
    for r in raw:
        a = agg[(r['date'][:7], r['status'] or 'Unknown')]
        a['transactions'] += 1
        a['sale_value']   += r['sale_value']
        a['commission']   += r['commission']
        a['override_fee'] += r['override_fee']

    _sb('DELETE', f'commission_factory?brand_id=eq.{brand_id}&month_key=gte.{START.strftime("%Y-%m")}', None, 'return=minimal')
    rows = [{'brand_id': brand_id, 'month_key': mk, 'status': st,
             'transactions': a['transactions'],
             'sale_value': round(a['sale_value'], 2),
             'commission': round(a['commission'], 2),
             'override_fee': round(a['override_fee'], 2)}
            for (mk, st), a in sorted(agg.items())]
    sb_upsert('commission_factory', rows, 'brand_id,month_key,status')

    cost = sum(r['commission'] + r['override_fee'] for r in raw)
    sales = sum(r['sale_value'] for r in raw)
    print(f'✓  {len(raw)} txns, ${sales:,.0f} attributed, ${cost:,.2f} cost ({skipped} test rows skipped)')
    return None

def main():
    with open(CONFIG_PATH) as f:
        config = json.load(f)
    brands = [b for b in config.get('brands', [])
              if b.get('commissionFactoryApiKey') and not str(b['commissionFactoryApiKey']).startswith('PASTE_')]
    if not brands:
        print('✗  No brands have commissionFactoryApiKey set')
        return

    print(f'Syncing Commission Factory for {len(brands)} brand(s)...\n')
    errors = []
    for b in brands:
        err = sync_brand(b['id'], b['name'], b['commissionFactoryApiKey'])
        if err:
            errors.append(f"{b['name']}: {err}")
    from sync_status_util import record
    record('Commission Factory', not errors, '; '.join(errors))
    print('\nDone.')

if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        from sync_status_util import record
        record('Commission Factory', False, str(e)); raise
