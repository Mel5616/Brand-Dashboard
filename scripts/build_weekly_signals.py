#!/usr/bin/env python3
"""
Weekly Command, stage 2 — exception signals.

Diffs today's brand_context_packs snapshot against the previous one and
writes only the exceptions that crossed a threshold. Silence is a valid
output: a brand with nothing wrong gets no rows, not padding.

Signal types implemented against real, available data:
  - sales:   a channel's revenue moved >20% vs the prior window (noise
             floor $500, so a tiny channel's tiny swing doesn't flag), or
             an SKU that was in yesterday's top 5 (by units) has dropped out.
  - promo:   a live promo ends within 7 days with nothing else scheduled
             in the same channel to follow it.

Two of the five signal types from the original brief are NOT implemented
here, on purpose, rather than faked:
  - stock:    no per-SKU on-hand/weeks-cover source exists anywhere in the
              dashboard yet (brand_context_packs.pack.stock is always []).
  - delivery: "brief unopened 48h after send" needs Asana task open-tracking,
              which doesn't exist until stage 4 (Asana write-back) is built.
  - channel:  "retail partner status change" needs the retail-partner-status
              table flagged as missing in stage 1 — same gap, not yet filled.

Thresholds are hardcoded below per the brief's own instruction to "accept
defaults for two weeks, then tune" — move to command_thresholds once real
signal volume shows what's noise and what's not.

Run: python3 scripts/build_weekly_signals.py   (after build_context_packs.py)
"""

import os, sys, json, ssl, urllib.request, urllib.parse
from datetime import date, timedelta

BASE_DIR    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(BASE_DIR, "stores.config.json")
ENV_PATH    = os.path.join(BASE_DIR, ".env.local")
CTX = ssl.create_default_context()

SALES_MOVE_PCT     = 20
SALES_NOISE_FLOOR  = 500
PROMO_LOOKAHEAD_DAYS = 7

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
    req = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/{table}?{query}", headers=sb_headers())
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

def signal(brand_id, tier, sig_type, key, headline, detail, action):
    return {"brand_id": brand_id, "tier": tier, "type": sig_type, "signal_key": key[:200],
            "headline": headline[:200], "detail": detail, "suggested_action": action,
            "updated_at": date.today().isoformat() + "T00:00:00Z"}

def sales_signals(brand_id, name, tier, today_pack, prior_pack):
    out = []
    for ch in today_pack.get("performance", {}).get("by_channel", []):
        rev, pct = ch.get("revenue", 0), ch.get("vs_prior_12w")
        if pct is None or rev < SALES_NOISE_FLOOR or abs(pct) < SALES_MOVE_PCT:
            continue
        direction = "up" if pct > 0 else "down"
        out.append(signal(brand_id, tier, "sales", f"channel:{ch['channel']}",
            f"{name} · {ch['channel']} {direction} {abs(pct):.0f}%",
            f"${rev:,.0f} this period vs prior window.",
            "Check what drove the move — worth doubling down or intervening?" if direction == "down" else "Worth a follow-up push while it's working?"))

    if prior_pack:
        prior_top = {s["sku"] for s in prior_pack.get("top_skus", [])}
        today_top = {s["sku"] for s in today_pack.get("top_skus", [])}
        dropped = prior_top - today_top
        for sku in dropped:
            prior_name = next((s["name"] for s in prior_pack["top_skus"] if s["sku"] == sku), sku)
            out.append(signal(brand_id, tier, "sales", f"top5drop:{sku}",
                f"{name} · {prior_name} dropped out of the top 5",
                "Was in yesterday's top 5 SKUs by units, isn't today.", "Check stock and any recent pricing/promo change."))
    return out

def promo_signals(brand_id, name, tier, today_pack):
    out = []
    live = today_pack.get("promos", {}).get("live", [])
    upcoming = today_pack.get("promos", {}).get("upcoming_30d", [])
    horizon = (date.today() + timedelta(days=PROMO_LOOKAHEAD_DAYS)).isoformat()
    for p in live:
        end = p.get("end")
        if not end or end > horizon:
            continue
        channels = set(p.get("channels") or [])
        follows = any(u["start"] <= end or (u["start"] <= (date.fromisoformat(end) + timedelta(days=1)).isoformat())
                       for u in upcoming)
        if not follows:
            out.append(signal(brand_id, tier, "promo", f"gap:{p['name']}:{end}",
                f"{name} · {p['name']} ends {end} with nothing scheduled after",
                f"Channel: {', '.join(channels) or 'TBC'}.", "Line up the next promo or confirm the gap is deliberate."))
    return out

def main():
    with open(CONFIG_PATH) as f:
        config = json.load(f)
    brands = [(i, b["name"]) for i, b in enumerate(config.get("brands", []))]

    today = date.today().isoformat()
    rows = []
    for brand_id, name in brands:
        packs = sb_get("brand_context_packs", f"brand_id=eq.{brand_id}&select=generated_at,pack&order=generated_at.desc&limit=2")
        if not packs:
            continue
        today_pack = packs[0]["pack"]
        prior_pack = packs[1]["pack"] if len(packs) > 1 else None
        tier = today_pack.get("tier")

        sigs = sales_signals(brand_id, name, tier, today_pack, prior_pack) + promo_signals(brand_id, name, tier, today_pack)
        rows.extend(sigs)
        if sigs:
            print(f"  {name}: {len(sigs)} signal(s)")

    sb_upsert("brand_signals", rows, "brand_id,type,signal_key")
    total = len(rows)
    print(f"\n{total} signal(s) upserted" if total else "\nNo exceptions today — silence is a valid output.")

if __name__ == "__main__":
    from sync_status_util import record
    try:
        main(); record("Weekly Signals", True)
    except Exception as e:
        record("Weekly Signals", False, str(e)); raise
