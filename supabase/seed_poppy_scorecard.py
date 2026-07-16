#!/usr/bin/env python3
"""Seed Poppy Pan's Team Scorecard from DCC-Role-KPI-Framework (Jul 2026).
Idempotent. Run: python3 supabase/seed_poppy_scorecard.py"""
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

if req("staff_members?full_name=eq.Poppy%20Pan&select=id"):
    print("Poppy already seeded"); sys.exit(0)

staff = req("staff_members", {
    "full_name": "Poppy Pan", "role_title": "Digital Content Creator",
    "employment_type": "Full Time", "hours": "9:00am to 5:00pm",
    "work_arrangement": "Photography, video and short-form content across the full portfolio · creative direction from Creative Lead",
    "location": "1 Beyer Road, Braeside VIC 3195",
    "reports_to": "Melanie Kingsford (Marketing Director)",
})[0]
sid = staff["id"]
print("staff:", sid)

TIERS = {"A": ["UPPAbaby", "Nanit", "SmarTrike", "Frida"],
         "B": ["WonderFold", "Gaia Baby", "Hannie", "Magic"],
         "C": ["MiaMily", "Mamave", "Zazu", "Matchstick Monkey"]}
req("staff_brand_assignments", [{"staff_id": sid, "brand": b, "tier": t, "ownership": "primary"}
                                for t, brands in TIERS.items() for b in brands], prefer="return=minimal")
print("brand assignments: 12 (primary — portfolio-wide content scope)")

AREAS = [
  {"name": "Content Production & Delivery", "weight_pct": 30, "kpis": [
    {"description": "Briefed content delivered by agreed deadline", "target": "100% on time", "measured_via": "Brief log / project tracker", "cadence": "per_campaign", "is_tbc": False},
    {"description": "Monthly production plan delivered (shoot days and asset counts)", "target": "100% of agreed monthly plan (quota TBC)", "measured_via": "Production plan vs delivered assets", "cadence": "monthly", "is_tbc": True, "tbc_note": "Agree the monthly production plan structure: shoot days per month and expected asset output per shoot — production KPIs depend on a quota being defined"},
    {"description": "Final outputs delivered to correct channel specs", "target": "Zero re-exports due to wrong format, dimensions or duration", "measured_via": "Re-work log", "cadence": "per_campaign", "is_tbc": False},
    {"description": "Turnaround against agreed SLAs by content type", "target": "100% within SLA (SLAs TBC)", "measured_via": "Project tracker", "cadence": "monthly", "is_tbc": True, "tbc_note": "SLAs shared with the Creative Lead framework; agree once and apply to both roles"}]},
  {"name": "Quality & Brand Compliance", "weight_pct": 20, "kpis": [
    {"description": "First-round approval by Creative Lead", "target": "80%+ of assets approved with no more than 1 revision round (baseline TBC)", "measured_via": "Revision tracking in project tracker", "cadence": "monthly", "is_tbc": True, "tbc_note": "Baseline from the first full quarter of revision tracking, then confirm the 80% target"},
    {"description": "Released assets breaching brand guidelines", "target": "Zero", "measured_via": "Brand audit log", "cadence": "ongoing", "is_tbc": False},
    {"description": "Deliverables matching the agreed brief scope", "target": "100%", "measured_via": "Brief vs delivery review", "cadence": "per_campaign", "is_tbc": False}]},
  {"name": "Creative Collaboration", "weight_pct": 20, "kpis": [
    {"description": "Shot list and concept confirmed with Creative Lead before every shoot", "target": "100% of shoots", "measured_via": "Shoot planning records", "cadence": "per_campaign", "is_tbc": False},
    {"description": "Platform-specific content delivered to Social Media Coordinators per content calendar", "target": "100% on schedule", "measured_via": "Content calendar cross-check", "cadence": "monthly", "is_tbc": False},
    {"description": "Paid advertising and email assets delivered on time to Performance and Email teams", "target": "100% on time", "measured_via": "Request log vs delivery", "cadence": "per_campaign", "is_tbc": False},
    {"description": "Internal satisfaction score for collaboration and communication", "target": "8/10 or higher", "measured_via": "Cross-team survey (mechanism TBC)", "cadence": "half_yearly", "is_tbc": True, "tbc_note": "Survey mechanism shared with all role frameworks; confirm once and apply to all roles"}]},
  {"name": "Production Planning & Logistics", "weight_pct": 15, "kpis": [
    {"description": "Shoots fully planned (location, props, talent, run sheet) ahead of shoot day", "target": "Confirmed at least 5 working days before every shoot", "measured_via": "Shoot planning records", "cadence": "per_campaign", "is_tbc": False},
    {"description": "Final assets filed in the content archive with version control", "target": "100% filed within 5 working days of delivery", "measured_via": "Archive audit", "cadence": "monthly", "is_tbc": False},
    {"description": "Shoot days lost to equipment failure or preparation issues", "target": "Zero", "measured_via": "Shoot log", "cadence": "ongoing", "is_tbc": False}]},
  {"name": "Content Performance & Innovation", "weight_pct": 15, "kpis": [
    {"description": "New content format or creative approach tested", "target": "At least 1 per quarter with documented results", "measured_via": "Test log", "cadence": "quarterly", "is_tbc": False},
    {"description": "Content performance review with Social Media Coordinators (top and bottom performers, learnings)", "target": "Held quarterly with documented recommendations", "measured_via": "Review notes", "cadence": "quarterly", "is_tbc": False},
    {"description": "Creative recommendations contributed to campaign development", "target": "At least 1 documented recommendation per month", "measured_via": "Brainstorm / campaign records", "cadence": "monthly", "is_tbc": False}]},
]
assert sum(a["weight_pct"] for a in AREAS) == 100
n = 0
for ai, a in enumerate(AREAS):
    area = req("kpi_areas", {"staff_id": sid, "name": a["name"], "sort_order": ai, "weight_pct": a["weight_pct"]})[0]
    req("kpis", [{**{"tbc_note": ""}, **k, "area_id": area["id"], "sort_order": ki} for ki, k in enumerate(a["kpis"])], prefer="return=minimal")
    n += len(a["kpis"])
print(f"areas: {len(AREAS)} (weights sum 100) · kpis: {n}")

# Attach the source docx (bucket exists; created for Pier-Ann's doc).
doc_path = "/Users/melaniekingsford/Downloads/DCC-Role-KPI-Framework-Poppy-Pan.docx"
if os.path.exists(doc_path):
    with open(doc_path, "rb") as f: blob = f.read()
    sp = f"{sid}/dcc-role-kpi-framework-jul-2026.docx"
    r = urllib.request.Request(f"{U}/storage/v1/object/role-documents/{sp}", data=blob, method="POST",
        headers={"apikey": K, "Authorization": f"Bearer {K}", "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "x-upsert": "true"})
    urllib.request.urlopen(r)
    req("role_documents", {"staff_id": sid, "version": 1, "file_path": sp, "source": "uploaded", "label": "July 2026 revision (source document)"}, prefer="return=minimal")
    print("role document attached: v1 July 2026 revision")
print("done — open /team")
