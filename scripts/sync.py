#!/usr/bin/env python3
"""
Brand Dashboard — Shopify Sync (Supabase version)
Fetches live data from all stores and writes to Supabase.

Run locally:   python3 scripts/sync.py
On Vercel:     triggered automatically at 4am AEST via /api/sync cron
"""

import json, ssl, urllib.request, urllib.parse, os
from datetime import datetime, date as _date, timedelta as _td
from collections import defaultdict

# ── Config ────────────────────────────────────────────────────────────────────
BASE_DIR     = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH  = os.path.join(BASE_DIR, 'stores.config.json')
ENV_PATH     = os.path.join(BASE_DIR, '.env.local')

def load_env():
    """Load .env.local into os.environ if not already set."""
    if not os.path.exists(ENV_PATH):
        return
    with open(ENV_PATH) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            k, _, v = line.partition('=')
            k = k.strip()
            v = v.strip().strip('"').strip("'")
            if k not in os.environ:
                os.environ[k] = v

load_env()

SUPABASE_URL      = os.environ.get('NEXT_PUBLIC_SUPABASE_URL', '')
SUPABASE_ANON_KEY = os.environ.get('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')
SUPABASE_SVC_KEY  = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')

# ── Weekly buckets: last 13 weeks (rolling) ───────────────────────────────────
_today     = _date.today()
_cws       = _today - _td(days=_today.weekday())
WEEK_STARTS = [(_cws - _td(weeks=i)).isoformat() for i in range(12, -1, -1)]
WEEK_LABELS = [_date.fromisoformat(w).strftime('%-d %b') for w in WEEK_STARTS]

MONTHS       = ['Jul 25','Aug 25','Sep 25','Oct 25','Nov 25','Dec 25','Jan 26','Feb 26','Mar 26','Apr 26','May 26','Jun 26']
MONTH_KEYS   = ['2025-07','2025-08','2025-09','2025-10','2025-11','2025-12','2026-01','2026-02','2026-03','2026-04','2026-05','2026-06']
MONTHS_PREV  = ['Jul 24','Aug 24','Sep 24','Oct 24','Nov 24','Dec 24','Jan 25','Feb 25','Mar 25','Apr 25','May 25','Jun 25']
MONTH_KEYS_PREV = ['2024-07','2024-08','2024-09','2024-10','2024-11','2024-12','2025-01','2025-02','2025-03','2025-04','2025-05','2025-06']

# Window end = end of the FY's last month, or today if the FY is still in progress.
RANGE_END = '2026-06-30'
# Index of the current/last reportable month within the FY (latest month_key <= today).
# Lets the "last month" KPIs roll forward as the FY progresses instead of being pinned to May.
_cur_key  = _today.strftime('%Y-%m')
LAST_IDX  = max((i for i, k in enumerate(MONTH_KEYS) if k <= _cur_key), default=len(MONTH_KEYS) - 1)

# The Coolkidz store tags every brand's products with a vendor name and a
# `Brand_<Name>` tag (e.g. vendor "Mamave" / tag "Brand_Mamave"). That is the
# canonical brand signal — match on it first. Keyword matching on the product
# title is only a fallback for bundles vendored as "Coolkidz Australia".
COOLKIDZ_VENDOR_TO_ID = {
    'nanit': 0, 'magic': 1, 'hannie': 2, 'gaia baby': 3, 'wonderfold': 4,
    'uppababy': 5, 'zazu': 6, 'miamily': 7, 'frida': 8,
    'matchstick monkey': 10, 'mamave': 11,
}

COOLKIDZ_BRAND_KEYWORDS = {
    0:  ['pro camera', 'floor stand', 'sound + light', 'breathing wear', 'flex stand', 'travel case', 'nanit'],
    1:  ['heka', 'thoth', 'majestic', 'magic bin bag', 'magic bag'],
    2:  ['hannie'],
    5:  ['uppababy', 'minu', 'vista', 'mesa', 'piggyback'],
    7:  ['miamily', 'carry on'],
    10: ['matchstick monkey'],
    11: ["mumma", "bubba", 'mamave'],
}

def coolkidz_brand_id(title, vendor='', tags=None):
    tags = tags or []
    # 1. Brand_<Name> product tag (canonical)
    for t in tags:
        if t.lower().startswith('brand_'):
            key = t[6:].replace(' ', '').lower()
            for name, bid in COOLKIDZ_VENDOR_TO_ID.items():
                if name.replace(' ', '') == key:
                    return bid
    # 2. Vendor field
    v = (vendor or '').strip().lower()
    if v in COOLKIDZ_VENDOR_TO_ID:
        return COOLKIDZ_VENDOR_TO_ID[v]
    # 3. Title keyword fallback (bundles vendored as Coolkidz Australia)
    tl = title.lower()
    for brand_id, keywords in COOLKIDZ_BRAND_KEYWORDS.items():
        if any(kw in tl for kw in keywords):
            return brand_id
    return None

# ── Supabase REST helpers ─────────────────────────────────────────────────────

