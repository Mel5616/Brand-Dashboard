#!/usr/bin/env python3
"""Seed Pier-Ann Concepcion's Team Scorecard from ELMM-Role-KPI-Framework (Jul 2026).
Idempotent. Run: python3 supabase/seed_pierann_scorecard.py"""
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

if req("staff_members?full_name=eq.Pier-Ann%20Concepcion&select=id"):
    print("Pier-Ann already seeded"); sys.exit(0)

staff = req("staff_members", {
    "full_name": "Pier-Ann Concepcion", "role_title": "Email & Loyalty Marketing Manager",
    "employment_type": "Full Time", "hours": "9:00am to 5:00pm",
    "work_arrangement": "Email and loyalty across the full Coolkidz portfolio",
    "location": "1 Beyer Road, Braeside VIC 3195",
    "reports_to": "Melanie Kingsford (Marketing Director)",
})[0]
sid = staff["id"]
print("staff:", sid)

TIERS = {"A": ["UPPAbaby", "Nanit", "SmarTrike", "Frida"],
         "B": ["WonderFold", "Gaia Baby", "Hannie", "Magic"],
         "C": ["MiaMily", "Mamave", "Zazu", "Matchstick Monkey"]}
# Her remit is email/loyalty across the whole portfolio — primary for her function.
req("staff_brand_assignments", [{"staff_id": sid, "brand": b, "tier": t, "ownership": "primary"}
                                for t, brands in TIERS.items() for b in brands], prefer="return=minimal")
print("brand assignments: 12 (primary — portfolio-wide email/loyalty scope)")

