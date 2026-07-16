#!/usr/bin/env python3
"""Seed the two Social Media Marketing Coordinator scorecards (Nicky O'Brien,
Alicia Lambert) from the identical SMC frameworks (Jul 2026). Brand assignments
use the ACTUAL split recorded in the Team hub (Alicia: WonderFold, Magic, Gaia
Baby, MiaMily, Zazu, Matchstick Monkey; Nicky: the other six) — NOT the doc's
suggested split. Idempotent per person."""
import json, os, urllib.request, urllib.parse

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

TIER = {"UPPAbaby": "A", "Nanit": "A", "SmarTrike": "A", "Frida": "A",
        "WonderFold": "B", "Gaia Baby": "B", "Hannie": "B", "Magic": "B",
        "MiaMily": "C", "Mamave": "C", "Zazu": "C", "Matchstick Monkey": "C"}

def kpi(desc, target, via, cad, tbc=False, note=""):
    return {"description": desc, "target": target, "measured_via": via, "cadence": cad, "is_tbc": tbc, "tbc_note": note}

AREAS = [
  {"name": "Content Output & Scheduling", "weight_pct": 25, "kpis": [
    kpi("Content calendar approved ahead of time for every assigned brand", "Approved at least 2 weeks ahead, every brand, every month", "Calendar tool vs approval log", "monthly"),
    kpi("Planned posts published on schedule", "100% of scheduled posts live on time", "Scheduler vs plan", "monthly"),
    kpi("Posting cadence met per brand tier", "100% of agreed cadence (cadence per tier TBC)", "Post count vs agreed cadence", "monthly", True, "Lock cadence per tier — suggested start: Tier A 4+ posts/week, Tier B 2-3, Tier C 1-2. Output KPIs depend on this."),
    kpi("Posts breaching brand guidelines or compliance rules (TGA, Red Nose)", "Zero", "Brand audit log", "ongoing")]},
  {"name": "Community Management", "weight_pct": 20, "kpis": [
    kpi("Response time on comments, DMs and tagged content", "Within 24 hours on business days", "Platform inbox reporting", "monthly"),
    kpi("Customer service queries escalated to the right team", "Same business day, 100%", "Escalation log", "ongoing"),
    kpi("User-generated content surfaced and shared", "Minimum 2 pieces per brand per month (target TBC)", "UGC log / reposts", "monthly", True, "Working figure — adjust per brand once community size is factored in")]},
  {"name": "Growth & Engagement", "weight_pct": 20, "kpis": [
    kpi("Follower growth per assigned brand", "Net positive every quarter; growth targets per brand TBC once baselines locked", "Platform analytics", "monthly", True, "Baselines per brand per platform locked by end of August 2026"),
    kpi("Engagement rate per assigned brand", "Exceeds trailing 12-month baseline by 10% (baselines TBC)", "Platform analytics vs locked baseline file", "monthly", True, "Baselines TBC"),
    kpi("Reach growth per assigned brand", "Improves quarter on quarter (baselines TBC)", "Platform analytics", "quarterly", True, "Baselines TBC")]},
  {"name": "Campaign & Cross-Team Support", "weight_pct": 20, "kpis": [
    kpi("Major brand campaigns supported with agreed social content", "100% of major campaigns for assigned brands", "Campaign calendar cross-check with BMM", "per_campaign"),
    kpi("Influencer content amplified within agreed windows", "100% within the agreed posting window", "Influencer content log", "per_campaign"),
    kpi("Social components for email, loyalty and paid activity delivered on time", "100% on time", "Request log vs delivery", "per_campaign"),
    kpi("Internal satisfaction score for collaboration and communication", "8/10 or higher", "Cross-team survey (mechanism TBC)", "half_yearly", True, "Survey mechanism shared with all role frameworks")]},
  {"name": "Reporting & Insight", "weight_pct": 15, "kpis": [
    kpi("Monthly social performance report for assigned brands", "On schedule, every month — covering output, growth and commercial contribution", "Brand Command Centre", "monthly"),
    kpi("Competitor or trend insight with a recommendation", "At least 1 documented per month", "Monthly report", "monthly"),
    kpi("New format or content idea tested", "At least 1 per quarter with documented result", "Test log", "quarterly")]},
]

PEOPLE = [
  {"name": "Nicky O'Brien", "brands": ["UPPAbaby", "Nanit", "SmarTrike", "Frida", "Hannie", "Mamave"],
   "doc": ("SMC-Role-KPI-Framework-Nicky.docx", "smc-role-kpi-framework-jul-2026.docx")},
  {"name": "Alicia Lambert", "brands": ["WonderFold", "Gaia Baby", "Magic", "MiaMily", "Zazu", "Matchstick Monkey"],
   "doc": ("SMC-Role-KPI-Framework-Alicia-Lambert.docx", "smc-role-kpi-framework-jul-2026.docx")},
]

assert sum(a["weight_pct"] for a in AREAS) == 100
for person in PEOPLE:
    name = person["name"]
    if req(f"staff_members?full_name=eq.{urllib.parse.quote(name)}&select=id"):
        print(f"skip (already seeded): {name}"); continue
    staff = req("staff_members", {
        "full_name": name, "role_title": "Social Media Marketing Coordinator", "employment_type": "Full Time",
        "hours": "9:00am to 5:00pm",
        "work_arrangement": f"Assigned brands: {', '.join(person['brands'])} · creative direction from Creative Lead",
        "location": "1 Beyer Road, Braeside VIC 3195", "reports_to": "Melanie Kingsford (Marketing Director)",
    })[0]
    sid = staff["id"]
    req("staff_brand_assignments", [{"staff_id": sid, "brand": b, "tier": TIER[b], "ownership": "primary"} for b in person["brands"]], prefer="return=minimal")
    n = 0
    for ai, a in enumerate(AREAS):
        area = req("kpi_areas", {"staff_id": sid, "name": a["name"], "sort_order": ai, "weight_pct": a["weight_pct"]})[0]
        req("kpis", [{**k, "area_id": area["id"], "sort_order": ki} for ki, k in enumerate(a["kpis"])], prefer="return=minimal")
        n += len(a["kpis"])
    src, dest = person["doc"]
    path = f"/Users/melaniekingsford/Downloads/{src}"
    if os.path.exists(path):
        with open(path, "rb") as f: blob = f.read()
        sp = f"{sid}/{dest}"
        r = urllib.request.Request(f"{U}/storage/v1/object/role-documents/{sp}", data=blob, method="POST",
            headers={"apikey": K, "Authorization": f"Bearer {K}", "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "x-upsert": "true"})
        urllib.request.urlopen(r)
        req("role_documents", {"staff_id": sid, "version": 1, "file_path": sp, "source": "uploaded", "label": "July 2026 revision (source document)"}, prefer="return=minimal")
    print(f"seeded: {name} · {len(person['brands'])} brands · {n} kpis · doc attached")
print("done — open /team")
