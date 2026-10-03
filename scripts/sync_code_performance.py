#!/usr/bin/env python3
"""Discount code performance — what each code actually brought in.

For every brand store, reads the last ~120 days of paid, non-test orders that
used a discount code and rolls them up per (brand, code, month):
orders, net revenue (ex-GST), discount given (ex-GST), new customers, and an
ESTIMATED product cost.

The cost is an estimate on purpose: Shopify has no unit costs filled in, so
each line's SKU is matched (longest prefix) to a style code on the cost sheet
(cost_sheet_items.landed_cost_aud). qty_costed / qty_total is stored so the
dashboard can show how much of the order was actually costed and hide the
margin when coverage is too thin to trust.
"""
import datetime as _dt
import json
import os
import ssl
import sys
import time
import urllib.request
from collections import defaultdict

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(BASE_DIR, 'stores.config.json')
ENV_PATH = os.path.join(BASE_DIR, '.env.local')
API = "2024-10"
CTX = ssl.create_default_context()
WINDOW_DAYS = 120
GST = 1.1  # all stores trade in AUD, GST inclusive


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
URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL', '')
KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')


def sb(method, path, data=None, extra=None):
    req = urllib.request.Request(f'{URL}{path}', data=data, method=method)
    req.add_header('Authorization', f'Bearer {KEY}')
    req.add_header('apikey', KEY)
    if data is not None:
        req.add_header('Content-Type', 'application/json')
    for k, v in (extra or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, context=CTX, timeout=60) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def gql(domain, token, query):
    for attempt in range(5):
        req = urllib.request.Request(f'https://{domain}/admin/api/{API}/graphql.json',
                                     data=json.dumps({'query': query}).encode(), method='POST')
        req.add_header('Content-Type', 'application/json')
        req.add_header('X-Shopify-Access-Token', token)
        with urllib.request.urlopen(req, context=CTX, timeout=60) as r:
            d = json.loads(r.read().decode())
        if any('THROTTLED' in str(e) for e in (d.get('errors') or [])):
            time.sleep(2 + attempt * 2)
            continue
        return d
    return {}


def money(node):
    return float(((node or {}).get('shopMoney') or {}).get('amount') or 0)


def load_costs():
    """{brand_lower: [(style_code_upper, landed_cost_aud), ...]} longest code first."""
    st, body = sb('GET', '/rest/v1/cost_sheet_items?select=brand,style_code,landed_cost_aud&limit=5000')
    out = defaultdict(list)
    if st != 200:
        return out
    for r in json.loads(body):
        if r.get('style_code') and r.get('landed_cost_aud'):
            out[(r['brand'] or '').lower()].append((r['style_code'].upper(), float(r['landed_cost_aud'])))
    for k in out:
        out[k].sort(key=lambda x: -len(x[0]))
    return out


def unit_cost(costs, sku):
    s = (sku or '').upper()
    for code, c in costs:
        if s.startswith(code):
            return c
    return None