AREAS = [
  {"name": "Email Marketing Strategy & Execution", "weight_pct": 30, "kpis": [
    {"description": "Campaigns delivered on time, error-free", "target": "100% of planned sends on schedule; zero errors requiring a correction send", "measured_via": "Campaign calendar vs actual send log", "cadence": "per_campaign", "is_tbc": False},
    {"description": "Email-attributed revenue as a share of D2C revenue", "target": "25%+ (baseline and final target TBC)", "measured_via": "Email platform attribution vs Shopify revenue", "cadence": "monthly", "is_tbc": True, "tbc_note": "Pull trailing 12-month actual then lock target; 25% is a working benchmark. Also confirm attribution model (platform vs last-click)."},
    {"description": "Core lifecycle flows live per D2C site (welcome, abandoned cart, post-purchase, win-back)", "target": "All 4 flows live and converting on every in-scope site (scope TBC)", "measured_via": "Platform flow audit", "cadence": "quarterly", "is_tbc": True, "tbc_note": "Confirm which D2C sites are in scope (fridaaustralia.com.au, uppababy.com.au, nanit.com.au, others TBC)"},
    {"description": "Deliverability health", "target": "99%+ delivered, spam complaints under 0.1%, unsubscribes under 0.5% per send", "measured_via": "Email platform deliverability reporting", "cadence": "monthly", "is_tbc": False},
    {"description": "A/B testing discipline", "target": "Every major campaign includes at least 1 test with a documented result", "measured_via": "Test log in monthly report", "cadence": "per_campaign", "is_tbc": False}]},
  {"name": "Loyalty Program Management", "weight_pct": 20, "kpis": [
    {"description": "Loyalty program membership growth", "target": "+10% net growth YoY minimum (baseline TBC)", "measured_via": "Loyalty platform member count", "cadence": "monthly", "is_tbc": True, "tbc_note": "Baseline to be pulled and locked by end of August 2026"},
    {"description": "Repeat purchase rate: members vs non-members", "target": "Members purchase at 1.5x the rate of non-members or better (baseline TBC)", "measured_via": "Shopify + loyalty platform cohort data", "cadence": "quarterly", "is_tbc": True, "tbc_note": "Baseline TBC"},
    {"description": "Active member rate (engaged in last 90 days)", "target": "Improves quarter on quarter (baseline TBC)", "measured_via": "Loyalty platform engagement data", "cadence": "quarterly", "is_tbc": True, "tbc_note": "Baseline TBC"},
    {"description": "Loyalty performance review with recommendations", "target": "Delivered every quarter", "measured_via": "Report received by Marketing Director", "cadence": "quarterly", "is_tbc": False}]},
  {"name": "Data, Insights & Optimisation", "weight_pct": 20, "kpis": [
    {"description": "Monthly email and loyalty performance report", "target": "On schedule, every month, covering all brands", "measured_via": "Brand Command Centre", "cadence": "monthly", "is_tbc": False},
    {"description": "Engagement metrics vs baseline (open rate, CTR, conversion)", "target": "Exceeds trailing 12-month baseline by 10% (baselines TBC, locked per brand)", "measured_via": "Email platform analytics vs locked baseline file", "cadence": "monthly", "is_tbc": True, "tbc_note": "Baselines to be pulled per brand and locked by end of August 2026"},
    {"description": "Net subscriber database growth with healthy list hygiene", "target": "+15% net growth YoY (baseline TBC); inactive segments suppressed quarterly", "measured_via": "Platform list reporting", "cadence": "monthly", "is_tbc": True, "tbc_note": "Baseline TBC"},
    {"description": "Insights actioned after each major campaign", "target": "Implemented within 30 days of campaign wrap-up", "measured_via": "Action log in monthly report", "cadence": "per_campaign", "is_tbc": False}]},
  {"name": "Collaboration & Cross-Channel Integration", "weight_pct": 15, "kpis": [
    {"description": "Email support for major brand campaigns", "target": "100% of major brand campaigns have an aligned email component agreed with the BMM", "measured_via": "Campaign calendar cross-check", "cadence": "per_campaign", "is_tbc": False},
    {"description": "Remarketing alignment sessions with Performance Marketing", "target": "Held quarterly, agreed actions completed on time", "measured_via": "Meeting notes + action tracker", "cadence": "quarterly", "is_tbc": False},
    {"description": "Creative brief lead time", "target": "Briefs to Creative Lead at least 10 working days before send date", "measured_via": "Brief log vs send dates", "cadence": "per_campaign", "is_tbc": False},
    {"description": "Internal satisfaction score for collaboration and communication", "target": "8/10 or higher", "measured_via": "Cross-team survey (mechanism TBC)", "cadence": "half_yearly", "is_tbc": True, "tbc_note": "Survey mechanism shared with the BMM framework; confirm once and apply to both roles"}]},
  {"name": "Platform Management & Process Improvement", "weight_pct": 15, "kpis": [
    {"description": "Automation and template health", "target": "Zero broken flows or templates found in quarterly audit; issues fixed within 5 working days", "measured_via": "Quarterly platform audit checklist", "cadence": "quarterly", "is_tbc": False},
    {"description": "Data integration uptime", "target": "Sync or integration issues resolved within 48 hours of detection", "measured_via": "Issue log", "cadence": "ongoing", "is_tbc": False},
    {"description": "Process or automation improvements implemented", "target": "At least 2 per year with documented time or revenue benefit", "measured_via": "Documented initiatives", "cadence": "annual", "is_tbc": False},
    {"description": "Campaign QA standard", "target": "100% of sends pass pre-send QA checklist (links, pricing, rendering, segments)", "measured_via": "QA checklist completion log", "cadence": "per_campaign", "is_tbc": False}]},
]
assert sum(a["weight_pct"] for a in AREAS) == 100
n = 0
for ai, a in enumerate(AREAS):
    area = req("kpi_areas", {"staff_id": sid, "name": a["name"], "sort_order": ai, "weight_pct": a["weight_pct"]})[0]
    req("kpis", [{**{"tbc_note": ""}, **k, "area_id": area["id"], "sort_order": ki} for ki, k in enumerate(a["kpis"])], prefer="return=minimal")
    n += len(a["kpis"])
print(f"areas: {len(AREAS)} (weights sum 100) · kpis: {n}")

# Attach the source docx as v1 role document (reference only).
doc_path = "/Users/melaniekingsford/Downloads/ELMM-Role-KPI-Framework-Pier-Ann-Concepcion.docx"
if os.path.exists(doc_path):
    with open(doc_path, "rb") as f: blob = f.read()
    sp = f"{sid}/elmm-role-kpi-framework-jul-2026.docx"
    r = urllib.request.Request(f"{U}/storage/v1/object/role-documents/{sp}", data=blob, method="POST",
        headers={"apikey": K, "Authorization": f"Bearer {K}", "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "x-upsert": "true"})
    urllib.request.urlopen(r)
    req("role_documents", {"staff_id": sid, "version": 1, "file_path": sp, "source": "uploaded", "label": "July 2026 revision (source document)"}, prefer="return=minimal")
    print("role document attached: v1 July 2026 revision")
print("done — open /team")
