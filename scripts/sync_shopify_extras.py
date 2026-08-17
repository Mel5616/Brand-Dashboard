#!/usr/bin/env python3
"""Shopify extras sync — the data unlocked by the expanded app scopes:

1. abandoned_checkouts — monthly count + ex-GST value of checkouts started but
   never completed (trailing ~90 days, rolling).
2. product_stock       — snapshot of ACTIVE products that are out of stock or
   low (≤5 units across variants). Replaced wholesale each run.
3. shop_discount_codes — discount codes with native usage counts.

Runs in the main 3-hourly sync. Uses minted client-credential tokens.
"""
import datetime as _dt
import json
import os
import ssl
import urllib.parse
import urllib.request

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(BASE_DIR, 'stores.config.json')
ENV_PATH = os.path.join(BASE_DIR, '.env.local')
API = "2024-01"
CTX = ssl.create_default_context()
LOW_STOCK = 5


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
ANON = os.environ.get('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')


def sb(method, path, data=None, extra=None):
    req = urllib.request.Request(f'{URL}{path}', data=data, method=method)
    req.add_header('Authorization', f'Bearer {KEY}')
    req.add_header('apikey', ANON or KEY)
    if data is not None:
        req.add_header('Content-Type', 'application/json')
    for k, v in (extra or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, context=CTX, timeout=60) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def upsert(table, rows, conflict):
    if not rows:
        return
    st, b = sb('POST', f'/rest/v1/{table}?on_conflict={conflict}', json.dumps(rows).encode(),
               {'Prefer': 'resolution=merge-duplicates'})
    if st not in (200, 201, 204):
        print(f'  ✗ {table}: {st} {b.decode(errors="replace")[:150]}')


def shop_get(domain, token, path):
    req = urllib.request.Request(f'https://{domain}/admin/api/{API}/{path}')
    req.add_header('X-Shopify-Access-Token', token)
    with urllib.request.urlopen(req, context=CTX, timeout=60) as r:
        return json.loads(r.read().decode()), r.headers


def paged(domain, token, path, key):
    """Iterate a REST collection via cursor (Link header) pagination."""
    url = path
    for _ in range(80):
        d, headers = shop_get(domain, token, url)
        items = d.get(key, [])
        if not items:
            return
        yield from items
        link = headers.get('Link') or ''
        nxt = [p for p in link.split(',') if 'rel="next"' in p]
        if not nxt:
            return
        cursor = nxt[0].split('page_info=')[1].split('>')[0].split('&')[0]
        base = path.split('?')[0]
        url = f'{base}?limit=250&page_info={cursor}'


def sync_checkouts(bid, domain, token):
    since = (_dt.date.today() - _dt.timedelta(days=90)).isoformat()
    months = {}
    for ck in paged(domain, token, f'checkouts.json?limit=250&created_at_min={since}', 'checkouts'):
        mk = (ck.get('created_at') or '')[:7]
        if not mk:
            continue
        gross = float(ck.get('total_price') or 0)
        tax = float(ck.get('total_tax') or 0)
        # Bot/junk carts inflate the numbers absurdly (single "abandoned"
        # carts worth $40k+) — anything over $15k is not a real shopper.
        if gross <= 0 or gross > 15000:
            continue
        m = months.setdefault(mk, {'checkouts': 0, 'value': 0.0})
        m['checkouts'] += 1
        m['value'] += (gross - tax) if tax > 0 else gross / 1.1
    upsert('abandoned_checkouts',
           [{'brand_id': bid, 'month_key': mk, 'checkouts': m['checkouts'], 'value': round(m['value'], 2)}
            for mk, m in months.items()], 'brand_id,month_key')
    return sum(m['checkouts'] for m in months.values())


def sync_stock(bid, domain, token):
    rows = []
    for p in paged(domain, token, 'products.json?limit=250&status=active&fields=id,title,status,variants', 'products'):
        variants = p.get('variants') or []
        tracked = [v for v in variants if v.get('inventory_management')]
        if not tracked:
            continue  # untracked inventory — nothing to report
        total = sum(int(v.get('inventory_quantity') or 0) for v in tracked)
        out = sum(1 for v in tracked if int(v.get('inventory_quantity') or 0) <= 0)
        if total <= LOW_STOCK or out > 0:
            rows.append({'brand_id': bid, 'product_id': str(p['id']), 'title': (p.get('title') or '')[:200],
                         'status': p.get('status'), 'total_qty': total,
                         'variants_out': out, 'variants_total': len(tracked)})
    # replace wholesale so restocked products drop off
    sb('DELETE', f'/rest/v1/product_stock?brand_id=eq.{bid}')
    upsert('product_stock', rows, 'brand_id,product_id')
    return len(rows)


def sync_codes(bid, domain, token):
    rows = []
    rules = list(paged(domain, token, 'price_rules.json?limit=250', 'price_rules'))[:150]
    for r in rules:
        try:
            d, _ = shop_get(domain, token, f'price_rules/{r["id"]}/discount_codes.json?limit=250')
        except Exception:
            continue
        codes = d.get('discount_codes', [])
        # codes_in_rule lets the dashboard tell a "main" promo code (the sole
        # code on its own rule) apart from a bulk-generated batch (hundreds of
        # unique codes under one rule — the pattern affiliate/loyalty apps use).
        codes_in_rule = len(codes)
        for c in codes:
            rows.append({'brand_id': bid, 'code': (c.get('code') or '')[:80],
                         'usage_count': int(c.get('usage_count') or 0),
                         'value_type': r.get('value_type'),
                         'value': abs(float(r.get('value') or 0)),
                         'starts_at': r.get('starts_at'), 'ends_at': r.get('ends_at'),
                         'usage_limit': r.get('usage_limit'), 'codes_in_rule': codes_in_rule})
    upsert('shop_discount_codes', [r for r in rows if r['code']], 'brand_id,code')
    return len(rows)


def main():
    import sys
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from shopify_auth import store_token
    with open(CONFIG_PATH) as f:
        config = json.load(f)
    brands = [b for b in config.get('brands', []) if b.get('domain') and (b.get('shopifyClientId') or b.get('token'))]
    print(f'Shopify extras for {len(brands)} store(s)...')
    errors = []
    for b in brands:
        tok = store_token(b)
        try:
            n1 = sync_checkouts(b['id'], b['domain'], tok)
            n2 = sync_stock(b['id'], b['domain'], tok)
            n3 = sync_codes(b['id'], b['domain'], tok)
            print(f"  {b['name']}: {n1} abandoned · {n2} low/OOS products · {n3} codes")
        except Exception as e:
            print(f"  ✗ {b['name']}: {e}")
            errors.append(f"{b['name']}: {e}")
    from sync_status_util import record
    record('Shopify extras', not errors, '; '.join(str(x) for x in errors)[:400])
    print('Done.')


if __name__ == '__main__':
    main()
