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

MONTHS       = ['Jul 25','Aug 25','Sep 25','Oct 25','Nov 25','Dec 25','Jan 26','Feb 26','Mar 26','Apr 26','May 26']
MONTH_KEYS   = ['2025-07','2025-08','2025-09','2025-10','2025-11','2025-12','2026-01','2026-02','2026-03','2026-04','2026-05']
MONTHS_PREV  = ['Jul 24','Aug 24','Sep 24','Oct 24','Nov 24','Dec 24','Jan 25','Feb 25','Mar 25','Apr 25','May 25','Jun 25']
MONTH_KEYS_PREV = ['2024-07','2024-08','2024-09','2024-10','2024-11','2024-12','2025-01','2025-02','2025-03','2025-04','2025-05','2025-06']

COOLKIDZ_BRAND_KEYWORDS = {
    0:  ['pro camera', 'floor stand', 'sound + light', 'breathing wear', 'flex stand', 'travel case', 'nanit'],
    1:  ['heka', 'thoth', 'majestic', 'magic bin bag', 'magic bag'],
    2:  ['hannie'],
    5:  ['uppababy', 'minu', 'vista', 'mesa', 'piggyback'],
    7:  ['miamily', 'carry on'],
    10: ['matchstick monkey'],
    11: ["mumma's", "bubba's", 'mamave'],
}