def sb_upsert(table, rows, on_conflict=None):
    if not rows or not SUPABASE_URL or not SUPABASE_SVC_KEY:
        return
    url = f'{SUPABASE_URL}/rest/v1/{table}'
    if on_conflict:
        url += f'?on_conflict={on_conflict}'
    data = json.dumps(rows).encode()
    req  = urllib.request.Request(url, data=data, method='POST')
    req.add_header('Content-Type', 'application/json')
    req.add_header('Authorization', f'Bearer {SUPABASE_SVC_KEY}')
    req.add_header('apikey', SUPABASE_ANON_KEY)
    req.add_header('Prefer', 'resolution=merge-duplicates')
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=30) as r:
            return r.status
    except urllib.error.HTTPError as e:
        print(f'  ✗ Supabase upsert {table}: {e.code} {e.read().decode()[:200]}')

def sb_delete_where(table, column, value):
    if not SUPABASE_URL or not SUPABASE_SVC_KEY:
        return
    url = f'{SUPABASE_URL}/rest/v1/{table}?{column}=eq.{value}'
    req = urllib.request.Request(url, method='DELETE')
    req.add_header('Authorization', f'Bearer {SUPABASE_SVC_KEY}')
    req.add_header('apikey', SUPABASE_ANON_KEY)
    req.add_header('Prefer', 'return=minimal')
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=30) as r:
            return r.status
    except urllib.error.HTTPError as e:
        print(f'  ✗ Supabase delete {table}: {e.code} {e.read().decode()[:200]}')

# ── Shopify GraphQL helper ────────────────────────────────────────────────────

def gql(domain, token, query):
    url  = f'https://{domain}/admin/api/2024-01/graphql.json'
    data = json.dumps({'query': query}).encode()
    req  = urllib.request.Request(url, data=data, method='POST')
    req.add_header('Content-Type', 'application/json')
    req.add_header('X-Shopify-Access-Token', token)
    ctx  = ssl.create_default_context()
    with urllib.request.urlopen(req, context=ctx, timeout=30) as r:
        return json.loads(r.read().decode())

# ── Fetch all paid orders ─────────────────────────────────────────────────────

def fetch_all_orders(domain, token):
    all_orders = []
    cursor = None
    while True:
        after = f', after: "{cursor}"' if cursor else ''
        q = f'''{{
          orders(first: 250{after},
            query: "financial_status:paid created_at:>=2024-07-01 created_at:<={RANGE_END}",
            sortKey: CREATED_AT) {{
            edges {{
              cursor
              node {{
                createdAt
                totalPriceSet      {{ shopMoney {{ amount currencyCode }} }}
                totalTaxSet        {{ shopMoney {{ amount }} }}
                totalRefundedSet   {{ shopMoney {{ amount }} }}
                customer           {{ id }}
                lineItems(first: 10) {{
                  edges {{ node {{
                    title
                    sku
                    originalTotalSet {{ shopMoney {{ amount }} }}
                    product {{ vendor tags }}
                  }} }}
                }}
              }}
            }}
            pageInfo {{ hasNextPage }}
          }}
        }}'''
        res   = gql(domain, token, q)
        data  = res.get('data', {}).get('orders', {})
        edges = data.get('edges', [])
        all_orders.extend(edges)
        if not data.get('pageInfo', {}).get('hasNextPage') or not edges:
            break
        cursor = edges[-1]['cursor']
    return all_orders

def fetch_refunded_orders(domain, token):
    """Fetch fully-refunded orders (separate from partial refunds on paid orders)."""
    all_orders = []
    cursor = None
    while True:
        after = f', after: "{cursor}"' if cursor else ''
        q = f'''{{
          orders(first: 250{after},
            query: "financial_status:refunded created_at:>=2024-07-01 created_at:<={RANGE_END}",
            sortKey: CREATED_AT) {{
            edges {{
              cursor
              node {{
                createdAt
                totalPriceSet {{ shopMoney {{ amount }} }}
                totalTaxSet   {{ shopMoney {{ amount }} }}
              }}
            }}
            pageInfo {{ hasNextPage }}
          }}
        }}'''
        res   = gql(domain, token, q)
        data  = res.get('data', {}).get('orders', {})
        edges = data.get('edges', [])
        all_orders.extend(edges)
        if not data.get('pageInfo', {}).get('hasNextPage') or not edges:
            break
        cursor = edges[-1]['cursor']
    return all_orders

# ── Compute metrics ───────────────────────────────────────────────────────────

