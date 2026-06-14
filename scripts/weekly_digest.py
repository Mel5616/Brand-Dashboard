#!/usr/bin/env python3
"""
Weekly email digest — sends a summary of last week's performance to the team.

Setup:
  1. Get a free Resend API key at resend.com
  2. Add to stores.config.json:
       "resendApiKey": "re_xxxxxxxxxxxx"
       "digestEmail":  "mel@coolkidz.com.au"  (or comma-separated list)

  3. pip3 install requests supabase python-dotenv
  4. python3 scripts/weekly_digest.py
     (or add to cron: every Sunday night)
     0 18 * * 0 cd /path/to/brand-dashboard && python3 scripts/weekly_digest.py

Environment:
  NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
"""

import sys, os, json
from datetime import date, timedelta

try:
    import requests
except ImportError:
    print("Missing requests. Run: pip3 install requests"); sys.exit(1)

try:
    from supabase import create_client
except ImportError:
    print("Missing supabase. Run: pip3 install supabase"); sys.exit(1)

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

BASE_DIR    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(BASE_DIR, "stores.config.json")

def load_config():
    with open(CONFIG_PATH) as f:
        return json.load(f)

def fmt(n):
    if n >= 1_000_000: return f"${n/1_000_000:.1f}M"
    if n >= 1_000:     return f"${n/1_000:.0f}K"
    return f"${n:.0f}"

def pct(a, b):
    if b == 0: return None
    return ((a - b) / b) * 100

def arrow(v):
    if v is None: return ""
    return f"▲ +{v:.1f}%" if v >= 0 else f"▼ {v:.1f}%"

def build_html(db, brands_cfg):
    today     = date.today()
    week_end  = today - timedelta(days=today.weekday() + 1)  # last Sunday
    week_start = week_end - timedelta(days=6)

    summaries = db.table("brand_summary").select("*").execute().data or []
    monthly   = db.table("brand_monthly").select("*").execute().data or []
    google    = db.table("google_ads").select("*").execute().data or []
    meta      = db.table("meta_ads").select("*").execute().data or []

    LATEST  = "2026-05"
    PREV_MO = "2026-04"

    summary_map = {s["brand_id"]: s for s in summaries}

    rows_html = ""
    top_brand = None
    top_rev   = 0
    biggest_mover = None
    biggest_mom   = None

    for i, brand_cfg in enumerate(brands_cfg):
        if not brand_cfg.get("live", True):
            continue
        s = summary_map.get(i)
        if not s:
            continue

        rev  = s.get("last_month_rev", 0)
        mom  = s.get("mom_growth", 0)
        fy   = s.get("fy_revenue", 0)

        gRow = next((r for r in google if r["brand_id"] == i and r["month_key"] == LATEST), None)
        mRow = next((r for r in meta   if r["brand_id"] == i and r["month_key"] == LATEST), None)
        gRoas = gRow["roas"] if gRow else None
        mRoas = (mRow["revenue"] / mRow["spend"]) if mRow and mRow["spend"] > 0 else None
        blended_sp = (gRow["spend"] if gRow else 0) + (mRow["spend"] if mRow else 0)
        blended_rv = ((gRow["roas"] * gRow["spend"]) if gRow else 0) + (mRow["revenue"] if mRow else 0)
        blended_roas = blended_rv / blended_sp if blended_sp > 0 else None

        mom_color   = "#2dc8a5" if mom >= 0 else "#ef4444"
        roas_str    = f"{blended_roas:.1f}×" if blended_roas else "—"
        roas_color  = "#ef4444" if blended_roas and blended_roas < 1.5 else "#374151"

        rows_html += f"""
        <tr style="border-bottom:1px solid #f3f4f6">
          <td style="padding:10px 16px;font-weight:600;color:#374151">{brand_cfg['name']}</td>
          <td style="padding:10px 16px;text-align:right;color:#374151">{fmt(fy)}</td>
          <td style="padding:10px 16px;text-align:right;color:#374151">{fmt(rev)}</td>
          <td style="padding:10px 16px;text-align:right;font-weight:600;color:{mom_color}">{arrow(mom)}</td>
          <td style="padding:10px 16px;text-align:right;color:{roas_color};font-weight:600">{roas_str}</td>
        </tr>"""

        if rev > top_rev:
            top_rev   = rev
            top_brand = brand_cfg["name"]
        if biggest_mom is None or abs(mom) > abs(biggest_mom):
            biggest_mom   = mom
            biggest_mover = brand_cfg["name"]

    total_fy  = sum(s.get("fy_revenue", 0) for s in summaries)
    total_rev = sum(s.get("last_month_rev", 0) for s in summaries)

    highlights = f"""
    <p>🏆 <strong>Top brand this month:</strong> {top_brand or "—"} ({fmt(top_rev)})</p>
    <p>{'📈' if (biggest_mom or 0) >= 0 else '📉'} <strong>Biggest mover:</strong> {biggest_mover or "—"} ({arrow(biggest_mom)})</p>
    <p>💰 <strong>Portfolio FY revenue:</strong> {fmt(total_fy)}</p>
    """

    return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#374151;margin:0;padding:0}}</style></head>
