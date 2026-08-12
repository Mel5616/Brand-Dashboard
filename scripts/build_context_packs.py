#!/usr/bin/env python3
"""
Weekly Command, stage 1 — nightly brand context packs.

For each brand, builds one JSON snapshot from data already synced into
Supabase (no external API calls) and upserts it into brand_context_packs,
keyed on (brand_id, generated_at). Idempotent: safe to re-run same-day.

Deliberately renders a field as missing/null (TBC downstream) rather than
guessing when no reliable source exists — see the two "no source yet"
blocks below. Never invent a number here; that's the one rule this whole
system depends on.

Table (run once in Supabase): supabase/weekly_command_context_packs.sql

Run: python3 scripts/build_context_packs.py
"""

import os, sys, json, ssl, urllib.request, urllib.parse
from datetime import date, timedelta

BASE_DIR    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(BASE_DIR, "stores.config.json")
ENV_PATH    = os.path.join(BASE_DIR, ".env.local")
CTX = ssl.create_default_context()
KEEP_PACKS  = 7  # nights of history retained per brand

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

def sb_headers(extra=None):
    h = {"apikey": ANON_KEY or SUPABASE_SVC_KEY, "Authorization": f"Bearer {SUPABASE_SVC_KEY}"}
    if extra:
        h.update(extra)
    return h

def sb_get(table, query):
    url = f"{SUPABASE_URL}/rest/v1/{table}?{query}"
    req = urllib.request.Request(url, headers=sb_headers())
    try:
        with urllib.request.urlopen(req, context=CTX, timeout=30) as r:
            return json.loads(r.read().decode() or "[]")
    except urllib.error.HTTPError as e:
        print(f"    GET {table}: {e.code} {e.read().decode()[:200]}")
        return []

def sb_upsert(table, rows, on_conflict):
    if not rows:
        return
    req = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/{table}?on_conflict={on_conflict}",
        data=json.dumps(rows).encode(), method="POST",
        headers=sb_headers({"Content-Type": "application/json", "Prefer": "resolution=merge-duplicates"}))
    try:
        with urllib.request.urlopen(req, context=CTX, timeout=30) as r:
            return r.status
    except urllib.error.HTTPError as e:
        print(f"    POST {table}: {e.code} {e.read().decode()[:200]}")

def sb_delete(table, query):
    req = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/{table}?{query}", method="DELETE", headers=sb_headers())
    try:
        urllib.request.urlopen(req, context=CTX, timeout=30)
    except urllib.error.HTTPError as e:
        print(f"    DELETE {table}: {e.code} {e.read().decode()[:200]}")

def months_back(mk, n):
    y, m = int(mk[:4]), int(mk[5:7])
    for _ in range(n):
        m -= 1
        if m == 0:
            m, y = 12, y - 1
    return f"{y:04d}-{m:02d}"

def sum_val(rows, key="value"):
    return round(sum(float(r.get(key) or 0) for r in rows), 2)

# Brand name -> Briefing Engine slug, for tier lookup. Only brands with a
# brand_profiles row get a real tier; everyone else renders tier: null (TBC),
# never a guessed letter.
SLUG_OF = {
    "Nanit": "nanit", "Magic": "magic", "Hannie": "hannie", "Gaia Baby": "gaia-baby",
    "WonderFold": "wonderfold", "UPPAbaby": "uppababy", "ZAZU": "zazu", "MiaMily": "miamily",
    "Frida": "frida", "Matchstick Monkey": "matchstick-monkey", "Mamave": "mamave",
}

# channel_sales.brand spells three names differently from stores.config.json
# (confirmed against real rows — not a guess): "Gaia" not "Gaia Baby",
# "Wonderfold" not "WonderFold", "Zazu" not "ZAZU".
CHANNEL_SALES_NAME = {"Gaia Baby": "Gaia", "WonderFold": "Wonderfold", "ZAZU": "Zazu"}

