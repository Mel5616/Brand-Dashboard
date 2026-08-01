#!/usr/bin/env python3
"""Customer LTV / repeat-purchase cohorts from Shopify order history.

For every brand store: pull paid orders (last ~30 months), group customers by
their first-order month (the cohort), then measure how much each cohort spent
in its first 90 and 365 days and how many came back. Upserts ltv_cohorts.

Run monthly (ltv.yml) — cohorts only shift when new orders land.
"""
import datetime as _dt
import json
import os
import ssl
import time
import urllib.request

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(BASE_DIR, 'stores.config.json')
ENV_PATH = os.path.join(BASE_DIR, '.env.local')

HISTORY_START = (_dt.date.today() - _dt.timedelta(days=30 * 30)).replace(day=1).isoformat()
API_VERSION = "2024-01"
CTX = ssl.create_default_context()


def load_env():
    if not os.path.exists(ENV_PATH):
        return
    with open(ENV_PATH) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            k, _, v = line.partition('=')
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


load_env()
SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL', '')
SVC_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
ANON_KEY = os.environ.get('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')


def sb_upsert(table, rows, on_conflict):
    if not rows:
        return
    req = urllib.request.Request(f'{SUPABASE_URL}/rest/v1/{table}?on_conflict={on_conflict}',
                                 data=json.dumps(rows).encode(), method='POST')
    req.add_header('Content-Type', 'application/json')
    req.add_header('Authorization', f'Bearer {SVC_KEY}')
    req.add_header('apikey', ANON_KEY or SVC_KEY)
    req.add_header('Prefer', 'resolution=merge-duplicates')
    with urllib.request.urlopen(req, context=CTX, timeout=60) as r:
        return r.status


def gql(domain, token, query):
    req = urllib.request.Request(f'https://{domain}/admin/api/{API_VERSION}/graphql.json',
                                 data=json.dumps({'query': query}).encode(), method='POST')
    req.add_header('Content-Type', 'application/json')
    req.add_header('X-Shopify-Access-Token', token)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, context=CTX, timeout=60) as r:
                d = json.loads(r.read().decode())
            if d.get('errors') and 'THROTTLED' in json.dumps(d['errors']):
                time.sleep(2 ** attempt)
                continue
            return d
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(2 ** attempt)
                continue
            raise
    return {}


def sync_brand(brand_id, name, domain, token):
    print(f'  {name} ...', end=' ', flush=True)
    customers = {}  # customer_id -> [(date, revenue_ex_gst)]
    cursor, pages = None, 0
    while pages < 400:
        after = f', after: "{cursor}"' if cursor else ''
        q = f'''{{ orders(first: 250{after}, query: "financial_status:paid created_at:>={HISTORY_START}", sortKey: CREATED_AT) {{
          edges {{ cursor node {{ createdAt sourceName customer {{ id }}
            totalPriceSet {{ shopMoney {{ amount }} }} totalTaxSet {{ shopMoney {{ amount }} }} }} }}
          pageInfo {{ hasNextPage }} }} }}'''
        d = gql(domain, token, q)
        if any('read_customers' in (e.get('message') or '') for e in d.get('errors') or []):
            raise RuntimeError('app missing read_customers scope — tick it in Shopify admin')
        data = (d.get('data') or {}).get('orders') or {}
        edges = data.get('edges', [])
        for e in edges:
            n = e['node']
            cid = (n.get('customer') or {}).get('id')
            if not cid:
                continue  # guest/POS without customer — can't cohort
            gross = float(n['totalPriceSet']['shopMoney']['amount'])
            tax = float((n.get('totalTaxSet') or {}).get('shopMoney', {}).get('amount', 0))
            rev = (gross - tax) if tax > 0 else gross / 1.1
            day = _dt.date.fromisoformat(n['createdAt'][:10])
            customers.setdefault(cid, []).append((day, rev))
        pages += 1
        if not data.get('pageInfo', {}).get('hasNextPage') or not edges:
            break
        cursor = edges[-1]['cursor']

    # Cohort rollup by first-order month
    cohorts = {}
    for orders in customers.values():
        orders.sort()
        first_day, first_rev = orders[0]
        ck = first_day.strftime('%Y-%m')
        c = cohorts.setdefault(ck, {'customers': 0, 'repeat_customers': 0, 'orders_total': 0,
                                    'revenue_first': 0.0, 'revenue_90d': 0.0, 'revenue_365d': 0.0})
        c['customers'] += 1
        c['orders_total'] += len(orders)
        if len(orders) > 1:
            c['repeat_customers'] += 1
        c['revenue_first'] += first_rev
        for day, rev in orders:
            delta = (day - first_day).days
            if delta <= 90:
                c['revenue_90d'] += rev
            if delta <= 365:
                c['revenue_365d'] += rev

    rows = [{'brand_id': brand_id, 'cohort_month': ck,
             'customers': c['customers'], 'repeat_customers': c['repeat_customers'],
             'orders_total': c['orders_total'],
             'revenue_first': round(c['revenue_first'], 2),
             'revenue_90d': round(c['revenue_90d'], 2),
             'revenue_365d': round(c['revenue_365d'], 2)}
            for ck, c in sorted(cohorts.items())]
    sb_upsert('ltv_cohorts', rows, 'brand_id,cohort_month')
    print(f'✓  {len(customers):,} customers, {len(rows)} cohorts ({pages}p)')


def main():
    with open(CONFIG_PATH) as f:
        config = json.load(f)
    from shopify_auth import store_token
    brands = [b for b in config.get('brands', []) if b.get('domain') and (b.get('token') or b.get('shopifyClientId'))]
    print(f'LTV cohorts for {len(brands)} store(s), history from {HISTORY_START}...')
    errors = []
    for b in brands:
        try:
            sync_brand(b['id'], b['name'], b['domain'], store_token(b))
        except Exception as e:
            print(f'✗  {e}')
            errors.append(f"{b['name']}: {e}")
    from sync_status_util import record
    record('LTV cohorts', not errors, '; '.join(str(x) for x in errors))
    print('Done.')


if __name__ == '__main__':
    main()