def compute_metrics(orders, refunded_orders=None, sales_start=None):
    monthly_rev     = defaultdict(float)
    monthly_count   = defaultdict(int)
    weekly_rev      = defaultdict(float)
    weekly_count    = defaultdict(int)
    product_rev     = defaultdict(float)               # key (sku or title) -> revenue
    product_titles  = defaultdict(lambda: defaultdict(float))  # key -> {title: revenue}
    monthly_refunds = defaultdict(float)
    unique_customers = set()
    fy_orders_count = 0

    for edge in orders:
        node  = edge['node']
        if sales_start and node['createdAt'][:10] < sales_start:
            continue  # brand only started selling on/after this date
        ym    = node['createdAt'][:7]
        gross = float(node['totalPriceSet']['shopMoney']['amount'])
        tax   = float(node.get('totalTaxSet', {}).get('shopMoney', {}).get('amount', 0))
        amt   = (gross - tax) if tax > 0 else round(gross / 1.1, 2)

        monthly_rev[ym]   += amt
        monthly_count[ym] += 1

        d_obj = _date.fromisoformat(node['createdAt'][:10])
        ws    = (d_obj - _td(days=d_obj.weekday())).isoformat()
        weekly_rev[ws]   += amt
        weekly_count[ws] += 1

        for li in node.get('lineItems', {}).get('edges', []):
            item     = li['node']
            title    = item.get('title', '').strip()
            sku      = (item.get('sku') or '').strip()
            li_gross = float(item.get('originalTotalSet', {}).get('shopMoney', {}).get('amount', 0))
            li_amt   = round(li_gross / 1.1, 2)
            if title or sku:
                # Group by SKU so differently-titled listings of the same item merge;
                # fall back to title when a line has no SKU.
                key = sku if sku else f'T::{title}'
                product_rev[key]          += li_amt
                product_titles[key][title] += li_amt

        # Partial refunds on paid orders
        refunded_amt = float(node.get('totalRefundedSet', {}).get('shopMoney', {}).get('amount', 0))
        if refunded_amt > 0 and ym in MONTH_KEYS:
            monthly_refunds[ym] += refunded_amt

        # Unique customers (FY only)
        if ym in MONTH_KEYS:
            customer = node.get('customer')
            if customer and customer.get('id'):
                unique_customers.add(customer['id'])
            fy_orders_count += 1

    # Fully-refunded orders (separate query)
    for edge in (refunded_orders or []):
        node  = edge['node']
        if sales_start and node['createdAt'][:10] < sales_start:
            continue
        ym    = node['createdAt'][:7]
        if ym not in MONTH_KEYS:
            continue
        gross = float(node['totalPriceSet']['shopMoney']['amount'])
        tax   = float(node.get('totalTaxSet', {}).get('shopMoney', {}).get('amount', 0))
        monthly_refunds[ym] += (gross - tax) if tax > 0 else round(gross / 1.1, 2)

    revenue      = [round(monthly_rev.get(ym, 0)) for ym in MONTH_KEYS]
    revenue_prev = [round(monthly_rev.get(ym, 0)) for ym in MONTH_KEYS_PREV]
    orders_m     = [monthly_count.get(ym, 0)      for ym in MONTH_KEYS]
    weekly_revenue = [round(weekly_rev.get(w, 0)) for w in WEEK_STARTS]
    weekly_orders  = [weekly_count.get(w, 0)       for w in WEEK_STARTS]
    # Top products grouped by SKU; show the title that earned the most under each SKU
    top_keys     = sorted(product_rev.items(), key=lambda x: x[1], reverse=True)[:5]
    top_products = [(max(product_titles[k].items(), key=lambda t: t[1])[0], v) for k, v in top_keys]

    last_rev    = revenue[LAST_IDX]            # current/last reportable month
    prev_rev    = revenue[LAST_IDX - 1] if LAST_IDX > 0 else 0
    last_orders = orders_m[LAST_IDX]
    mom         = round((last_rev - prev_rev) / prev_rev * 100, 1) if prev_rev else 0
    aov         = round(last_rev / last_orders) if last_orders else 0
    fy_revenue  = sum(revenue)
    fy_prev     = sum(revenue_prev)
    yoy         = round((fy_revenue - fy_prev) / fy_prev * 100, 1) if fy_prev else None  # None = no prior-year baseline

    fy_refunds         = round(sum(monthly_refunds.get(mk, 0) for mk in MONTH_KEYS))
    last_month_refunds = round(monthly_refunds.get(MONTH_KEYS[LAST_IDX], 0))

    currency = 'AUD'
    if orders:
        currency = orders[0]['node']['totalPriceSet']['shopMoney'].get('currencyCode', 'AUD')

    return {
        'revenue': revenue, 'revenue_prev': revenue_prev, 'orders_m': orders_m,
        'weekly_revenue': weekly_revenue, 'weekly_orders': weekly_orders,
        'top_products': top_products,
        'last_rev': last_rev, 'last_orders': last_orders,
        'mom': mom, 'aov': aov, 'fy_revenue': fy_revenue, 'yoy': yoy,
        'currency': currency,
        'fy_refunds': fy_refunds,
        'last_month_refunds': last_month_refunds,
        'unique_customers_fy': len(unique_customers),
        'fy_orders': fy_orders_count,
        'product_rev': dict(product_rev),
        'product_titles': {k: dict(v) for k, v in product_titles.items()},
    }

# ── Coolkidz store split: attribute its line items to the real brands ─────────

def compute_coolkidz_split(ck_orders, start_dates=None):
    """Split the Coolkidz multi-brand store's sales per brand (by vendor/Brand_ tag)
    so they can be folded into each brand's own totals. Unmapped house/bundle items
    are dropped. Returns { brand_id: { monthly_rev, weekly_rev, mo_orders, wk_orders,
    product_rev, product_titles } }."""
    start_dates = start_dates or {}
    split = {}
    for idx, edge in enumerate(ck_orders):
        node = edge['node']
        day  = node['createdAt'][:10]
        ym   = node['createdAt'][:7]
        d    = _date.fromisoformat(day)
        ws   = (d - _td(days=d.weekday())).isoformat()
        for li in node.get('lineItems', {}).get('edges', []):
            item  = li['node']
            title = (item.get('title') or '').strip()
            sku   = (item.get('sku') or '').strip()
            prod  = item.get('product') or {}
            bid   = coolkidz_brand_id(title, prod.get('vendor', ''), prod.get('tags', []))
            if bid is None:
                continue
            if bid in start_dates and day < start_dates[bid]:
                continue  # brand only started selling on/after this date
            amt = round(float(item.get('originalTotalSet', {}).get('shopMoney', {}).get('amount', 0)) / 1.1, 2)
            s = split.setdefault(bid, {
                'monthly_rev': defaultdict(float), 'weekly_rev': defaultdict(float),
                'mo_orders': defaultdict(set), 'wk_orders': defaultdict(set),
                'product_rev': defaultdict(float), 'product_titles': defaultdict(lambda: defaultdict(float)),
            })
            s['monthly_rev'][ym] += amt
            s['weekly_rev'][ws]  += amt
            s['mo_orders'][ym].add(idx)
            s['wk_orders'][ws].add(idx)
            key = sku if sku else f'T::{title}'
            s['product_rev'][key]          += amt
            s['product_titles'][key][title] += amt
    return split

