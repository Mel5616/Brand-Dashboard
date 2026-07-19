#!/usr/bin/env python3
"""Weekly D2C Shopify report — every Sunday 7pm AEST (cron in d2c-report.yml).

Covers the just-completed business week (Sunday→Saturday) for every brand
website, from brand_daily (synced from Shopify every 3 hours, so the data is
fresh at run time). Per brand: revenue, orders, AOV, WoW, vs 4-week average,
share of portfolio. Stored in d2c_weekly_reports; shown on Reports > D2C
Weekly. If resendApiKey + digestEmail are set in stores.config.json, a summary
email goes out too (optional — the dashboard view works without it).
"""
import json, os, ssl, sys, urllib.request
from datetime import date, datetime, timedelta, timezone

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(BASE_DIR, "stores.config.json")
CTX = ssl.create_default_context()
AEST = timezone(timedelta(hours=10))

def load_env():
    p = os.path.join(BASE_DIR, ".env.local")
    if not os.path.exists(p):
        return
    with open(p) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            if k.strip() not in os.environ:
                os.environ[k.strip()] = v.strip().strip('"').strip("'")
load_env()

URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

def sb(method, path, data=None, extra=None):
    r = urllib.request.Request(f"{URL}{path}", data=data, method=method)
    r.add_header("Authorization", f"Bearer {KEY}"); r.add_header("apikey", KEY)
    if data is not None:
        r.add_header("Content-Type", "application/json")
    for k, v in (extra or {}).items():
        r.add_header(k, v)
    try:
        with urllib.request.urlopen(r, context=CTX, timeout=40) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()

def get(path):
    st, body = sb("GET", path)
    return json.loads(body.decode()) if st == 200 else []

