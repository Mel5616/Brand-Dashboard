#!/usr/bin/env python3
"""
AI insights generator. Reads the data the dashboard already holds in Supabase
(sales, Google, Meta, Klaviyo, Search Console, SEMrush) and writes:
  - a per-brand cross-channel "Brand Health" summary
  - a portfolio digest (brand_id = -1)
into the brand_insights table. Costs Anthropic tokens only, no SEMrush units.

Table (run once in Supabase):
  create table if not exists brand_insights (
    brand_id int primary key, generated_at timestamptz default now(), content text);
  alter table brand_insights disable row level security;

Run: python3 scripts/generate_insights.py
"""

import os, sys, json, ssl, urllib.request
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_PATH = os.path.join(BASE_DIR, ".env.local")
CTX = ssl.create_default_context()

def load_env():
    if not os.path.exists(ENV_PATH):
        return
    with open(ENV_PATH) as f:
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
ANON = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")

def sb_get(path):
    req = urllib.request.Request(f"{URL}/rest/v1/{path}")
    req.add_header("apikey", ANON or KEY); req.add_header("Authorization", f"Bearer {KEY}")
    try:
        with urllib.request.urlopen(req, context=CTX, timeout=30) as r:
            return json.loads(r.read().decode() or "[]")
    except urllib.error.HTTPError:
        return []

def sb_upsert(table, rows):
    req = urllib.request.Request(f"{URL}/rest/v1/{table}?on_conflict=brand_id",
        data=json.dumps(rows).encode(), method="POST")
    req.add_header("Content-Type", "application/json"); req.add_header("apikey", ANON or KEY)
    req.add_header("Authorization", f"Bearer {KEY}"); req.add_header("Prefer", "resolution=merge-duplicates")
    try:
        with urllib.request.urlopen(req, context=CTX, timeout=30) as r:
            return r.status
    except urllib.error.HTTPError as e:
        print(f"  upsert {table}: {e.code} {e.read().decode()[:160]}")

def latest(rows, bid, keys=("month_key",)):
    rs = [r for r in rows if r.get("brand_id") == bid]
    if not rs:
        return None
    return sorted(rs, key=lambda r: r.get("month_key", ""))[-1]

def money(n):
    n = float(n or 0)
    return f"${n/1000:.0f}K" if n >= 1000 else f"${n:.0f}"

def call_ai(client, prompt, max_tokens=420):
    msg = client.messages.create(model="claude-haiku-4-5-20251001", max_tokens=max_tokens,
        messages=[{"role": "user", "content": prompt}])
    return msg.content[0].text.strip()

STYLE = ("Australian English. Do not use em dashes. No apologies, no preamble. "
         "Plain, direct, useful to a marketing team.")

def main():
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        print("No ANTHROPIC_API_KEY"); sys.exit(1)
    import anthropic
    client = anthropic.Anthropic(api_key=key)

    brands  = sb_get("brands?select=id,name&order=id")
    summ    = sb_get("brand_summary?select=brand_id,fy_revenue,last_month_rev,mom_growth,yoy_growth,last_month_label")
    google  = sb_get("google_ads?select=brand_id,month_key,spend,roas&order=month_key")
    meta    = sb_get("meta_ads?select=brand_id,month_key,spend,roas&order=month_key")
    klav    = sb_get("klaviyo_metrics?select=brand_id,month_key,revenue,open_rate,click_rate,emails_sent&order=month_key")
    gsc     = sb_get("gsc_metrics?select=brand_id,month_key,clicks,position&order=month_key")
    semrush = sb_get("semrush_metrics?select=brand_id,month_key,organic_keywords,traffic_value&order=month_key")

    print(f"Generating brand health summaries for {len(brands)} brands...\n")
    digest_lines = []
    for b in brands:
        bid, name = b["id"], b["name"]
        s = next((x for x in summ if x["brand_id"] == bid), {})
        g, m, k = latest(google, bid), latest(meta, bid), latest(klav, bid)
        gs, sr = latest(gsc, bid), latest(semrush, bid)
        rev = s.get("last_month_rev") or 0
        mom = s.get("mom_growth") or 0
        yoy = s.get("yoy_growth") or 0
        fy  = s.get("fy_revenue") or 0
        if not rev and not fy:
            continue
        facts = [
            f"Sales: last month {money(rev)}, MoM {mom:+.0f}%, YoY {yoy:+.0f}%, FY {money(fy)}.",
            f"Google Ads: spend {money(g['spend'])}, ROAS {(g.get('roas') or 0):.1f}x." if g and g.get("spend") else "Google Ads: no recent spend.",
            f"Meta Ads: spend {money(m['spend'])}, ROAS {(m.get('roas') or 0):.1f}x." if m and m.get("spend") else "Meta Ads: no recent spend.",
            f"Email: revenue {money(k['revenue'])}, open {(k.get('open_rate') or 0):.0f}%, click {(k.get('click_rate') or 0):.1f}%." if k and k.get("emails_sent") else "Email: little or no recent activity.",
            f"SEO: {gs['clicks']:,} organic clicks at avg position {(gs.get('position') or 0):.1f}." if gs and gs.get("clicks") else "SEO: no Search Console data.",
            f"SEMrush: {sr['organic_keywords']:,} keywords, traffic value {money(sr['traffic_value'])}/mo." if sr and sr.get("organic_keywords") else "",
        ]
        facts = [f for f in facts if f]
        digest_lines.append(f"{name}: sales MoM {mom:+.0f}%, " + (f"Meta ROAS {(m.get('roas') or 0):.1f}x, " if m and m.get('spend') else "") + (f"email {money(k['revenue'])}, " if k and k.get('emails_sent') else "") + (f"SEO {gs['clicks']:,} clicks" if gs and gs.get('clicks') else "no SEO"))
        prompt = (f"You are the marketing analyst for the brand {name}. Write a short cross-channel health read for the team. "
                  f"{STYLE} Three to four sentences covering how the brand is tracking across sales, paid, email and search, "
                  f"then one line starting with 'Priority:' naming the single most important action.\n\nData:\n" + "\n".join(facts))
        try:
            content = call_ai(client, prompt)
            sb_upsert("brand_insights", [{"brand_id": bid, "content": content, "generated_at": datetime.utcnow().isoformat()}])
            print(f"  {name}: written")
        except Exception as e:
            print(f"  {name}: skipped ({e})")

    # Portfolio digest (brand_id = -1)
    if digest_lines:
        prompt = (f"You are the head of marketing for a 12-brand baby and parenting portfolio. "
                  f"{STYLE} From the per-brand month-on-month snapshot below, write a portfolio digest: "
                  f"two sentences on the overall picture, then 4 to 6 bullet points ranked by what needs attention this month. "
                  f"Name brands. Be specific.\n\n" + "\n".join(digest_lines))
        try:
            content = call_ai(client, prompt, max_tokens=600)
            sb_upsert("brand_insights", [{"brand_id": -1, "content": content, "generated_at": datetime.utcnow().isoformat()}])
            print("\n  Portfolio digest: written")
        except Exception as e:
            print(f"\n  Portfolio digest skipped ({e})")
    print("\nDone.")

if __name__ == "__main__":
    main()
