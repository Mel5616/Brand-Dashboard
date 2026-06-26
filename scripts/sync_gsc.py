#!/usr/bin/env python3
"""
Google Search Console sync — per-brand organic search performance into Supabase.

For each brand with a `gscProperty` in stores.config.json (URL-prefix like
"https://nanit.com.au/" or a domain property like "sc-domain:nanit.com.au"),
pulls monthly totals + top queries, and writes an AI summary per brand.

Setup:
  1. Enable the Search Console API in the Google Cloud project.
  2. Add the service account (credentials.json client_email) as a user on each
     Search Console property.
  3. Tables (run once in Supabase):

     create table if not exists gsc_metrics (
       brand_id int not null, month_key text not null,
       clicks int default 0, impressions int default 0,
       ctr numeric default 0, position numeric default 0,
       primary key (brand_id, month_key));
     alter table gsc_metrics disable row level security;

     create table if not exists gsc_queries (
       brand_id int not null, month_key text not null, query text not null,
       clicks int default 0, impressions int default 0,
       ctr numeric default 0, position numeric default 0,
       primary key (brand_id, month_key, query));
     alter table gsc_queries disable row level security;

     create table if not exists gsc_insights (
       brand_id int primary key, generated_at timestamptz default now(),
       content text);
     alter table gsc_insights disable row level security;

  4. pip3 install google-auth anthropic
  5. python3 scripts/sync_gsc.py
"""

import os, sys, json, ssl, urllib.request, urllib.parse
from calendar import monthrange

BASE_DIR    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(BASE_DIR, "stores.config.json")
ENV_PATH    = os.path.join(BASE_DIR, ".env.local")

MONTH_KEYS = [
    "2025-07","2025-08","2025-09","2025-10","2025-11","2025-12",
    "2026-01","2026-02","2026-03","2026-04","2026-05","2026-06",
]
TOP_QUERIES = 30

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

SUPABASE_URL     = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_SVC_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
ANON_KEY         = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
CTX = ssl.create_default_context()

def sb_upsert(table, rows, on_conflict):
    if not rows:
        return
    url = f"{SUPABASE_URL}/rest/v1/{table}?on_conflict={on_conflict}"
    req = urllib.request.Request(url, data=json.dumps(rows).encode(), method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("Authorization", f"Bearer {SUPABASE_SVC_KEY}")
    req.add_header("apikey", ANON_KEY or SUPABASE_SVC_KEY)
    req.add_header("Prefer", "resolution=merge-duplicates")
    try:
        with urllib.request.urlopen(req, context=CTX, timeout=30) as r:
            return r.status
    except urllib.error.HTTPError as e:
        print(f"    Supabase {table}: {e.code} {e.read().decode()[:200]}")

def gsc_token():
    from google.oauth2 import service_account
    import google.auth.transport.requests
    creds = service_account.Credentials.from_service_account_file(
        os.path.join(BASE_DIR, "credentials.json"),
        scopes=["https://www.googleapis.com/auth/webmasters.readonly"])
    creds.refresh(google.auth.transport.requests.Request())
    return creds.token

def gsc_query(token, site, body):
    enc = urllib.parse.quote(site, safe="")
    req = urllib.request.Request(
        f"https://searchconsole.googleapis.com/webmasters/v3/sites/{enc}/searchAnalytics/query",
        data=json.dumps(body).encode(), method="POST")
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, context=CTX, timeout=30) as r:
        return json.loads(r.read().decode())

def month_range(mk):
    y, m = int(mk[:4]), int(mk[5:7])
    return f"{y}-{m:02d}-01", f"{y}-{m:02d}-{monthrange(y, m)[1]:02d}"