def merge_coolkidz(m, cs):
    """Fold a brand's Coolkidz-store split (cs) into its own-store metrics (m)."""
    for i, mk in enumerate(MONTH_KEYS):
        m['revenue'][i]  += round(cs['monthly_rev'].get(mk, 0))
        m['orders_m'][i] += len(cs['mo_orders'].get(mk, set()))
    for i, mk in enumerate(MONTH_KEYS_PREV):
        m['revenue_prev'][i] += round(cs['monthly_rev'].get(mk, 0))
    for i, ws in enumerate(WEEK_STARTS):
        m['weekly_revenue'][i] += round(cs['weekly_rev'].get(ws, 0))
        m['weekly_orders'][i]  += len(cs['wk_orders'].get(ws, set()))
    # merge products + re-rank top 5
    pr, pt = m['product_rev'], m['product_titles']
    for k, v in cs['product_rev'].items():
        pr[k] = pr.get(k, 0) + v
    for k, td in cs['product_titles'].items():
        d = pt.setdefault(k, {})
        for t, vv in td.items():
            d[t] = d.get(t, 0) + vv
    top_keys = sorted(pr.items(), key=lambda x: x[1], reverse=True)[:5]
    m['top_products'] = [(max(pt[k].items(), key=lambda t: t[1])[0], v) for k, v in top_keys]
    # recompute headline summary
    m['revenue']     = [round(x) for x in m['revenue']]
    m['last_rev']    = m['revenue'][LAST_IDX]
    prev_rev         = m['revenue'][LAST_IDX - 1] if LAST_IDX > 0 else 0
    m['last_orders'] = m['orders_m'][LAST_IDX]
    m['mom']         = round((m['last_rev'] - prev_rev) / prev_rev * 100, 1) if prev_rev else 0
    m['aov']         = round(m['last_rev'] / m['last_orders']) if m['last_orders'] else 0
    m['fy_revenue']  = sum(m['revenue'])
    fy_prev          = sum(m['revenue_prev'])
    m['yoy']         = round((m['fy_revenue'] - fy_prev) / fy_prev * 100, 1) if fy_prev else None
    return m

# ── Sync one brand to Supabase ────────────────────────────────────────────────

def sync_brand(brand, ck_split=None):
    name   = brand['name']
    domain = brand.get('domain', '')
    token  = brand.get('token', '')
    bid    = brand['id']

    if brand.get('comingSoon') or not domain or not token:
        sb_upsert('brands', [{'id': bid, 'name': name, 'color': brand.get('color','#666'), 'init': brand.get('init','?'), 'live': False}], on_conflict='id')
        print(f'  ⏭  {name} — skipped')
        return False

    # Coolkidz is the multi-brand store — its sales are folded into each brand
    # (see compute_coolkidz_split), so it's not shown as a standalone brand.
    if name == 'Coolkidz Australia':
        sb_upsert('brands', [{'id': bid, 'name': name, 'color': brand.get('color','#666'), 'init': brand.get('init','?'), 'live': False, 'synced_at': datetime.utcnow().isoformat() + 'Z'}], on_conflict='id')
        for tbl in ('brand_monthly', 'brand_weekly', 'brand_products', 'brand_summary'):
            sb_delete_where(tbl, 'brand_id', bid)
        print(f'  ⏭  {name} — folded into individual brands')
        return False

    print(f'  ⟳  {name} ({domain})')
    try:
        orders          = fetch_all_orders(domain, token)
        refunded_orders = fetch_refunded_orders(domain, token)
        m               = compute_metrics(orders, refunded_orders, brand.get('salesStart'))
        if ck_split and bid in ck_split:
            m = merge_coolkidz(m, ck_split[bid])

        now = datetime.utcnow().isoformat() + 'Z'

        # Upsert brand row
        sb_upsert('brands', [{'id': bid, 'name': name, 'color': brand.get('color','#666'), 'init': brand.get('init','?'), 'live': True, 'synced_at': now}], on_conflict='id')

        # Upsert monthly data
        monthly_rows = []
        for i, mk in enumerate(MONTH_KEYS):
            monthly_rows.append({'brand_id': bid, 'month_key': mk, 'revenue': m['revenue'][i], 'orders': m['orders_m'][i], 'prev_revenue': m['revenue_prev'][i]})
        sb_upsert('brand_monthly', monthly_rows, on_conflict='brand_id,month_key')

        # Upsert weekly data
        weekly_rows = [{'brand_id': bid, 'week_start': WEEK_STARTS[i], 'revenue': m['weekly_revenue'][i], 'orders': m['weekly_orders'][i]} for i in range(13)]
        sb_upsert('brand_weekly', weekly_rows, on_conflict='brand_id,week_start')

        # Upsert top products (delete+insert to avoid stale rank data)
        sb_delete_where('brand_products', 'brand_id', bid)
        if m['top_products']:
            prod_rows = [{'brand_id': bid, 'rank': i+1, 'title': t, 'gross_sales': round(v)} for i, (t, v) in enumerate(m['top_products'])]
            sb_upsert('brand_products', prod_rows, on_conflict='brand_id,rank')

        # Upsert summary
        sb_upsert('brand_summary', [{
            'brand_id': bid, 'last_month_label': MONTHS[LAST_IDX],
            'last_month_rev': m['last_rev'], 'mom_growth': m['mom'],
            'yoy_growth': m['yoy'], 'last_month_orders': m['last_orders'],
            'aov': m['aov'], 'fy_revenue': m['fy_revenue'],
            'currency': m['currency'], 'synced_at': now,
            'fy_orders': m['fy_orders'],
            'unique_customers_fy': m['unique_customers_fy'],
            'fy_refunds': m['fy_refunds'],
            'last_month_refunds': m['last_month_refunds'],
        }], on_conflict='brand_id')

        print(f'       May: ${m["last_rev"]:,} | MoM: {m["mom"]:+.1f}% | Orders: {m["last_orders"]} | FY: ${m["fy_revenue"]:,}')
        return True

    except Exception as e:
        print(f'       ✗ Error: {e}')
        sb_upsert('brands', [{'id': bid, 'name': name, 'color': brand.get('color','#666'), 'init': brand.get('init','?'), 'live': False}], on_conflict='id')
        return False