def main():
    if not URL or not KEY:
        print("Missing Supabase env"); sys.exit(1)

    # Business weeks run Sunday→Saturday. Report the last COMPLETED week
    # (in AEST — on Sunday 7pm that's the week that ended last night).
    today = datetime.now(AEST).date()
    this_week_start = today - timedelta(days=(today.weekday() + 1) % 7)  # most recent Sunday
    wk_start = this_week_start - timedelta(days=7)
    wk_end = wk_start + timedelta(days=6)
    hist_start = wk_start - timedelta(days=56)   # 8 prior weeks: 4-wk avg + trend chart

    brands = {b["id"]: b["name"] for b in get("/rest/v1/brands?select=id,name")}
    rows = get(f"/rest/v1/brand_daily?select=brand_id,day,revenue,orders&day=gte.{hist_start}&day=lte.{wk_end}&limit=20000")

    def bucket(d):
        dd = date.fromisoformat(d)
        if wk_start <= dd <= wk_end: return "cur"
        if wk_start - timedelta(days=7) <= dd < wk_start: return "prev"
        if wk_start - timedelta(days=28) <= dd < wk_start: return "hist"
        return None   # older weeks feed the trend only

    agg = {}
    daily = {}
    weekly = {}
    for r in rows:
        bid = r["brand_id"]
        rev = float(r["revenue"] or 0); orders = int(r["orders"] or 0)
        dd = date.fromisoformat(r["day"])
        # Portfolio day-by-day for the reported week.
        if wk_start <= dd <= wk_end:
            dr = daily.setdefault(r["day"], [0.0, 0]); dr[0] += rev; dr[1] += orders
        # 9-week portfolio trend (8 prior + reported week).
        ws = (dd - timedelta(days=(dd.weekday() + 1) % 7)).isoformat()
        weekly[ws] = weekly.get(ws, 0.0) + rev
        a = agg.setdefault(bid, {"cur": [0.0, 0], "prev": [0.0, 0], "hist": [0.0, 0]})
        bk = bucket(r["day"])
        if bk:
            b = a[bk]
            b[0] += rev; b[1] += orders

    def pct(cur, base):
        return round((cur - base) / base * 100, 1) if base > 0 else None

    total_cur = sum(a["cur"][0] for a in agg.values())
    brands_out = []
    for bid, a in agg.items():
        cur_r, cur_o = a["cur"]; prev_r, _ = a["prev"]
        avg4 = a["hist"][0] / 4 if a["hist"][0] else 0
        if cur_r <= 0 and prev_r <= 0:
            continue
        brands_out.append({
            "brand": brands.get(bid, f"Brand {bid}"),
            "revenue": round(cur_r), "orders": cur_o,
            "aov": round(cur_r / cur_o) if cur_o else None,
            "wowPct": pct(cur_r, prev_r), "prevRevenue": round(prev_r),
            "vs4wkPct": pct(cur_r, avg4),
            "sharePct": round(cur_r / total_cur * 100, 1) if total_cur > 0 else 0,
        })
    brands_out.sort(key=lambda b: -b["revenue"])

    total_prev = sum(a["prev"][0] for a in agg.values())
    total_orders = sum(a["cur"][1] for a in agg.values())
    movers = [b for b in brands_out if b["wowPct"] is not None and b["prevRevenue"] >= 200]
    payload = {
        "weekStart": wk_start.isoformat(), "weekEnd": wk_end.isoformat(),
        "generatedAt": datetime.now(AEST).isoformat(),
        "totals": {
            "revenue": round(total_cur), "orders": total_orders,
            "aov": round(total_cur / total_orders) if total_orders else None,
            "wowPct": pct(total_cur, total_prev), "prevRevenue": round(total_prev),
        },
        "brands": brands_out,
        "risers": sorted([b for b in movers if b["wowPct"] > 0], key=lambda b: -b["wowPct"])[:3],
        "fallers": sorted([b for b in movers if b["wowPct"] < 0], key=lambda b: b["wowPct"])[:3],
        "daily": [{"day": d, "revenue": round(v[0]), "orders": v[1]} for d, v in sorted(daily.items())],
        "trend": [{"weekStart": ws, "revenue": round(v)} for ws, v in sorted(weekly.items()) if ws <= wk_start.isoformat()],
    }

    st, body = sb("POST", "/rest/v1/d2c_weekly_reports?on_conflict=week_start",
                  json.dumps({"week_start": wk_start.isoformat(), "payload": payload}).encode(),
                  extra={"Prefer": "resolution=merge-duplicates"})
    if st not in (200, 201, 204):
        print(f"Report upsert failed ({st}): {body.decode(errors='replace')[:300]}"); sys.exit(1)
    print(f"D2C weekly report saved: {wk_start} – {wk_end} · ${payload['totals']['revenue']:,} across {len(brands_out)} brands", flush=True)

    # Optional email (needs resendApiKey + digestEmail in stores.config.json).
    try:
        config = json.load(open(CONFIG_PATH))
    except Exception:
        config = {}
    api_key, to = config.get("resendApiKey"), config.get("digestEmail")
    if api_key and to:
        t = payload["totals"]
        wow = f" ({'+' if t['wowPct'] >= 0 else ''}{t['wowPct']}% WoW)" if t["wowPct"] is not None else ""
        rows_html = "".join(
            f"<tr><td style='padding:6px 12px'>{b['brand']}</td><td style='padding:6px 12px;text-align:right'>${b['revenue']:,}</td>"
            f"<td style='padding:6px 12px;text-align:right'>{b['orders']}</td>"
            f"<td style='padding:6px 12px;text-align:right'>{('+' if (b['wowPct'] or 0) >= 0 else '') + str(b['wowPct']) + '%' if b['wowPct'] is not None else '—'}</td></tr>"
            for b in brands_out)
        html = (f"<h2>D2C Weekly · {wk_start.strftime('%-d %b')} – {wk_end.strftime('%-d %b')}</h2>"
                f"<p><strong>${t['revenue']:,}</strong>{wow} · {t['orders']} orders · AOV ${t['aov'] or 0:,}</p>"
                f"<table style='border-collapse:collapse;font-family:sans-serif;font-size:14px'>"
                f"<tr><th style='padding:6px 12px;text-align:left'>Brand</th><th style='padding:6px 12px'>Revenue</th><th style='padding:6px 12px'>Orders</th><th style='padding:6px 12px'>WoW</th></tr>{rows_html}</table>"
                f"<p><a href='https://marketing.coolkidz.com.au'>Open the dashboard →</a></p>")
        req = urllib.request.Request("https://api.resend.com/emails",
            data=json.dumps({"from": "Coolkidz Dashboard <onboarding@resend.dev>", "to": [e.strip() for e in str(to).split(",")],
                             "subject": f"D2C Weekly · ${t['revenue']:,}{wow}", "html": html}).encode(),
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}, method="POST")
        try:
            urllib.request.urlopen(req, context=CTX, timeout=30)
            print("Email sent", flush=True)
        except Exception as e:
            print(f"Email failed (report still saved): {e}", flush=True)

if __name__ == "__main__":
    try:
        from sync_status_util import record
    except ImportError:
        record = lambda *a, **k: None
    try:
        main(); record("D2C weekly report", True)
    except Exception as e:
        record("D2C weekly report", False, str(e)[:300]); raise