def build_pack(brand_id, name, tiers, today, this_mk, prior_mks, ly_mks):
    pack = {"brand": name, "tier": tiers.get(SLUG_OF.get(name), None),
            "generated_at": today.isoformat()}

    # ── Performance by channel (channel_sales: real customer_group split —
    # Website Sales / Amazon / Baby Bunting / Specialty / Pharmacy / Wholesale
    # / Partnerships / etc. — this month vs prior 3mo vs same 3mo last year) ──
    cs_name = CHANNEL_SALES_NAME.get(name, name)
    cur  = sb_get("channel_sales", f"brand=eq.{urllib.parse.quote(cs_name)}&month_key=in.({','.join(prior_mks[:3])})&select=customer_group,value")
    prev = sb_get("channel_sales", f"brand=eq.{urllib.parse.quote(cs_name)}&month_key=in.({','.join(prior_mks[3:6])})&select=customer_group,value") if len(prior_mks) >= 6 else []
    ly   = sb_get("channel_sales", f"brand=eq.{urllib.parse.quote(cs_name)}&month_key=in.({','.join(ly_mks)})&select=customer_group,value") if ly_mks else []
    groups = sorted(set(r["customer_group"] for r in cur))
    by_channel = []
    for g in groups:
        c = sum_val([r for r in cur if r["customer_group"] == g])
        p = sum_val([r for r in prev if r["customer_group"] == g])
        l = sum_val([r for r in ly if r["customer_group"] == g])
        by_channel.append({
            "channel": g, "revenue": c,
            "vs_prior_12w": round((c - p) / p * 100, 1) if p else None,
            "vs_ly": round((c - l) / l * 100, 1) if l else None,
        })
    pack["performance"] = {"window": f"{prior_mks[2]} to {prior_mks[0]}", "by_channel": by_channel}

    # ── Top / bottom SKUs by units (brand_product_units has no revenue
    # column — ranking is unit-based; revenue is null/TBC per SKU) ──
    units = sb_get("brand_product_units", f"brand_id=eq.{brand_id}&month_key=eq.{this_mk}&select=sku,label,units")
    ranked = sorted(units, key=lambda r: -r["units"])
    pack["top_skus"] = [{"sku": r["sku"], "name": r["label"], "units": r["units"], "revenue": None} for r in ranked[:5]]
    pack["bottom_skus"] = [{"sku": r["sku"], "name": r["label"], "units": r["units"], "revenue": None} for r in ranked[-5:]] if len(ranked) > 5 else []

    # ── Stock: no per-SKU on-hand/weeks-cover source exists anywhere in the
    # dashboard yet (checked — only stock_alerts, which is event-based, not
    # levels). Left empty rather than guessed. ──
    pack["stock"] = []

    # ── Promos (promotions table — live rows are the source of truth) ──
    promos = sb_get("promotions", f"brand_id=eq.{brand_id}&select=note,channel,tier,period_start,period_end&order=period_start.asc")
    live, upcoming = [], []
    horizon = (today + timedelta(days=30)).isoformat()
    for p in promos:
        item = {"name": p.get("note") or p.get("channel") or "Promotion", "mechanic": p.get("channel") or "TBC",
                 "start": p["period_start"], "end": p["period_end"], "channels": [p["channel"]] if p.get("channel") else []}
        if p["period_start"] <= today.isoformat() <= (p["period_end"] or p["period_start"]):
            live.append(item)
        elif today.isoformat() < p["period_start"] <= horizon:
            upcoming.append({"name": item["name"], "mechanic": item["mechanic"], "start": item["start"], "end": item["end"]})
    pack["promos"] = {"live": live, "upcoming_30d": upcoming}

    # ── Calendar commitments (calendar_events — brand-specific + company-wide
    # rows with brand_id null, e.g. tradeshows). Next 6 months. Type is a
    # light keyword heuristic on the title, not a stored classification. ──
    events = sb_get("calendar_events", f"or=(brand_id.eq.{brand_id},brand_id.is.null)&start_date=gte.{today.isoformat()}&start_date=lte.{(today + timedelta(days=180)).isoformat()}&select=title,start_date&order=start_date.asc")
    def ev_type(title):
        t = title.lower()
        if "expo" in t or "trade" in t: return "trade"
        if "launch" in t: return "launch"
        return "event"
    pack["calendar_commitments"] = [{"name": e["title"], "date": e["start_date"], "type": ev_type(e["title"])} for e in events]

    # ── Budget (budget_topups = allocated, marketing_actuals = spent, both
    # real tables already used by the Budget tab — not TBC) ──
    alloc = sb_get("budget_topups", f"brand_id=eq.{brand_id}&month_key=eq.{this_mk}&select=amount")
    spent = sb_get("marketing_actuals", f"brand_id=eq.{brand_id}&month_key=eq.{this_mk}&select=spend")
    allocated = sum_val(alloc, "amount") if alloc else None
    spent_td = sum_val(spent, "spend")
    pack["budget"] = {"period": this_mk, "allocated": allocated, "spent_to_date": spent_td,
                       "remaining": round(allocated - spent_td, 2) if allocated is not None else None}

    # ── Retail partner status: no qualitative source (range review pending,
    # credit hold, etc.) exists yet. Left empty rather than guessed — add a
    # small manual-entry table if this needs tracking. ──
    pack["retail"] = []

    pack["voice_ref"] = f"brand_profiles:{SLUG_OF.get(name)}" if SLUG_OF.get(name) else None
    return pack

def main():
    with open(CONFIG_PATH) as f:
        config = json.load(f)
    brands = [(i, b["name"]) for i, b in enumerate(config.get("brands", []))]
    today = date.today()
    this_mk = today.strftime("%Y-%m")
    prior_mks = [months_back(this_mk, n) for n in range(0, 6)]   # this_mk .. -5
    ly_mks = [months_back(this_mk, n) for n in range(12, 15)]    # same 3mo last year

    profiles = sb_get("brand_profiles", "select=slug,tier")
    tiers = {p["slug"]: p["tier"] for p in profiles}

    print(f"Building context packs for {len(brands)} brand(s), {today.isoformat()}...\n")
    rows = []
    for brand_id, name in brands:
        try:
            pack = build_pack(brand_id, name, tiers, today, this_mk, prior_mks, ly_mks)
            rows.append({"brand_id": brand_id, "generated_at": today.isoformat(), "pack": pack})
            ch = len(pack["performance"]["by_channel"])
            print(f"  {name}: tier {pack['tier'] or 'TBC'} · {ch} channel(s) · "
                  f"{len(pack['top_skus'])} top SKUs · {len(pack['promos']['live'])} live promo(s) · "
                  f"{len(pack['calendar_commitments'])} calendar item(s) · "
                  f"budget {'$' + str(pack['budget']['allocated']) if pack['budget']['allocated'] is not None else 'TBC'}")
        except Exception as e:
            print(f"  ERROR {name}: {e}")

    sb_upsert("brand_context_packs", rows, "brand_id,generated_at")

    # Keep only the last KEEP_PACKS nights per brand.
    for brand_id, name in brands:
        dates = sb_get("brand_context_packs", f"brand_id=eq.{brand_id}&select=generated_at&order=generated_at.desc")
        stale = [d["generated_at"] for d in dates[KEEP_PACKS:]]
        if stale:
            sb_delete("brand_context_packs", f"brand_id=eq.{brand_id}&generated_at=in.({','.join(stale)})")

    print("\nDone.")

if __name__ == "__main__":
    from sync_status_util import record
    try:
        main(); record("Context Packs", True)
    except Exception as e:
        record("Context Packs", False, str(e)); raise