# ── Tradeshow sync ────────────────────────────────────────────────────────────

def fetch_state_orders(domain, token, state, date_start, date_end):
    total_rev = 0.0; total_count = 0; cursor = None
    while True:
        after = f', after: "{cursor}"' if cursor else ''
        q = f'''{{
          orders(first: 250{after},
            query: "financial_status:paid created_at:>={date_start} created_at:<={date_end}",
            sortKey: CREATED_AT) {{
            edges {{ cursor node {{
              sourceName
              shippingAddress {{ province }}
              totalPriceSet {{ shopMoney {{ amount }} }}
              totalTaxSet   {{ shopMoney {{ amount }} }}
            }} }}
            pageInfo {{ hasNextPage }}
          }}
        }}'''
        res = gql(domain, token, q)
        data = res.get('data', {}).get('orders', {})
        for e in data.get('edges', []):
            node = e['node']
            is_pos    = (node.get('sourceName') or '').lower() == 'pos'
            province  = (node.get('shippingAddress') or {}).get('province', '')
            # POS orders are in-person booth sales — always count during show dates.
            # Web orders count only if shipping to the show's state (online proxy).
            if not is_pos and province.lower() != state.lower():
                continue
            gross = float(node['totalPriceSet']['shopMoney']['amount'])
            tax   = float(node.get('totalTaxSet', {}).get('shopMoney', {}).get('amount', 0))
            total_rev   += (gross - tax) if tax > 0 else round(gross / 1.1, 2)
            total_count += 1
        if not data.get('pageInfo', {}).get('hasNextPage') or not data.get('edges'):
            break
        cursor = data['edges'][-1]['cursor']
    return round(total_rev), total_count

def fetch_state_orders_by_brand(domain, token, state, date_start, date_end):
    # The Coolkidz website is the booth till — every order placed during the show
    # dates is a direct show order, so we DON'T filter by shipping province here
    # (booth/pickup orders often have no shipping address at all). `state` is kept
    # in the signature for call-site compatibility but is intentionally unused.
    brand_rev = defaultdict(float); brand_count = defaultdict(int); cursor = None
    while True:
        after = f', after: "{cursor}"' if cursor else ''
        q = f'''{{
          orders(first: 250{after},
            query: "financial_status:paid created_at:>={date_start} created_at:<={date_end}",
            sortKey: CREATED_AT) {{
            edges {{ cursor node {{
              lineItems(first: 20) {{ edges {{ node {{
                title
                originalTotalSet {{ shopMoney {{ amount }} }}
                product {{ vendor tags }}
              }} }} }}
            }} }}
            pageInfo {{ hasNextPage }}
          }}
        }}'''
        res = gql(domain, token, q)
        data = res.get('data', {}).get('orders', {})
        for e in data.get('edges', []):
            node = e['node']
            for li in node.get('lineItems', {}).get('edges', []):
                item  = li['node']
                title = item.get('title', '')
                prod  = item.get('product') or {}
                amt   = round(float(item.get('originalTotalSet', {}).get('shopMoney', {}).get('amount', 0)) / 1.1, 2)
                bid   = coolkidz_brand_id(title, prod.get('vendor', ''), prod.get('tags', []))
                if bid is not None:
                    brand_rev[bid] += amt; brand_count[bid] += 1
        if not data.get('pageInfo', {}).get('hasNextPage') or not data.get('edges'):
            break
        cursor = data['edges'][-1]['cursor']
    return {bid: (round(rev), brand_count[bid]) for bid, rev in brand_rev.items()}

