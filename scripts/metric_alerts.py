#!/usr/bin/env python3
"""
Exception alerts — daily threshold checks on the numbers themselves.
Runs after the data syncs. Exceptions only: nothing fires when things are normal.

Checks (per brand):
  revenue_drop   — last 7 complete days vs the prior 7 down 40%+ (prior >= $500)
  spend_spike    — yesterday's ad spend (Google+Meta) > 2.5x the trailing 14-day
                   average and > $100
  roas_collapse  — month-to-date blended ROAS < half the prior-2-month average,
                   with >= $500 MTD spend and >= 10 days into the month.
                   (Monthly tables only: daily Google revenue lags conversions
                   and false-alarmed on day one — never use it for ROAS.)

New alerts land in metric_alerts (deduped by alert_key so a persisting condition
doesn't re-fire daily), surface as dashboard toasts, and email via Resend.
"""

import json, os, ssl, urllib.request
from datetime import date, timedelta

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
    if prefer:
        req.add_header('Prefer', prefer)
    try:
        with urllib.request.urlopen(req, context=ssl.create_default_context(), timeout=30) as r:
            txt = r.read().decode()
            return json.loads(txt) if txt else None
    except urllib.error.HTTPError as e:
        body_txt = e.read().decode()[:200]
        if method == 'POST' and 'duplicate key' in body_txt:
            return None  # dedupe hit — the same condition already alerted
        raise

def daterows(table, datecol, since, cols):
    out, page = [], 0
    while True:
        rows = sb(f'{table}?select={cols}&{datecol}=gte.{since}&limit=1000&offset={page * 1000}') or []
        out += rows
        if len(rows) < 1000:
            return out
        page += 1

