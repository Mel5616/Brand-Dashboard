#!/usr/bin/env python3
"""
Generate a weekly AI insights brief from the dashboard data and store it in Supabase.

Pulls Sales, Budgets, Campaigns, and Tradeshow data, sends it to Claude, and
stores a concise meeting-ready summary in the `ai_insights` table. The dashboard
reads the latest row. Run on each sync (wired into sync.py) or standalone.

Setup:
  1. Get an API key at console.anthropic.com → API Keys.
     Add to .env.local (and Vercel env vars):
       ANTHROPIC_API_KEY=sk-ant-...

  2. pip3 install anthropic

  3. Run SQL in Supabase (first time only):
       CREATE TABLE IF NOT EXISTS ai_insights (
         id           BIGSERIAL PRIMARY KEY,
         generated_at TIMESTAMPTZ DEFAULT now(),
         period_label TEXT,
         content      TEXT NOT NULL,
         model        TEXT
       );
       ALTER TABLE ai_insights DISABLE ROW LEVEL SECURITY;

  4. python3 scripts/sync_insights.py

Environment: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
"""

import sys, os, json
from datetime import date, datetime, timedelta

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

try:
    from supabase import create_client
except ImportError:
    print("Missing supabase. Run: pip3 install supabase"); sys.exit(1)

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(BASE_DIR, ".env.local"))
    load_dotenv()
except ImportError:
    pass

CONFIG_PATH = os.path.join(BASE_DIR, "stores.config.json")

LATEST  = "2026-05"
PREV_MO = "2026-04"

BRAND_NAMES = {
    0: "Nanit", 1: "Magic", 2: "Hannie", 3: "Gaia Baby", 4: "WonderFold",
    5: "UPPAbaby", 6: "ZAZU", 7: "MiaMily", 8: "Frida", 9: "Coolkidz Australia",
    10: "Matchstick Monkey", 11: "Mamave", 12: "SmarTrike",
}


def fmt(n):
    if n is None: return "$0"
    if n >= 1_000_000: return f"${n/1_000_000:.2f}M"
    if n >= 1_000:     return f"${n/1_000:.0f}K"
    return f"${n:.0f}"


def gather_context(db):
    """Pull the numbers Claude needs into a compact text brief."""
    summaries = db.table("brand_summary").select("*").execute().data or []
    google    = db.table("google_ads").select("*").eq("month_key", LATEST).execute().data or []
    meta      = db.table("meta_ads").select("*").eq("month_key", LATEST).execute().data or []
    budgets   = db.table("marketing_budgets").select("*").execute().data or []
    actuals   = db.table("marketing_actuals").select("*").eq("month_key", LATEST).execute().data or []
    events    = db.table("calendar_events").select("*").execute().data or []
    shows     = db.table("tradeshows").select("*").execute().data or []

    google_by = {g["brand_id"]: g for g in google}
    meta_by   = {m["brand_id"]: m for m in meta}

    lines = []

    # ── Sales ───────────────────────────────────────────────────────────
    lines.append("## SALES (May 2026, ex-GST)")
    total_fy = sum(s.get("fy_revenue", 0) or 0 for s in summaries)
    total_mo = sum(s.get("last_month_rev", 0) or 0 for s in summaries)
    lines.append(f"Portfolio FY revenue: {fmt(total_fy)}; May revenue: {fmt(total_mo)}")
    for s in sorted(summaries, key=lambda x: x.get("last_month_rev", 0) or 0, reverse=True):
        bid  = s["brand_id"]
        name = BRAND_NAMES.get(bid, f"Brand {bid}")
        rev  = s.get("last_month_rev", 0) or 0
        mom  = s.get("mom_growth", 0) or 0
        fy   = s.get("fy_revenue", 0) or 0
        g    = google_by.get(bid)
        m    = meta_by.get(bid)
        g_roas = g["roas"] if g else 0
        m_roas = (m["revenue"] / m["spend"]) if m and m.get("spend", 0) > 0 else 0
        lines.append(
            f"- {name}: May {fmt(rev)} (MoM {mom:+.1f}%), FY {fmt(fy)}; "
            f"Google ROAS {g_roas:.2f}x, Meta ROAS {m_roas:.2f}x"
        )

    # ── Budgets ─────────────────────────────────────────────────────────
    if budgets:
        lines.append("\n## MARKETING BUDGET (May actuals vs monthly budget)")
        actual_by = {}
        for a in actuals:
            actual_by.setdefault(a["brand_id"], {})[a["channel"]] = a.get("spend", 0)
        for b in budgets:
            bid = b["brand_id"]
            name = BRAND_NAMES.get(bid, f"Brand {bid}")
            monthly = (b.get("annual_budget", 0) or 0) / 12
            spent = actual_by.get(bid, {}).get(b["channel"], 0)
            if monthly > 0:
                lines.append(f"- {name} / {b['channel']}: {fmt(spent)} of {fmt(monthly)} monthly")

    # ── Upcoming campaigns ──────────────────────────────────────────────
    today = date.today()
    horizon = today + timedelta(days=45)
    upcoming = []
    for e in events:
        try:
            sd = date.fromisoformat(e["start_date"])
        except (ValueError, TypeError):
            continue
        if today <= sd <= horizon:
            who = BRAND_NAMES.get(e.get("brand_id"), "All brands") if e.get("brand_id") is not None else "All brands"
            upcoming.append((sd, e.get("title", ""), who))
    upcoming.sort()
    if upcoming:
        lines.append(f"\n## UPCOMING CAMPAIGNS (next 45 days, from {today.isoformat()})")
        for sd, title, who in upcoming[:25]:
            lines.append(f"- {sd.isoformat()}: {title} [{who}]")

    # ── Upcoming tradeshows ─────────────────────────────────────────────
    up_shows = []
    for sh in shows:
        try:
            sd = date.fromisoformat(sh["date_start"])
        except (ValueError, TypeError, KeyError):
            continue
        if sd >= today:
            up_shows.append((sd, sh.get("name", ""), sh.get("location", "")))
    up_shows.sort()
    if up_shows:
        lines.append(f"\n## UPCOMING TRADESHOWS (from {today.isoformat()})")
        for sd, name, loc in up_shows[:12]:
            lines.append(f"- {sd.isoformat()}: {name} — {loc}")

    return "\n".join(lines)