def sync_tradeshows(config, all_brands):
    shows = config.get('tradeshows', [])
    now   = datetime.utcnow().isoformat() + 'Z'

    # Upsert tradeshow definitions
    ts_rows = [{'id': s['id'], 'name': s['name'], 'date_start': s['dateStart'], 'date_end': s['dateEnd'], 'state': s['state'], 'location': s.get('location','')} for s in shows]
    sb_upsert('tradeshows', ts_rows, on_conflict='id')

    # Upsert tradeshow_brands mapping
    tb_rows = []
    for s in shows:
        for bid in s.get('brandIds', [b['id'] for b in all_brands]):
            tb_rows.append({'tradeshow_id': s['id'], 'brand_id': bid})
    if tb_rows:
        sb_upsert('tradeshow_brands', tb_rows, on_conflict='tradeshow_id,brand_id')

    # Each brand's tradeshow total = its OWN Shopify store's orders shipping to
    # the show's state during the show dates  +  its share of the Coolkidz booth
    # till (Coolkidz website orders on the show dates, split per brand by
    # vendor / Brand_<Name> tag, no shipping province needed).
    coolkidz   = next((b for b in all_brands if b['name'] == 'Coolkidz Australia'), None)
    brand_by_id = {b['id']: b for b in all_brands}

    for show in shows:
        name       = show['name']
        state      = show['state']
        date_start = show['dateStart']
        date_end   = show['dateEnd']
        brand_ids  = show.get('brandIds', [b['id'] for b in all_brands])
        print(f'  ⟳  {name} ({state})')

        # Coolkidz booth till — all orders on the show dates, split per brand.
        ck_show = {}
        if coolkidz and coolkidz.get('token') and coolkidz.get('domain'):
            try:
                ck_show = fetch_state_orders_by_brand(coolkidz['domain'], coolkidz['token'], state, date_start, date_end)
            except Exception as e:
                print(f'       ✗ Coolkidz fetch failed: {e}')

        for bid in brand_ids:
            br = brand_by_id.get(bid)
            ck_r, ck_o = ck_show.get(bid, (0, 0))
            own_r = own_o = 0
            # Brand's own store: online orders shipping to the show's state during
            # the dates (skip Coolkidz itself — that's the booth till above).
            if br and br['name'] != 'Coolkidz Australia' and br.get('token') and br.get('domain'):
                try:
                    own_r, own_o = fetch_state_orders(br['domain'], br['token'], state, date_start, date_end)
                except Exception as e:
                    print(f'       ✗ {br["name"]} store: {e}')

            total_rev    = own_r + ck_r
            total_orders = own_o + ck_o
            sb_upsert('tradeshow_sales', [{'tradeshow_id': show['id'], 'brand_id': bid, 'revenue': total_rev, 'orders': total_orders, 'synced_at': now}], on_conflict='tradeshow_id,brand_id')
            if total_rev > 0:
                bname = br['name'] if br else f'Brand {bid}'
                print(f'       {bname}: ${total_rev:,} ({total_orders} orders)  [own ${own_r:,} + booth ${ck_r:,}]')

# ── Google Ads sync ──────────────────────────────────────────────────────────

GOOGLE_ADS_CREDS_PATH = os.path.join(BASE_DIR, 'google_ads_creds.json')

def _google_access_token(creds):
    data = urllib.parse.urlencode({
        'refresh_token': creds['refreshToken'],
        'client_id':     creds['clientId'],
        'client_secret': creds['clientSecret'],
        'grant_type':    'refresh_token',
    }).encode()
    req = urllib.request.Request('https://oauth2.googleapis.com/token', data=data, method='POST')
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, context=ctx, timeout=15) as r:
        return json.loads(r.read().decode())['access_token']

def fetch_google_ads_metrics(customer_id, creds):
    """Fetch monthly spend, impressions, clicks, conversions_value for a customer."""
    access_token = _google_access_token(creds)
    cid = customer_id.replace('-', '')

    query_full = '''
    SELECT segments.month, metrics.cost_micros, metrics.impressions,
           metrics.clicks, metrics.conversions_value
    FROM campaign
    WHERE segments.date >= '2024-07-01' AND segments.date <= '2026-06-30'
      AND campaign.status != 'REMOVED'
    '''
    query_no_conv = '''
    SELECT segments.month, metrics.cost_micros, metrics.impressions, metrics.clicks
    FROM campaign
    WHERE segments.date >= '2024-07-01' AND segments.date <= '2026-06-30'
      AND campaign.status != 'REMOVED'
    '''

    url = f'https://googleads.googleapis.com/v20/customers/{cid}/googleAds:search'
    ctx = ssl.create_default_context()

    def _fetch(q):
        req = urllib.request.Request(url, data=json.dumps({'query': q}).encode(), method='POST')
        req.add_header('Authorization', f'Bearer {access_token}')
        req.add_header('developer-token', creds['developerToken'])
        req.add_header('Content-Type', 'application/json')
        req.add_header('login-customer-id', '8923727576')  # MCC ID
        with urllib.request.urlopen(req, context=ctx, timeout=30) as r:
            return json.loads(r.read().decode())

    try:
        data = _fetch(query_full)
    except urllib.error.HTTPError as e:
        if e.code == 400:
            data = _fetch(query_no_conv)  # account has no conversion tracking
        else:
            raise

    # Aggregate by month
    monthly = defaultdict(lambda: {'spend': 0.0, 'impressions': 0, 'clicks': 0, 'conv_value': 0.0})
    for row in data.get('results', []):
        ym  = (row.get('segments', {}).get('month') or '')[:7]   # '2025-07'
        met = row.get('metrics', {})
        if not ym:
            continue
        monthly[ym]['spend']       += float(met.get('costMicros', 0)) / 1_000_000
        monthly[ym]['impressions'] += int(met.get('impressions', 0))
        monthly[ym]['clicks']      += int(met.get('clicks', 0))
        monthly[ym]['conv_value']  += float(met.get('conversionsValue', 0))

    rows = []
    for mk in MONTH_KEYS:
        m    = monthly.get(mk, {})
        spend = round(m.get('spend', 0), 2)
        conv  = m.get('conv_value', 0)
        roas  = round(conv / spend, 2) if spend > 0 else 0
        rows.append({
            'month_key':   mk,
            'spend':       spend,
            'impressions': m.get('impressions', 0),
            'clicks':      m.get('clicks', 0),
            'roas':        roas,
        })
    return rows