def ai_summary(name, metrics, queries_latest, movers_up, movers_down):
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        return None
    try:
        import anthropic
    except ImportError:
        return None
    recent = [m for m in metrics if m["clicks"] or m["impressions"]][-3:]
    trend = "; ".join(f"{m['month_key']}: {m['clicks']} clicks, pos {m['position']:.1f}" for m in recent)
    top = ", ".join(f"{q['query']} (pos {q['position']:.1f})" for q in queries_latest[:8])
    up = ", ".join(f"{q['query']}" for q in movers_up[:5]) or "none"
    down = ", ".join(f"{q['query']}" for q in movers_down[:5]) or "none"
    prompt = (
        f"You are an SEO analyst for the brand {name}. Using Google Search Console data, write a brief, "
        f"plain summary for a marketing team. Australian English. Do not use em dashes. No apologies. "
        f"3 to 4 sentences on how organic search is tracking, then 2 short recommended actions as a list.\n\n"
        f"Recent monthly trend: {trend}\n"
        f"Top queries: {top}\n"
        f"Queries gaining position: {up}\n"
        f"Queries losing position: {down}\n")
    try:
        client = anthropic.Anthropic(api_key=key)
        msg = client.messages.create(model="claude-haiku-4-5-20251001", max_tokens=400,
            messages=[{"role": "user", "content": prompt}])
        return msg.content[0].text.strip()
    except Exception as e:
        print(f"    AI summary skipped: {e}")
        return None

def sync_brand(token, brand_id, name, site):
    print(f"  {name} ({site}) ...", flush=True)
    metrics, queries = [], []
    for mk in MONTH_KEYS:
        start, end = month_range(mk)
        try:
            tot = gsc_query(token, site, {"startDate": start, "endDate": end})
        except urllib.error.HTTPError as e:
            if e.code in (403, 401):
                print("    no access yet — share the property with the service account")
                return
            print(f"    {mk} totals error: {e.code}")
            continue
        row = (tot.get("rows") or [{}])[0]
        metrics.append({"brand_id": brand_id, "month_key": mk,
            "clicks": int(row.get("clicks", 0)), "impressions": int(row.get("impressions", 0)),
            "ctr": round(row.get("ctr", 0) * 100, 2), "position": round(row.get("position", 0), 1)})
        try:
            qd = gsc_query(token, site, {"startDate": start, "endDate": end, "dimensions": ["query"], "rowLimit": TOP_QUERIES})
        except urllib.error.HTTPError:
            qd = {}
        for q in qd.get("rows", []):
            queries.append({"brand_id": brand_id, "month_key": mk, "query": q["keys"][0],
                "clicks": int(q.get("clicks", 0)), "impressions": int(q.get("impressions", 0)),
                "ctr": round(q.get("ctr", 0) * 100, 2), "position": round(q.get("position", 0), 1)})

    sb_upsert("gsc_metrics", metrics, "brand_id,month_key")
    sb_upsert("gsc_queries", queries, "brand_id,month_key,query")

    # Movers: latest month vs previous, by query position (lower is better)
    months_with = [m["month_key"] for m in metrics if m["clicks"] or m["impressions"]]
    movers_up, movers_down, latest_q = [], [], []
    if months_with:
        latest = months_with[-1]
        latest_q = sorted([q for q in queries if q["month_key"] == latest], key=lambda x: -x["clicks"])
        if len(months_with) >= 2:
            prev = months_with[-2]
            pmap = {q["query"]: q["position"] for q in queries if q["month_key"] == prev}
            for q in latest_q:
                if q["query"] in pmap:
                    delta = pmap[q["query"]] - q["position"]  # positive = improved
                    if delta >= 1: movers_up.append(q)
                    elif delta <= -1: movers_down.append(q)
            movers_up.sort(key=lambda q: -q["clicks"]); movers_down.sort(key=lambda q: -q["clicks"])

    total_clicks = sum(m["clicks"] for m in metrics)
    print(f"    {total_clicks:,} clicks across the year, {len(latest_q)} queries this month", flush=True)

    summary = ai_summary(name, metrics, latest_q, movers_up, movers_down)
    if summary:
        sb_upsert("gsc_insights", [{"brand_id": brand_id, "content": summary,
            "generated_at": __import__("datetime").datetime.utcnow().isoformat()}], "brand_id")
        print("    AI summary written", flush=True)

def main():
    with open(CONFIG_PATH) as f:
        config = json.load(f)
    brands = [(i, b) for i, b in enumerate(config.get("brands", [])) if b.get("gscProperty")]
    if not brands:
        print("No brands have gscProperty set."); sys.exit(1)
    token = gsc_token()
    print(f"Syncing Search Console for {len(brands)} brand(s)...\n")
    for i, b in brands:
        try:
            sync_brand(token, i, b["name"], b["gscProperty"])
        except Exception as e:
            print(f"  ERROR {b['name']}: {e}")
    print("\nDone.")

if __name__ == "__main__":
    main()