def coolkidz_brand_id(title):
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
            query: "financial_status:paid created_at:>=2024-07-01 created_at:<=2026-05-31",
            sortKey: CREATED_AT) {{
            edges {{
              cursor
              node {{
                createdAt
                totalPriceSet {{ shopMoney {{ amount currencyCode }} }}
                totalTaxSet   {{ shopMoney {{ amount }} }}
                lineItems(first: 5) {{
                  edges {{ node {{
                    title
                    originalTotalSet {{ shopMoney {{ amount }} }}
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

# ── Compute metrics ───────────────────────────────────────────────────────────

def compute_metrics(orders):
    monthly_rev   = defaultdict(float)
    monthly_count = defaultdict(int)
    weekly_rev    = defaultdict(float)
    weekly_count  = defaultdict(int)
    product_rev   = defaultdict(float)

    for edge in orders:
        node  = edge['node']
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
            li_gross = float(item.get('originalTotalSet', {}).get('shopMoney', {}).get('amount', 0))
            li_amt   = round(li_gross / 1.1, 2)
            if title:
                product_rev[title] += li_amt

    revenue      = [round(monthly_rev.get(ym, 0)) for ym in MONTH_KEYS]
    revenue_prev = [round(monthly_rev.get(ym, 0)) for ym in MONTH_KEYS_PREV]
    orders_m     = [monthly_count.get(ym, 0)      for ym in MONTH_KEYS]
    weekly_revenue = [round(weekly_rev.get(w, 0)) for w in WEEK_STARTS]
    weekly_orders  = [weekly_count.get(w, 0)       for w in WEEK_STARTS]
    top_products   = sorted(product_rev.items(), key=lambda x: x[1], reverse=True)[:5]

    last_rev    = revenue[10]     # May 26
    prev_rev    = revenue[9]      # Apr 26
    last_orders = orders_m[10]
    mom         = round((last_rev - prev_rev) / prev_rev * 100, 1) if prev_rev else 0
    aov         = round(last_rev / last_orders) if last_orders else 0
    fy_revenue  = sum(revenue)
    fy_prev     = sum(revenue_prev)
    yoy         = round((fy_revenue - fy_prev) / fy_prev * 100, 1) if fy_prev else 0

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
    }

# ── Sync one brand to Supabase ────────────────────────────────────────────────

def sync_brand(brand):
    name   = brand['name']
    domain = brand.get('domain', '')
    token  = brand.get('token', '')
    bid    = brand['id']

    if brand.get('comingSoon') or not domain or not token:
        sb_upsert('brands', [{'id': bid, 'name': name, 'color': brand.get('color','#666'), 'init': brand.get('init','?'), 'live': False}], on_conflict='id')
        print(f'  ⏭  {name} — skipped')
        return False

    print(f'  ⟳  {name} ({domain})')
    try:
        orders = fetch_all_orders(domain, token)
        m      = compute_metrics(orders)

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
            'brand_id': bid, 'last_month_label': 'May 26',
            'last_month_rev': m['last_rev'], 'mom_growth': m['mom'],
            'yoy_growth': m['yoy'], 'last_month_orders': m['last_orders'],
            'aov': m['aov'], 'fy_revenue': m['fy_revenue'],
            'currency': m['currency'], 'synced_at': now,
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
            if (node.get('shippingAddress') or {}).get('province', '').lower() != state.lower():
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
    brand_rev = defaultdict(float); brand_count = defaultdict(int); cursor = None
    while True:
        after = f', after: "{cursor}"' if cursor else ''
        q = f'''{{
          orders(first: 250{after},
            query: "financial_status:paid created_at:>={date_start} created_at:<={date_end}",
            sortKey: CREATED_AT) {{
            edges {{ cursor node {{
              shippingAddress {{ province }}
              lineItems(first: 20) {{ edges {{ node {{
                title
                originalTotalSet {{ shopMoney {{ amount }} }}
              }} }} }}
            }} }}
            pageInfo {{ hasNextPage }}
          }}
        }}'''
        res = gql(domain, token, q)
        data = res.get('data', {}).get('orders', {})
        for e in data.get('edges', []):
            node = e['node']
            if (node.get('shippingAddress') or {}).get('province', '').lower() != state.lower():
                continue
            for li in node.get('lineItems', {}).get('edges', []):
                item  = li['node']
                title = item.get('title', '')
                amt   = round(float(item.get('originalTotalSet', {}).get('shopMoney', {}).get('amount', 0)) / 1.1, 2)
                bid   = coolkidz_brand_id(title)
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

    for show in shows:
        name       = show['name']
        state      = show['state']
        date_start = show['dateStart']
        date_end   = show['dateEnd']
        brand_ids  = show.get('brandIds', [b['id'] for b in all_brands])
        print(f'  ⟳  {name} ({state})')

        d_start        = _date.fromisoformat(date_start)
        baseline_end   = (d_start - _td(days=1)).isoformat()
        baseline_start = (d_start - _td(days=28)).isoformat()

        ck_show = {}; ck_base = {}
        ordered = sorted([b for b in all_brands if b['id'] in brand_ids], key=lambda b: 0 if b['name'] == 'Coolkidz Australia' else 1)

        for br in ordered:
            if not br.get('token') or not br.get('domain'):
                continue
            try:
                if br['name'] == 'Coolkidz Australia':
                    ck_show = fetch_state_orders_by_brand(br['domain'], br['token'], state, date_start, date_end)
                    ck_base = fetch_state_orders_by_brand(br['domain'], br['token'], state, baseline_start, baseline_end)
                else:
                    show_rev, show_orders = fetch_state_orders(br['domain'], br['token'], state, date_start, date_end)
                    ck_r, ck_o = ck_show.get(br['id'], (0, 0))
                    total_rev    = show_rev + ck_r
                    total_orders = show_orders + ck_o
                    sb_upsert('tradeshow_sales', [{'tradeshow_id': show['id'], 'brand_id': br['id'], 'revenue': total_rev, 'orders': total_orders, 'synced_at': now}], on_conflict='tradeshow_id,brand_id')
                    print(f'       {br["name"]}: ${total_rev:,} ({total_orders} orders)')
            except Exception as e:
                print(f'       ✗ {br["name"]}: {e}')

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

    query = '''
    SELECT
      segments.month,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions_value
    FROM campaign
    WHERE segments.date >= '2024-07-01'
      AND segments.date <= '2026-05-31'
      AND campaign.status != 'REMOVED'
    '''

    url = f'https://googleads.googleapis.com/v20/customers/{cid}/googleAds:search'
    req = urllib.request.Request(url, data=json.dumps({'query': query}).encode(), method='POST')
    req.add_header('Authorization', f'Bearer {access_token}')
    req.add_header('developer-token', creds['developerToken'])
    req.add_header('Content-Type', 'application/json')
    req.add_header('login-customer-id', '8923727576')  # MCC ID
    ctx = ssl.create_default_context()

    with urllib.request.urlopen(req, context=ctx, timeout=30) as r:
        data = json.loads(r.read().decode())

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
        print(f'  ⟳  Google Ads: {name} ({cid})')
        try:
            rows = fetch_google_ads_metrics(cid, creds)
            db_rows = [{'brand_id': brand['id'], 'month_key': r['month_key'], 'spend': r['spend'],
                        'impressions': r['impressions'], 'clicks': r['clicks'], 'roas': r['roas']} for r in rows]
            sb_upsert('google_ads', db_rows, on_conflict='brand_id,month_key')
            may = next((r for r in rows if r['month_key'] == '2026-05'), {})
            print(f'       May spend: ${may.get("spend",0):,.2f} | ROAS: {may.get("roas",0):.2f} | Clicks: {may.get("clicks",0):,}')
            synced += 1
        except Exception as e:
            print(f'       ✗ {name}: {e}')
    print(f'  Google Ads: {synced} brand(s) synced')

# ── Main ──────────────────────────────────────────────────────────────────────

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

    ok = 0; err = 0
    for brand in brands:
        if sync_brand(brand):
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

    # Update sync log with completion (insert a new completion row)
    finished = datetime.utcnow().isoformat() + 'Z'
    sb_upsert('sync_log', [{'finished_at': finished, 'brands_ok': ok, 'brands_err': err, 'triggered_by': 'manual'}])

    print(f'\n✅ Done — {ok}/{len(brands)} brands synced to Supabase')
    print(f'   Open your dashboard to see live data.\n')

if __name__ == '__main__':
    main()