<body style="background:#f9fafb">
<div style="max-width:700px;margin:32px auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
  <div style="background:#2e4057;padding:24px 32px">
    <h1 style="color:white;margin:0;font-size:20px;font-weight:600">Coolkidz Weekly Digest</h1>
    <p style="color:rgba(255,255,255,.6);margin:4px 0 0;font-size:13px">Week ending {week_end.strftime('%d %B %Y')}</p>
  </div>
  <div style="padding:24px 32px;border-bottom:1px solid #f3f4f6">
    {highlights}
  </div>
  <div style="padding:0">
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead>
        <tr style="background:#f8fafc">
          <th style="padding:10px 16px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;font-weight:600">Brand</th>
          <th style="padding:10px 16px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;font-weight:600">FY Revenue</th>
          <th style="padding:10px 16px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;font-weight:600">May Revenue</th>
          <th style="padding:10px 16px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;font-weight:600">MoM</th>
          <th style="padding:10px 16px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;font-weight:600">Blended ROAS</th>
        </tr>
      </thead>
      <tbody>{rows_html}</tbody>
    </table>
  </div>
  <div style="padding:20px 32px;text-align:center;font-size:12px;color:#9ca3af;border-top:1px solid #f3f4f6">
    Coolkidz Australia · All figures ex-GST · <a href="https://brand-dashboard-two-eta.vercel.app" style="color:#6366f1">View full dashboard</a>
  </div>
</div>
</body>
</html>"""

def send_email(api_key, to_emails, subject, html):
    resp = requests.post(
        "https://api.resend.com/emails",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={
            "from": "Coolkidz Dashboard <digest@coolkidz.com.au>",
            "to": to_emails if isinstance(to_emails, list) else [to_emails],
            "subject": subject,
            "html": html,
        },
        timeout=20,
    )
    resp.raise_for_status()
    return resp.json()

def main():
    config   = load_config()
    api_key  = config.get("resendApiKey")
    to_email = config.get("digestEmail", "mel@coolkidz.com.au")
    brands   = config.get("brands", [])

    if not api_key:
        print("No resendApiKey in stores.config.json.")
        print("Get a free key at resend.com and add: \"resendApiKey\": \"re_...\"")
        sys.exit(1)

    url = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    db  = create_client(url, key)

    today   = date.today()
    subject = f"Coolkidz Weekly Digest · {today.strftime('%d %b %Y')}"

    print("Building digest...")
    html = build_html(db, brands)

    print(f"Sending to {to_email}...")
    result = send_email(api_key, to_email, subject, html)
    print(f"✓ Sent! ID: {result.get('id')}")

if __name__ == "__main__":
    main()