def main():
    with open(CONFIG_PATH) as f:
        config = json.load(f)
    brands = {b['id']: b['name'] for b in config.get('brands', [])}
    today = date.today()
    since = (today - timedelta(days=40)).isoformat()

    daily = daterows('brand_daily', 'day', since, 'brand_id,day,revenue')
    gads  = daterows('google_ads_daily', 'date', since, 'brand_id,date,spend,revenue')
    mads  = daterows('meta_ads_daily', 'date', since, 'brand_id,date,spend,revenue')
    # Monthly ads rows (reliable revenue attribution) for the ROAS check
    mk_now = today.isoformat()[:7]
    prior_mks = [(date(today.year, today.month, 1) - timedelta(days=1)).isoformat()[:7]]
    prior_mks.append((date(int(prior_mks[0][:4]), int(prior_mks[0][5:7]), 1) - timedelta(days=1)).isoformat()[:7])
    gm = sb(f'google_ads?select=brand_id,month_key,spend,revenue&month_key=in.({mk_now},{",".join(prior_mks)})') or []
    mm = sb(f'meta_ads?select=brand_id,month_key,spend,revenue&month_key=in.({mk_now},{",".join(prior_mks)})') or []

    def win(rows, datecol, start, end):
        s, e = start.isoformat(), end.isoformat()
        return [r for r in rows if s <= r[datecol] <= e]

    alerts = []
    yday      = today - timedelta(days=1)
    wk_start  = today - timedelta(days=7)
    prev_start, prev_end = today - timedelta(days=14), today - timedelta(days=8)

    for bid, name in brands.items():
        mine   = [r for r in daily if r['brand_id'] == bid]
        cur    = sum(r['revenue'] or 0 for r in win(mine, 'day', wk_start, yday))
        prev   = sum(r['revenue'] or 0 for r in win(mine, 'day', prev_start, prev_end))
        if prev >= 500 and cur < prev * 0.6:
            drop = (1 - cur / prev) * 100
            alerts.append({
                'alert_key': f'revenue_drop|{bid}|{yday.isoformat()[:7]}-{yday.isocalendar()[1]}',
                'kind': 'revenue_drop', 'severity': 'warn', 'brand_id': bid,
                'title': f'{name}: revenue down {drop:.0f}% week on week',
                'detail': f'Last 7 days ${cur:,.0f} vs ${prev:,.0f} the week before.',
                'value': round(drop, 1),
            })

        ads_mine = [r for r in gads if r['brand_id'] == bid] + [r for r in mads if r['brand_id'] == bid]
        y_spend  = sum(r['spend'] or 0 for r in ads_mine if r['date'] == yday.isoformat())
        trail    = [sum(r['spend'] or 0 for r in ads_mine if r['date'] == (yday - timedelta(days=i)).isoformat())
                    for i in range(1, 15)]
        avg = sum(trail) / 14 if trail else 0
        if y_spend > 100 and avg > 0 and y_spend > avg * 2.5:
            alerts.append({
                'alert_key': f'spend_spike|{bid}|{yday.isoformat()}',
                'kind': 'spend_spike', 'severity': 'warn', 'brand_id': bid,
                'title': f'{name}: ad spend spiked to ${y_spend:,.0f} yesterday',
                'detail': f'{y_spend / avg:.1f}x the trailing 14-day average (${avg:,.0f}/day).',
                'value': round(y_spend, 2),
            })

        if today.day >= 10:
            ads_m   = [r for r in gm if r['brand_id'] == bid] + [r for r in mm if r['brand_id'] == bid]
            cur_sp  = sum(r['spend'] or 0 for r in ads_m if r['month_key'] == mk_now)
            cur_rv  = sum(r['revenue'] or 0 for r in ads_m if r['month_key'] == mk_now)
            base_sp = sum(r['spend'] or 0 for r in ads_m if r['month_key'] in prior_mks)
            base_rv = sum(r['revenue'] or 0 for r in ads_m if r['month_key'] in prior_mks)
            if cur_sp >= 500 and base_sp > 0 and base_rv / base_sp >= 1:
                cur_roas, base_roas = cur_rv / cur_sp, base_rv / base_sp
                if cur_roas < base_roas * 0.5:
                    alerts.append({
                        'alert_key': f'roas_collapse|{bid}|{mk_now}',
                        'kind': 'roas_collapse', 'severity': 'warn', 'brand_id': bid,
                        'title': f'{name}: blended ROAS halved ({base_roas:.1f} → {cur_roas:.1f})',
                        'detail': f'{mk_now} so far: ${cur_sp:,.0f} spend for ${cur_rv:,.0f} revenue vs {base_roas:.1f}x over the prior two months.',
                        'value': round(cur_roas, 2),
                    })

    fresh = []
    for a in alerts:
        r = sb('metric_alerts', method='POST', body=a, prefer='return=representation')
        if r:
            fresh.append(a)

    if fresh:
        api_key = config.get('resendApiKey')
        to = [e.strip() for e in (config.get('digestEmail') or '').split(',') if e.strip()]
        if api_key and to:
            items = ''.join(
                f"<tr><td style='padding:8px 12px;border-bottom:1px solid #eee'><strong>{a['title']}</strong>"
                f"<br><span style='color:#64748b;font-size:13px'>{a['detail']}</span></td></tr>" for a in fresh)
            html = (f"<div style='font-family:sans-serif;max-width:560px'><h2 style='color:#b91c1c'>"
                    f"⚠ {len(fresh)} dashboard alert{'s' if len(fresh) != 1 else ''}</h2>"
                    f"<table style='width:100%;border-collapse:collapse'>{items}</table>"
                    f"<p style='color:#94a3b8;font-size:12px'>Exceptions only — sent when a threshold trips. "
                    f"marketing.coolkidz.com.au</p></div>")
            req = urllib.request.Request('https://api.resend.com/emails', data=json.dumps({
                'from': 'Coolkidz Dashboard <mel@coolkidz.com.au>', 'to': to,
                'subject': f"⚠ Dashboard alert: {fresh[0]['title']}" + (f' (+{len(fresh)-1} more)' if len(fresh) > 1 else ''),
                'html': html}).encode(), method='POST')
            req.add_header('Authorization', f'Bearer {api_key}')
            req.add_header('Content-Type', 'application/json')
            req.add_header('User-Agent', 'coolkidz-dashboard/1.0')
            try:
                with urllib.request.urlopen(req, context=ssl.create_default_context(), timeout=20) as r:
                    r.read()
                print(f'Emailed {len(fresh)} alert(s) to {", ".join(to)}')
            except Exception as e:
                print(f'✗ alert email failed: {e}')

    for a in fresh:
        print(f"  ⚠ {a['title']}")
    if not fresh:
        print('No exceptions — all quiet.')

if __name__ == '__main__':
    main()
