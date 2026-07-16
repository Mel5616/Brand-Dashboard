#!/usr/bin/env python3
"""Seed Kye Campbell's Team Scorecard (staff, brand assignments, KPI areas, KPIs).
Idempotent: skips if a staff member with the same name already exists.
Run: python3 supabase/seed_kye_scorecard.py (reads .env.local in repo root)."""
import json, os, sys, urllib.request

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env = {}
with open(os.path.join(root, ".env.local")) as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1); env[k.strip()] = v.strip().strip('"')
U, K = env["NEXT_PUBLIC_SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"]
HDR = {"apikey": K, "Authorization": f"Bearer {K}", "Content-Type": "application/json"}

def req(path, data=None, method=None, prefer="return=representation"):
    r = urllib.request.Request(f"{U}/rest/v1/{path}", data=json.dumps(data).encode() if data is not None else None,
                               method=method or ("POST" if data is not None else "GET"), headers={**HDR, "Prefer": prefer})
    body = urllib.request.urlopen(r).read()
    return json.loads(body) if body else None

existing = req("staff_members?full_name=eq.Kye%20Campbell&select=id")
if existing:
    print("Kye Campbell already seeded:", existing[0]["id"]); sys.exit(0)

staff = req("staff_members", {
    "full_name": "Kye Campbell", "role_title": "Brand & Marketing Manager",
    "employment_type": "Full Time", "hours": "9:00am to 5:00pm",
    "work_arrangement": "Office based (Braeside), WFH Thursdays",
    "location": "1 Beyer Road Braeside VIC 3195",
    "reports_to": "Melanie Kingsford (Marketing Director)",
})[0]
sid = staff["id"]
print("staff:", sid)

TIERS = {"A": ["UPPAbaby", "Nanit", "SmarTrike", "Frida"],
         "B": ["WonderFold", "Gaia Baby", "Hannie", "Magic"],
         "C": ["MiaMily", "Mamave", "Zazu", "Matchstick Monkey"]}
req("staff_brand_assignments", [{"staff_id": sid, "brand": b, "tier": t, "ownership": "support"}
                                for t, brands in TIERS.items() for b in brands], prefer="return=minimal")
print("brand assignments: 12 (all 'support' — ownership split TBC)")

AREAS = [
  {"name": "Brand & Campaign Strategy", "weight_pct": 20, "kpis": [
    {"description": "Annual brand marketing plan completed and approved for every assigned brand", "target": "All assigned brands signed off by end of Q1", "measured_via": "Approved plans filed in Drive, sign-off from Marketing Director", "cadence": "annual", "is_tbc": False},
    {"description": "Integrated brand campaigns delivered, each hitting pre-agreed engagement or sales lift targets", "target": "Minimum 3 per year", "measured_via": "Campaign calendar + post-mortem results", "cadence": "quarterly", "is_tbc": True, "tbc_note": "Confirm portfolio-wide vs per priority brand"},
    {"description": "Brand awareness uplift", "target": "+10% YoY minimum", "measured_via": "Brand tracking or social listening tool", "cadence": "half_yearly", "is_tbc": True, "tbc_note": "Baseline and tool not yet locked"},
    {"description": "Brand consistency compliance score", "target": "95%+ across all creative and comms touchpoints", "measured_via": "Quarterly brand audit checklist", "cadence": "quarterly", "is_tbc": False}]},
  {"name": "Campaign Management & Execution", "weight_pct": 30, "kpis": [
    {"description": "Campaigns launched on time and on budget", "target": "100% on time, within +/-5% of approved budget", "measured_via": "Campaign tracker vs approved brief", "cadence": "per_campaign", "is_tbc": False},
    {"description": "Average campaign ROI", "target": "3:1 or better", "measured_via": "Dashboard: attributed revenue vs total campaign spend", "cadence": "quarterly", "is_tbc": False},
    {"description": "Engagement rate (social, digital, PR)", "target": "Exceeds prior-year campaign benchmark by 10%", "measured_via": "Channel analytics vs locked benchmark file", "cadence": "per_campaign", "is_tbc": True, "tbc_note": "Prior-year benchmarks per brand to be locked"},
    {"description": "Campaign post-mortem reports", "target": "Delivered within 2 weeks of every major campaign", "measured_via": "Report received by Marketing Director", "cadence": "per_campaign", "is_tbc": False}]},
  {"name": "Cross-Functional Collaboration", "weight_pct": 15, "kpis": [
    {"description": "Alignment sessions with performance, influencer and email teams, with resulting actions closed on time", "target": "Quarterly sessions held, 100% of agreed actions completed within agreed timelines", "measured_via": "Meeting notes + shared action tracker", "cadence": "quarterly", "is_tbc": False},
    {"description": "Joint campaigns with Performance or Partnerships teams", "target": "At least 30% of total campaign activity", "measured_via": "Campaign calendar tagging", "cadence": "quarterly", "is_tbc": False},
    {"description": "Internal satisfaction score for collaboration and communication", "target": "8/10 or higher", "measured_via": "Cross-team survey", "cadence": "half_yearly", "is_tbc": True, "tbc_note": "Survey mechanism and question set TBC"}]},
  {"name": "Brand Governance & Development", "weight_pct": 15, "kpis": [
    {"description": "Major brand guideline breaches (external-facing asset requiring correction or retraction)", "target": "Zero", "measured_via": "Brand audit log", "cadence": "ongoing", "is_tbc": False},
    {"description": "Competitor and market trend report with actionable recommendations", "target": "Delivered every quarter", "measured_via": "Report received by Marketing Director", "cadence": "quarterly", "is_tbc": False},
    {"description": "Brand innovation initiatives implemented (new format, positioning or creative test)", "target": "At least 2 per year", "measured_via": "Documented initiatives with results", "cadence": "annual", "is_tbc": False},
    {"description": "Brand health index (awareness + preference + consideration)", "target": "+5% YoY", "measured_via": "Brand health tracking", "cadence": "annual", "is_tbc": True, "tbc_note": "Baseline and tool TBC"}]},
  {"name": "Reporting & Performance Analysis", "weight_pct": 20, "kpis": [
    {"description": "Monthly campaign performance dashboard delivered to Marketing Director", "target": "On schedule, every month", "measured_via": "Brand Command Centre", "cadence": "monthly", "is_tbc": False},
    {"description": "Actionable insights identified and implemented after each campaign", "target": "Within 30 days of campaign wrap-up", "measured_via": "Post-mortem action log", "cadence": "per_campaign", "is_tbc": False},
    {"description": "Year-on-year improvement in key metrics (engagement rate, CTR, conversion, ROI)", "target": "Demonstrated improvement in 3 or more metrics", "measured_via": "Dashboard trend view", "cadence": "quarterly", "is_tbc": False}]},
]
assert sum(a["weight_pct"] for a in AREAS) == 100, "weights must sum to 100"
n = 0
for ai, a in enumerate(AREAS):
    area = req("kpi_areas", {"staff_id": sid, "name": a["name"], "sort_order": ai, "weight_pct": a["weight_pct"]})[0]
    req("kpis", [{**k, "area_id": area["id"], "sort_order": ki, "tbc_note": k.get("tbc_note", "")}
                 for ki, k in enumerate(a["kpis"])], prefer="return=minimal")
    n += len(a["kpis"])
print(f"areas: {len(AREAS)} (weights sum 100) · kpis: {n}")
print("done — open /team in the dashboard")
