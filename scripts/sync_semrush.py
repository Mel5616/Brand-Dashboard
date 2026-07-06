#!/usr/bin/env python3
"""
SEMrush sync — per-brand organic visibility (AU database) into Supabase.

For each brand with a `gscProperty` in stores.config.json, pulls the SEMrush
domain overview (organic keywords, estimated traffic, traffic value) and top
organic competitors. Snapshots are stamped with the current month_key so a
trend builds over time. Needs `semrushApiKey` in stores.config.json.

Tables (run once in Supabase):
  create table if not exists semrush_metrics (
    brand_id int not null, month_key text not null,
    organic_keywords int default 0, organic_traffic int default 0,
    traffic_value numeric default 0, semrush_rank int default 0,
    captured_at timestamptz default now(), primary key (brand_id, month_key));
  alter table semrush_metrics disable row level security;
  create table if not exists semrush_competitors (
    brand_id int not null, month_key text not null, competitor text not null,
    relevance numeric default 0, common_keywords int default 0,
    organic_keywords int default 0, organic_traffic int default 0,
    primary key (brand_id, month_key, competitor));
  alter table semrush_competitors disable row level security;

Run: python3 scripts/sync_semrush.py
"""

import os, sys, json, ssl, urllib.request, urllib.parse
from datetime import date

BASE_DIR    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(BASE_DIR, "stores.config.json")
ENV_PATH    = os.path.join(BASE_DIR, ".env.local")
DATABASE    = "au"
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

SUPABASE_URL     = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_SVC_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
ANON_KEY         = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")

def sb_upsert(table, rows, on_conflict):
    if not rows:
        return
    req = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/{table}?on_conflict={on_conflict}",
        data=json.dumps(rows).encode(), method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("Authorization", f"Bearer {SUPABASE_SVC_KEY}")
    req.add_header("apikey", ANON_KEY or SUPABASE_SVC_KEY)
    req.add_header("Prefer", "resolution=merge-duplicates")
    try:
        with urllib.request.urlopen(req, context=CTX, timeout=30) as r:
            return r.status
    except urllib.error.HTTPError as e:
        print(f"    Supabase {table}: {e.code} {e.read().decode()[:200]}")

def semrush(key, params):
    url = "https://api.semrush.com/?" + urllib.parse.urlencode(dict(params, key=key))
    try:
        text = urllib.request.urlopen(url, context=CTX, timeout=30).read().decode()
    except urllib.error.HTTPError as e:
        return None, f"{e.code} {e.read().decode()[:120]}"
    if not text or text.startswith("ERROR"):
        return None, text.strip()
    lines = [l for l in text.splitlines() if l.strip()]
    if len(lines) < 2:
        return [], None
    head = lines[0].split(";")
    return [dict(zip(head, l.split(";"))) for l in lines[1:]], None

def domain_of(gsc_property):
    d = gsc_property.replace("https://", "").replace("http://", "").replace("sc-domain:", "").rstrip("/")
    return d[4:] if d.startswith("www.") else d

def sync_brand(key, brand_id, name, domain, mk):
    print(f"  {name} ({domain}) ...", flush=True)
    rows, err = semrush(key, {"type": "domain_ranks", "domain": domain, "database": DATABASE,
        "export_columns": "Dn,Rk,Or,Ot,Oc"})
    if err or not rows:
        print(f"    no overview ({err or 'empty'})")
        return
    r = rows[0]
    metric = {"brand_id": brand_id, "month_key": mk,
        "organic_keywords": int(float(r.get("Organic Keywords", 0) or 0)),
        "organic_traffic":  int(float(r.get("Organic Traffic", 0) or 0)),
        "traffic_value":    round(float(r.get("Organic Cost", 0) or 0), 2),
        "semrush_rank":     int(float(r.get("Rank", 0) or 0)),
        "captured_at":      date.today().isoformat()}
    sb_upsert("semrush_metrics", [metric], "brand_id,month_key")

    comps, cerr = semrush(key, {"type": "domain_organic_organic", "domain": domain, "database": DATABASE,
        "export_columns": "Dn,Cr,Np,Or,Ot", "display_limit": "6"})
    crows = []
    for c in (comps or []):
        if c.get("Domain", "").lower() == domain.lower():
            continue
        crows.append({"brand_id": brand_id, "month_key": mk, "competitor": c.get("Domain", ""),
            "relevance": round(float(c.get("Competitor Relevance", 0) or 0), 2),
            "common_keywords": int(float(c.get("Common Keywords", 0) or 0)),
            "organic_keywords": int(float(c.get("Organic Keywords", 0) or 0)),
            "organic_traffic": int(float(c.get("Organic Traffic", 0) or 0))})
    sb_upsert("semrush_competitors", crows, "brand_id,month_key,competitor")

    # Top organic keywords (with search volume + CPC + ranking URL)
    kws, _ = semrush(key, {"type": "domain_organic", "domain": domain, "database": DATABASE,
        "export_columns": "Ph,Po,Nq,Cp,Tr,Ur", "display_limit": "100", "display_sort": "tr_desc"})
    krows, seen = [], set()
    for w in (kws or []):
        ph = w.get("Keyword", "")
        if not ph or ph in seen:  # dedupe: a phrase can map to several URLs
            continue
        seen.add(ph)
        krows.append({"brand_id": brand_id, "month_key": mk, "phrase": ph,
            "position": int(float(w.get("Position", 0) or 0)),
            "search_volume": int(float(w.get("Search Volume", 0) or 0)),
            "cpc": round(float(w.get("CPC", 0) or 0), 2),
            "traffic_pct": round(float(w.get("Traffic (%)", 0) or 0), 2),
            "url": w.get("Url", "")})
    sb_upsert("semrush_keywords", krows, "brand_id,month_key,phrase")

    # Top pages by organic traffic
    pgs, _ = semrush(key, {"type": "domain_organic_unique", "domain": domain, "database": DATABASE,
        "export_columns": "Ur,Pc,Tg", "display_limit": "15"})
    prows = [{"brand_id": brand_id, "month_key": mk, "url": p.get("Url", ""),
        "keywords": int(float(p.get("Number of Keywords", 0) or 0)),
        "traffic": int(float(p.get("Traffic", 0) or 0))} for p in (pgs or []) if p.get("Url")]
    sb_upsert("semrush_pages", prows, "brand_id,month_key,url")

    print(f"    {metric['organic_keywords']:,} keywords · {metric['organic_traffic']:,} traffic · ${metric['traffic_value']:,.0f} value · {len(crows)} competitors · {len(krows)} kw · {len(prows)} pages", flush=True)

def main():
    with open(CONFIG_PATH) as f:
        config = json.load(f)
    key = config.get("semrushApiKey")
    if not key:
        print("No semrushApiKey in stores.config.json"); sys.exit(1)
    brands = [(i, b) for i, b in enumerate(config.get("brands", [])) if b.get("gscProperty")]
    mk = date.today().strftime("%Y-%m")
    print(f"Syncing SEMrush ({DATABASE}) for {len(brands)} brand(s), month {mk}...\n")
    for i, b in brands:
        try:
            sync_brand(key, i, b["name"], domain_of(b["gscProperty"]), mk)
        except Exception as e:
            print(f"  ERROR {b['name']}: {e}")
    print("\nDone.")

if __name__ == "__main__":
    from sync_status_util import record
    try:
        main(); record("Semrush", True)
    except Exception as e:
        record("Semrush", False, str(e)); raise
