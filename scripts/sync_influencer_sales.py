#!/usr/bin/env python3
"""
Influencer sales auto-matching — turns the gifting tracker into an ROI report.

Collects every affiliate/discount code recorded on influencer_entries and
partnership entries, then searches each brand's Shopify orders for orders that
used that discount code and writes monthly totals (orders + ex-GST revenue)
to influencer_sales. Manual sales_value fields are never touched.

Revenue convention matches the dashboard: order total minus tax minus shipping.
Run: python3 scripts/sync_influencer_sales.py   (also in the Actions sync)
"""

import json, os, ssl, urllib.request
from collections import defaultdict

BASE_DIR    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(BASE_DIR, 'stores.config.json')
ENV_PATH    = os.path.join(BASE_DIR, '.env.local')

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
SB_URL  = os.environ.get('NEXT_PUBLIC_SUPABASE_URL', '')
SB_KEY  = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
SB_ANON = os.environ.get('NEXT_PUBLIC_SUPABASE_ANON_KEY', '') or SB_KEY

def sb(path, method='GET', body=None, prefer=None):
    req = urllib.request.Request(f'{SB_URL}/rest/v1/{path}',
                                 data=json.dumps(body).encode() if body is not None else None, method=method)
    req.add_header('Authorization', f'Bearer {SB_KEY}')
    req.add_header('apikey', SB_ANON)
    if body is not None:
        req.add_header('Content-Type', 'application/json')
    req.add_header('Prefer', prefer or 'resolution=merge-duplicates')
    with urllib.request.urlopen(req, context=ssl.create_default_context(), timeout=30) as r:
        txt = r.read().decode()
        return json.loads(txt) if txt else None

def gql(domain, token, query):
    req = urllib.request.Request(f'https://{domain}/admin/api/2024-01/graphql.json',
                                 data=json.dumps({'query': query}).encode(), method='POST')
    req.add_header('Content-Type', 'application/json')
    req.add_header('X-Shopify-Access-Token', token)
    with urllib.request.urlopen(req, context=ssl.create_default_context(), timeout=40) as r:
        return json.loads(r.read().decode())

def fetch_code_orders(domain, token, code):
    """All orders on the store that used this discount code. Returns
    {month_key: {orders, revenue}} with revenue = total - tax - shipping (ex-GST)."""
    out = defaultdict(lambda: {'orders': 0, 'revenue': 0.0})
    cursor = ''
    safe = code.replace('"', '').replace('\\', '')
    while True:
        after = f', after: "{cursor}"' if cursor else ''
        q = f'''{{ orders(first: 100, query: "discount_code:{safe} status:any"{after}) {{
          pageInfo {{ hasNextPage endCursor }}
          nodes {{
            createdAt cancelledAt test
            discountCodes
            totalPriceSet {{ shopMoney {{ amount }} }}
            totalTaxSet {{ shopMoney {{ amount }} }}
            totalShippingPriceSet {{ shopMoney {{ amount }} }}
          }} }} }}'''
        data = gql(domain, token, q)
        block = ((data.get('data') or {}).get('orders') or {})
        for o in block.get('nodes', []):
            if o.get('test') or o.get('cancelledAt'):
                continue
            # search can fuzzy-match; require the exact code on the order
            codes = [c.upper() for c in (o.get('discountCodes') or [])]
            if safe.upper() not in codes:
                continue
            total = float(((o.get('totalPriceSet') or {}).get('shopMoney') or {}).get('amount') or 0)
            tax   = float(((o.get('totalTaxSet') or {}).get('shopMoney') or {}).get('amount') or 0)
            ship  = float(((o.get('totalShippingPriceSet') or {}).get('shopMoney') or {}).get('amount') or 0)
            mk = (o.get('createdAt') or '')[:7]
            if len(mk) == 7:
                out[mk]['orders'] += 1
                out[mk]['revenue'] += max(0.0, total - tax - ship)
        pi = block.get('pageInfo') or {}
        if not pi.get('hasNextPage'):
            break
        cursor = pi.get('endCursor')
    return out

def main():
    with open(CONFIG_PATH) as f:
        config = json.load(f)
    by_name = {}
    for b in config.get('brands', []):
        if b.get('domain') and b.get('token'):
            by_name[b['name'].lower()] = b

    # Codes from influencer gifts and partnership deals, grouped per brand name.
    rows  = sb('influencer_entries?select=brand,affiliate_code&affiliate_code=not.is.null') or []
    try:
        rows += sb('partnership_entries?select=brand,affiliate_code&affiliate_code=not.is.null') or []
    except Exception:
        pass
    codes = defaultdict(set)
    for r in rows:
        code = (r.get('affiliate_code') or '').strip()
        brand = (r.get('brand') or '').strip().lower()
        if code and brand:
            codes[brand].add(code)
    if not codes:
        print('No affiliate codes recorded yet — nothing to match.')
        return

    total_rows, errors = 0, []
    for brand_name, code_set in sorted(codes.items()):
        b = by_name.get(brand_name)
        if not b:
            # Coolkidz-site brands sell through the Coolkidz store
            b = by_name.get('coolkidz australia')
        if not b:
            errors.append(f'{brand_name}: no store configured')
            continue
        # brand_id of the influencer's brand (not the store it transacted on)
        target = next((x for x in config['brands'] if x['name'].lower() == brand_name), None)
        bid = target['id'] if target else b['id']
        for code in sorted(code_set):
            try:
                months = fetch_code_orders(b['domain'], b['token'], code)
            except Exception as e:
                errors.append(f'{brand_name}/{code}: {e}')
                continue
            up = [{'brand_id': bid, 'code': code, 'month_key': mk,
                   'orders': v['orders'], 'revenue': round(v['revenue'], 2)}
                  for mk, v in months.items()]
            if up:
                sb('influencer_sales?on_conflict=brand_id,code,month_key', method='POST', body=up)
                total_rows += len(up)
                print(f"  {brand_name} · {code}: {sum(v['orders'] for v in months.values())} orders, "
                      f"${sum(v['revenue'] for v in months.values()):,.0f}")
            else:
                print(f'  {brand_name} · {code}: no orders yet')

    from sync_status_util import record
    record('Influencer Sales', not errors, '; '.join(errors))
    print(f'\nDone — {total_rows} monthly rows.')

if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        from sync_status_util import record
        record('Influencer Sales', False, str(e)); raise