def fetch_google_ads_campaigns(customer_id, creds):
    """Fetch monthly spend/clicks/conversions broken down by campaign."""
    access_token = _google_access_token(creds)
    cid = customer_id.replace('-', '')

    query_full = '''
    SELECT campaign.name, segments.month,
           metrics.cost_micros, metrics.impressions, metrics.clicks,
           metrics.conversions, metrics.conversions_value
    FROM campaign
    WHERE segments.date >= '2024-07-01' AND segments.date <= '2026-06-30'
      AND campaign.status != 'REMOVED'
    '''
    query_no_conv = '''
    SELECT campaign.name, segments.month,
           metrics.cost_micros, metrics.impressions, metrics.clicks
    FROM campaign
    WHERE segments.date >= '2024-07-01' AND segments.date <= '2026-06-30'
      AND campaign.status != 'REMOVED'
    '''

    url = f'https://googleads.googleapis.com/v20/customers/{cid}/googleAds:search'
    ctx = ssl.create_default_context()

    def _fetch(q):
        req = urllib.request.Request(url, data=json.dumps({'query': q}).encode(), method='POST')
        req.add_header('Authorization', f'Bearer {access_token}')
        req.add_header('developer-token', creds['developerToken'])
        req.add_header('Content-Type', 'application/json')
        req.add_header('login-customer-id', '8923727576')
        with urllib.request.urlopen(req, context=ctx, timeout=30) as r:
            return json.loads(r.read().decode())

    try:
        data = _fetch(query_full)
    except urllib.error.HTTPError as e:
        if e.code == 400:
            data = _fetch(query_no_conv)
        else:
            raise

    # Aggregate by campaign + month
    campaign_month = defaultdict(lambda: {'spend': 0.0, 'impressions': 0, 'clicks': 0, 'conversions': 0.0, 'conv_value': 0.0})
    for row in data.get('results', []):
        ym   = (row.get('segments', {}).get('month') or '')[:7]
        name = row.get('campaign', {}).get('name', 'Unknown')
        met  = row.get('metrics', {})
        if not ym:
            continue
        key = (name, ym)
        campaign_month[key]['spend']       += float(met.get('costMicros', 0)) / 1_000_000
        campaign_month[key]['impressions'] += int(met.get('impressions', 0))
        campaign_month[key]['clicks']      += int(met.get('clicks', 0))
        campaign_month[key]['conversions'] += float(met.get('conversions', 0))
        campaign_month[key]['conv_value']  += float(met.get('conversionsValue', 0))

    rows = []
    for (camp_name, mk), m in campaign_month.items():
        if mk not in MONTH_KEYS:
            continue
        rows.append({
            'month_key':     mk,
            'campaign_name': camp_name,
            'spend':         round(m['spend'], 2),
            'impressions':   m['impressions'],
            'clicks':        m['clicks'],
            'conversions':   round(m['conversions'], 2),
            'conv_value':    round(m['conv_value'], 2),
        })
    return rows

def sync_google_ads(config):
    if not os.path.exists(GOOGLE_ADS_CREDS_PATH):
        return
    creds = json.loads(open(GOOGLE_ADS_CREDS_PATH).read())
    if not creds.get('refreshToken'):
        return

    now = datetime.utcnow().isoformat() + 'Z'
    synced = 0
    for brand in config['brands']:
        cid = brand.get('googleAdsCustomerId', '')
        if not cid:
            continue
        name = brand['name']
        bid  = brand['id']
        print(f'  ⟳  Google Ads: {name} ({cid})')
        try:
            rows = fetch_google_ads_metrics(cid, creds)
            db_rows = [{'brand_id': bid, 'month_key': r['month_key'], 'spend': r['spend'],
                        'impressions': r['impressions'], 'clicks': r['clicks'], 'roas': r['roas']} for r in rows]
            sb_upsert('google_ads', db_rows, on_conflict='brand_id,month_key')

            camp_rows = fetch_google_ads_campaigns(cid, creds)
            camp_db   = [{'brand_id': bid, **r} for r in camp_rows]
            if camp_db:
                sb_upsert('google_ads_campaigns', camp_db, on_conflict='brand_id,month_key,campaign_name')
                print(f'       {len(set(r["campaign_name"] for r in camp_db))} campaigns synced')

            may = next((r for r in rows if r['month_key'] == '2026-05'), {})
            print(f'       May spend: ${may.get("spend",0):,.2f} | ROAS: {may.get("roas",0):.2f} | Clicks: {may.get("clicks",0):,}')
            synced += 1
        except Exception as e:
            body = ""
            try:
                if hasattr(e, "read"):
                    body = e.read().decode()[:400]
            except Exception:
                pass
            print(f'       ✗ {name}: {e} {body}')
    print(f'  Google Ads: {synced} brand(s) synced')