def generate_insights(context):
    try:
        import anthropic
    except ImportError:
        print("Missing anthropic. Run: pip3 install anthropic"); sys.exit(1)

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("No ANTHROPIC_API_KEY set. Add it to .env.local and re-run.")
        sys.exit(1)

    client = anthropic.Anthropic(api_key=api_key)

    system = (
        "You are a sharp retail analyst preparing the founder of Coolkidz Australia "
        "(a multi-brand baby-products distributor) for their weekly leadership meeting. "
        "You write tight, specific talking points a busy executive can skim in 60 seconds. "
        "Use the exact numbers given. Australian English. No preamble, no fluff, no made-up data."
    )

    prompt = f"""Here is this week's data across the brand portfolio:

{context}

Write a meeting brief in markdown with these four sections (use ## headings):

## Sales
3-5 bullets: portfolio headline, the standout performers and the brands that need attention (call out big MoM swings and weak ROAS). Be specific with numbers.

## Budget
2-3 bullets: where marketing spend is tracking against budget, and any over/underspend worth raising.

## Upcoming Campaigns
2-4 bullets: the most important campaigns coming up and which brands they affect. Flag clashes or gaps if visible.

## Tradeshows
1-3 bullets: next tradeshows and any prep worth noting.

End with a single line "## Watch this week:" naming the 1-2 things most worth the team's attention. Keep the whole brief under 350 words."""

    message = client.messages.create(
        model="claude-opus-4-8",
        max_tokens=2000,
        thinking={"type": "adaptive"},
        output_config={"effort": "medium"},
        system=system,
        messages=[{"role": "user", "content": prompt}],
    )

    text = "".join(b.text for b in message.content if b.type == "text")
    return text.strip(), message.model


def main():
    sb_url = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
    sb_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    db = create_client(sb_url, sb_key)

    print("Gathering dashboard data...")
    context = gather_context(db)

    print("Generating insights with Claude...")
    content, model = generate_insights(context)

    period = f"Week of {date.today().strftime('%d %b %Y')}"
    db.table("ai_insights").insert({
        "generated_at": datetime.utcnow().isoformat(),
        "period_label": period,
        "content":      content,
        "model":        model,
    }).execute()

    print(f"\n✓ Insights generated ({model}) and saved.\n")
    print(content)


if __name__ == "__main__":
    main()