def sync_brand(brand, token, costs, since):
    agg = defaultdict(lambda: {'orders': 0, 'net_revenue': 0.0, 'discount_given': 0.0, 'new_customers': 0,
                               'est_cost': 0.0, 'qty_total': 0, 'qty_costed': 0})
    cursor = ''
    pages = 0
    while pages < 60:
        pages += 1
        after = f', after: "{cursor}"' if cursor else ''
        q = f'''{{ orders(first: 100, sortKey: CREATED_AT, query: "created_at:>={since} discount_code:* status:any"{after}) {{
          pageInfo {{ hasNextPage endCursor }}
          nodes {{
            createdAt cancelledAt test discountCodes
            totalPriceSet {{ shopMoney {{ amount }} }}
            totalTaxSet {{ shopMoney {{ amount }} }}
            totalShippingPriceSet {{ shopMoney {{ amount }} }}
            totalDiscountsSet {{ shopMoney {{ amount }} }}
            customer {{ numberOfOrders }}
            lineItems(first: 40) {{ nodes {{ sku quantity }} }}
          }} }} }}'''
        d = gql(brand['domain'], token, q)
        block = ((d.get('data') or {}).get('orders') or {})
        for o in block.get('nodes', []):
            if o.get('test') or o.get('cancelledAt'):
                continue
            codes = [c.strip().upper() for c in (o.get('discountCodes') or []) if c and c.strip()]
            if not codes:
                continue
            total = money(o.get('totalPriceSet'))
            tax = money(o.get('totalTaxSet'))
            ship = money(o.get('totalShippingPriceSet'))
            discount_ex = money(o.get('totalDiscountsSet')) / GST
            net = max(0.0, total - tax - ship)
            mk = (o.get('createdAt') or '')[:7]
            if len(mk) != 7:
                continue
            # numberOfOrders is a 64-bit scalar, which GraphQL returns as a string.
            is_new = int(((o.get('customer') or {}).get('numberOfOrders') or 0)) == 1
            qty_total = qty_costed = 0
            cost = 0.0
            for li in (o.get('lineItems') or {}).get('nodes', []):
                q_ = int(li.get('quantity') or 0)
                qty_total += q_
                uc = unit_cost(costs, li.get('sku'))
                if uc is not None:
                    qty_costed += q_
                    cost += uc * q_
            # An order with several codes is credited in full to each: the
            # per-code view answers "what flowed through this code", so the
            # rows are not additive across codes (rare in practice).
            for code in codes:
                a = agg[(code, mk)]
                a['orders'] += 1
                a['net_revenue'] += net
                a['discount_given'] += discount_ex
                a['new_customers'] += 1 if is_new else 0
                a['est_cost'] += cost
                a['qty_total'] += qty_total
                a['qty_costed'] += qty_costed
        pi = block.get('pageInfo') or {}
        if not pi.get('hasNextPage'):
            break
        cursor = pi.get('endCursor')
    return agg


def main():
    from shopify_auth import store_token
    with open(CONFIG_PATH) as f:
        config = json.load(f)
    brands = [b for b in config.get('brands', []) if b.get('domain') and (b.get('shopifyClientId') or b.get('token'))]
    since = (_dt.date.today() - _dt.timedelta(days=WINDOW_DAYS)).isoformat()
    cost_map = load_costs()
    print(f'Code performance for {len(brands)} store(s) since {since}...')
    errors = []
    for b in brands:
        try:
            tok = store_token(b)
            agg = sync_brand(b, tok, cost_map.get(b['name'].lower(), []), since)
            rows = [{'brand_id': b['id'], 'code': code, 'month_key': mk,
                     'orders': a['orders'], 'net_revenue': round(a['net_revenue'], 2),
                     'discount_given': round(a['discount_given'], 2), 'new_customers': a['new_customers'],
                     'est_cost': round(a['est_cost'], 2), 'qty_total': a['qty_total'], 'qty_costed': a['qty_costed'],
                     'updated_at': _dt.datetime.utcnow().isoformat() + 'Z'}
                    for (code, mk), a in agg.items()]
            for i in range(0, len(rows), 400):
                st, body = sb('POST', '/rest/v1/discount_code_performance?on_conflict=brand_id,code,month_key',
                              json.dumps(rows[i:i + 400]).encode(), {'Prefer': 'resolution=merge-duplicates'})
                if st not in (200, 201, 204):
                    raise RuntimeError(f'upsert {st} {body.decode(errors="replace")[:150]}')
            print(f"  {b['name']}: {len(rows)} code-months")
        except Exception as e:
            print(f"  ✗ {b['name']}: {e}")
            errors.append(f"{b['name']}: {e}")
    try:
        from sync_status_util import record
        record('Discount code performance', not errors, '; '.join(errors)[:400])
    except Exception:
        pass
    print('Done.')


if __name__ == '__main__':
    main()