# ── Main ──────────────────────────────────────────────────────────────────────

def sync_calendar_events(config):
    """Fetch public Apple Calendar iCal feeds and upsert campaign events."""
    import sync_calendar as cal  # reuse parsing + brand-matching helpers

    urls = config.get('marketingCalendarUrls') or config.get('marketingCalendarUrl')
    if isinstance(urls, str):
        urls = [urls]
    if not urls:
        print('  ↷ No marketingCalendarUrls configured, skipping')
        return

    events = []
    for i, url in enumerate(urls, 1):
        try:
            raw = cal.fetch_ics(url)
        except Exception as e:
            print(f'  ⚠ Could not fetch calendar feed {i}: {e} — skipping')
            continue
        events.extend(cal.parse_events(cal.unfold(raw)))

    rows = []
    for ev in events:
        if not ev.get('uid') or not ev.get('title') or not ev.get('start_date'):
            continue
        brand_id = cal.match_brand(ev['title'])
        if brand_id is None:
            brand_id = cal.match_brand(ev.get('description', ''))
        rows.append({
            'uid':         ev['uid'],
            'title':       ev['title'],
            'description': ev.get('description', ''),
            'location':    ev.get('location', ''),
            'start_date':  ev['start_date'].isoformat(),
            'end_date':    ev['end_date'].isoformat() if ev.get('end_date') else None,
            'all_day':     ev.get('all_day', True),
            'brand_id':    brand_id,
        })

    if rows:
        sb_upsert('calendar_events', rows, on_conflict='uid')
    print(f'  Calendar: {len(rows)} events synced')


def main():
    print('\n⚡ Brand Dashboard — Shopify Sync → Supabase\n')

    if not SUPABASE_URL:
        print('ERROR: NEXT_PUBLIC_SUPABASE_URL not set. Add it to .env.local\n')
        return

    config = json.loads(open(CONFIG_PATH).read())
    brands = config['brands']
    configured = sum(1 for b in brands if b.get('token') and not b.get('comingSoon'))
    print(f'Supabase: {SUPABASE_URL}')
    print(f'Brands: {len(brands)} total · {configured} with tokens\n')

    # Log sync start
    log_row = [{'triggered_by': 'manual'}]
    sb_upsert('sync_log', log_row)

    # Sync week labels
    wl_rows = [{'week_start': WEEK_STARTS[i], 'label': WEEK_LABELS[i]} for i in range(13)]
    sb_upsert('week_labels', wl_rows, on_conflict='week_start')

    # Build the Coolkidz-store split once, then fold it into each brand
    ck_split = {}
    coolkidz = next((b for b in brands if b['name'] == 'Coolkidz Australia'), None)
    if coolkidz and coolkidz.get('token') and coolkidz.get('domain'):
        print('  ⟳  Splitting Coolkidz store sales by brand...')
        try:
            start_dates = {b['id']: b['salesStart'] for b in brands if b.get('salesStart')}
            ck_split = compute_coolkidz_split(fetch_all_orders(coolkidz['domain'], coolkidz['token']), start_dates)
            print(f'       mapped to {len(ck_split)} brands')
        except Exception as e:
            print(f'  ✗ Coolkidz split failed: {e}')

    ok = 0; err = 0
    for brand in brands:
        if sync_brand(brand, ck_split):
            ok += 1
        else:
            err += 1

    print('\n  ⟳  Syncing tradeshow data...')
    try:
        sync_tradeshows(config, brands)
    except Exception as e:
        print(f'  ✗ Tradeshow sync failed: {e}')

    if os.path.exists(GOOGLE_ADS_CREDS_PATH):
        print('\n  ⟳  Syncing Google Ads data...')
        try:
            sync_google_ads(config)
        except Exception as e:
            print(f'  ✗ Google Ads sync failed: {e}')

    print('\n  ⟳  Syncing marketing calendar...')
    try:
        sync_calendar_events(config)
    except Exception as e:
        print(f'  ✗ Calendar sync failed: {e}')

    if os.environ.get('ANTHROPIC_API_KEY'):
        print('\n  ⟳  Generating AI insights brief...')
        try:
            import sync_insights as insights
            insights.main()
        except Exception as e:
            print(f'  ✗ AI insights failed: {e}')

    # Update sync log with completion (insert a new completion row)
    finished = datetime.utcnow().isoformat() + 'Z'
    sb_upsert('sync_log', [{'finished_at': finished, 'brands_ok': ok, 'brands_err': err, 'triggered_by': 'manual'}])

    print(f'\n✅ Done — {ok}/{len(brands)} brands synced to Supabase')
    print(f'   Open your dashboard to see live data.\n')

if __name__ == '__main__':
    main()
