#!/usr/bin/env python3
"""Sync-failure alerts. Reads the sync_status table and emails (via Resend) when a
data feed has failed or gone stale — so a broken integration (expired token, API
outage) is caught the day it happens, not weeks later.

Deduped: a persistent failure emails once, not every run. Sends a short all-clear
when everything recovers. Runs as the final step of the sync workflow. Uses the
same resendApiKey / digestEmail from stores.config.json as the weekly digest.
"""
import os, json, ssl, urllib.request, hashlib
from datetime import datetime, timezone, timedelta

BASE_DIR    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(BASE_DIR, 'stores.config.json')
STALE_HOURS = 26          # a source silent longer than this counts as stale
ALERT_STATE = '__alert_state__'

def sb(url, method='GET', body=None):
    key  = os.environ['SUPABASE_SERVICE_ROLE_KEY']
    anon = os.environ.get('NEXT_PUBLIC_SUPABASE_ANON_KEY', '') or key
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body else None, method=method)
    req.add_header('Authorization', f'Bearer {key}')
    req.add_header('apikey', anon)
    if body is not None:
        req.add_header('Content-Type', 'application/json')
        req.add_header('Prefer', 'resolution=merge-duplicates')
    with urllib.request.urlopen(req, context=ssl.create_default_context(), timeout=20) as r:
        txt = r.read().decode()
        return json.loads(txt) if txt else None

def send_email(api_key, to_emails, subject, html):
    req = urllib.request.Request(
        'https://api.resend.com/emails',
        data=json.dumps({
            'from': 'Coolkidz Dashboard <digest@coolkidz.com.au>',
            'to': to_emails if isinstance(to_emails, list) else [to_emails],
            'subject': subject, 'html': html,
        }).encode(), method='POST')
    req.add_header('Authorization', f'Bearer {api_key}')
    req.add_header('Content-Type', 'application/json')
    with urllib.request.urlopen(req, context=ssl.create_default_context(), timeout=20) as r:
        return r.read().decode()

def main():
    base = os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
    if not base:
        return
    with open(CONFIG_PATH) as f:
        config = json.load(f)
    api_key = config.get('resendApiKey')
    to_email = config.get('digestEmail', 'mel@coolkidz.com.au')

    rows = sb(f'{base}/rest/v1/sync_status?select=source,ok,message,ran_at') or []
    now = datetime.now(timezone.utc)
    problems = []
    for r in rows:
        if (r.get('source') or '').startswith('__'):
            continue
        if not r.get('ok'):
            problems.append((r['source'], 'failed', (r.get('message') or '')[:200]))
        else:
            try:
                ran = datetime.fromisoformat(r['ran_at'].replace('Z', '+00:00'))
                if now - ran > timedelta(hours=STALE_HOURS):
                    problems.append((r['source'], 'stale', f"last synced {ran:%d %b %H:%M} UTC"))
            except Exception:
                pass

    sig = hashlib.sha1('|'.join(sorted(f'{p[0]}:{p[1]}' for p in problems)).encode()).hexdigest() if problems else ''
    state = sb(f'{base}/rest/v1/sync_status?source=eq.{ALERT_STATE}&select=message,ok') or []
    last_sig = state[0]['message'] if state else ''

    def save_state(new_sig):
        sb(f'{base}/rest/v1/sync_status?on_conflict=source', 'POST',
           [{'source': ALERT_STATE, 'ok': not new_sig, 'message': new_sig, 'ran_at': now.isoformat()}])

    if not problems:
        if last_sig and api_key:
            send_email(api_key, to_email, '✅ Dashboard sync recovered',
                       '<div style="font-family:system-ui;padding:20px"><h2>All sync feeds are healthy again.</h2>'
                       '<p style="color:#6b7280">Every data source reported OK on the latest run.</p></div>')
        save_state('')
        print('All sources healthy.')
        return

    if sig == last_sig:
        print(f'{len(problems)} problem(s), unchanged since last alert — not re-emailing.')
        return

    if not api_key:
        print('Problems found but no resendApiKey configured — skipping email.')
        save_state(sig)
        return

    items = ''.join(
        f'<tr><td style="padding:8px 12px;font-weight:600;color:#111">{s}</td>'
        f'<td style="padding:8px 12px"><span style="background:{"#fee2e2" if k=="failed" else "#fef3c7"};'
        f'color:{"#b91c1c" if k=="failed" else "#92400e"};border-radius:6px;padding:2px 8px;font-size:12px">{k}</span></td>'
        f'<td style="padding:8px 12px;color:#6b7280;font-size:13px">{m}</td></tr>'
        for s, k, m in problems)
    html = (f'<div style="font-family:system-ui;max-width:640px;margin:auto;padding:20px">'
            f'<h2 style="color:#b91c1c">⚠ Dashboard sync: {len(problems)} feed(s) need attention</h2>'
            f'<table style="border-collapse:collapse;width:100%"><thead><tr style="text-align:left;color:#9ca3af;font-size:11px;text-transform:uppercase">'
            f'<th style="padding:8px 12px">Source</th><th style="padding:8px 12px">Status</th><th style="padding:8px 12px">Detail</th></tr></thead>'
            f'<tbody>{items}</tbody></table>'
            f'<p style="color:#9ca3af;font-size:12px;margin-top:20px">A failed feed usually means an expired token or an API outage. '
            f'<a href="https://marketing.coolkidz.com.au" style="color:#6366f1">Open the dashboard</a></p></div>')
    send_email(api_key, to_email, f'⚠ Dashboard sync: {len(problems)} feed(s) need attention', html)
    save_state(sig)
    print(f'Alert emailed to {to_email}: {[p[0] for p in problems]}')

if __name__ == '__main__':
    # Never fail the workflow over alerting (e.g. table not created yet).
    try:
        main()
    except Exception as e:
        print(f'alert step skipped: {e}')
