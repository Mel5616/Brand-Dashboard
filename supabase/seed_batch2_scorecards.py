#!/usr/bin/env python3
"""Seed five Team Scorecards from the July 2026 role/KPI frameworks:
Sean Robinson (HPM), Melanie Kingsford (MD), William Han (MEC),
Jane Edmonds (PAM), Alison Soulsby (BME). Idempotent per person."""
import json, os, urllib.request

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

TIERS = {"A": ["UPPAbaby", "Nanit", "SmarTrike", "Frida"],
         "B": ["WonderFold", "Gaia Baby", "Hannie", "Magic"],
         "C": ["MiaMily", "Mamave", "Zazu", "Matchstick Monkey"]}

def kpi(desc, target, via, cad, tbc=False, note=""):
    return {"description": desc, "target": target, "measured_via": via, "cadence": cad, "is_tbc": tbc, "tbc_note": note}

PEOPLE = [
 {
  "staff": {"full_name": "Sean Robinson", "role_title": "Head of Performance Marketing", "employment_type": "Full Time",
            "hours": "9:00am to 5:00pm", "work_arrangement": "Paid media, SEO and digital performance across the full portfolio · owns the performance reporting rhythm",
            "location": "1 Beyer Road, Braeside VIC 3195", "reports_to": "Melanie Kingsford (Marketing Director)"},
  "doc": ("HPM-Role-KPI-Framework-Sean-Robinson.docx", "hpm-role-kpi-framework-jul-2026.docx"),
  "areas": [
   {"name": "Paid Media Performance", "weight_pct": 30, "kpis": [
     kpi("ROAS by brand and channel", "At or above agreed per-brand targets (TBC, set from FY26-27 budget and Prime Day benchmarks)", "Platform reporting + dashboard", "monthly", True, "Lock per-brand ROAS targets from the FY26-27 budget; set per tier at minimum — blanket targets across 12 brands with different margins will misfire"),
     kpi("Budget pacing accuracy", "Spend within ±5% of plan, every month, every platform", "Spend vs budget tracker", "monthly"),
     kpi("CPA vs benchmarked targets", "At or below benchmark (benchmarks TBC per brand)", "Platform reporting", "monthly", True, "Benchmarks TBC per brand"),
     kpi("Underperformance flagged and actioned early", "Documented optimisations weekly; no campaign runs more than 1 week below threshold without action", "Weekly performance summary", "monthly"),
     kpi("Structured A/B tests run", "At least 2 live tests per month across the portfolio with documented outcomes", "Test log", "monthly")]},
   {"name": "Digital Growth", "weight_pct": 20, "kpis": [
     kpi("Website traffic growth (sessions, unique users)", "YoY growth per brand site (baselines TBC)", "Analytics", "monthly", True, "Baselines locked per brand site by end of August 2026"),
     kpi("Site-wide conversion rate", "Improves vs trailing 12-month baseline (TBC)", "Analytics", "monthly", True, "Baseline TBC"),
     kpi("AOV and revenue per visitor", "Tracked per brand with improvement targets TBC", "Analytics + Shopify", "monthly", True, "Targets TBC"),
     kpi("New vs returning customer ratio", "Tracked and reported; acquisition-retention balance reviewed quarterly with Email & Loyalty", "Analytics", "quarterly")]},
   {"name": "Reporting & Insights", "weight_pct": 20, "kpis": [
     kpi("Core reporting rhythm delivered: weekly summaries, monthly dashboards and brand decks, quarterly strategic reviews", "100% on schedule", "Brand Command Centre + report log", "monthly"),
     kpi("Reporting accuracy", "Zero material corrections after delivery", "Correction log", "ongoing"),
     kpi("Budget reallocation recommendations", "Delivered quarterly with expected impact quantified", "Quarterly strategic review", "quarterly")]},
   {"name": "SEO", "weight_pct": 15, "kpis": [
     kpi("Organic traffic and keyword rankings", "Improve quarter on quarter per brand site (baselines TBC)", "Rank tracking + analytics", "quarterly", True, "Baselines TBC"),
     kpi("Technical SEO issues resolved", "Within agreed windows (critical 1 week, standard 30 days)", "SEO issue log", "monthly"),
     kpi("On-page optimisation plan delivered", "100% of monthly plan completed (executed with Marketplace & eCommerce Coordinator)", "SEO task log", "monthly")]},
   {"name": "Cross-Functional Collaboration", "weight_pct": 15, "kpis": [
     kpi("Creative test briefs to Creative Lead with proper lead time", "100% within agreed SLA", "Brief log", "per_campaign"),
     kpi("Quarterly alignment sessions with Email & Loyalty and Partnerships & Affiliate teams", "Held quarterly, actions closed on time", "Meeting notes + action tracker", "quarterly"),
     kpi("Team capability building in digital performance", "At least 1 documented learning session or playbook per quarter", "Session records", "quarterly"),
     kpi("Internal satisfaction score for collaboration and communication", "8/10 or higher", "Cross-team survey (mechanism TBC)", "half_yearly", True, "Survey mechanism shared with all role frameworks"),
     kpi("Attribution rules agreed across paid, affiliate and email", "Agreed with PAM and ELMM so channels do not double-count revenue", "Documented attribution rules", "quarterly", True, "Decision pending — shared with PAM and ELMM frameworks")]},
  ],
 },
 {
  "staff": {"full_name": "Melanie Kingsford", "role_title": "Marketing Director", "employment_type": "Full Time",
            "hours": "9:00am to 5:00pm", "work_arrangement": "Hybrid · full portfolio, all channels · 10 direct reports",
            "location": "1 Beyer Road, Braeside VIC 3195", "reports_to": "Coolkidz senior management (reviewer TBC for scorecard purposes)"},
  "doc": ("MD-Role-KPI-Framework-Melanie-Kingsford.docx", "md-role-kpi-framework-jul-2026.docx"),
  "areas": [
   {"name": "Commercial Performance", "weight_pct": 30, "kpis": [
     kpi("Portfolio revenue vs budget across the 12 brands", "At or above FY budget (per rebuilt VIC and national targets)", "Brand Command Centre vs budget file", "monthly"),
     kpi("Marketing budget managed to plan", "Total spend within ±5% of approved budget", "Budget tracker", "monthly"),
     kpi("Marketing-attributed revenue and blended ROI", "Improves YoY (baseline from FY25-26 actuals, TBC)", "Dashboard attribution rollup", "quarterly", True, "Baseline to be locked from FY25-26 actuals"),
     kpi("Revenue diversification", "Non-UPPAbaby share of revenue grows per diversification strategy (target TBC from investor plan)", "Brand Command Centre", "quarterly", True, "Target TBC from investor strategy figures")]},
   {"name": "Team Leadership & Capability", "weight_pct": 20, "kpis": [
     kpi("Every team member has a current role and KPI framework with reviews held on time", "100% of team, quarterly reviews completed on schedule", "Team scorecard module", "quarterly"),
     kpi("Team KPI achievement", "Portfolio-wide weighted team score improves quarter on quarter", "Team scorecard rollup", "quarterly"),
     kpi("Underperformance managed actively", "Documented development or reset plan within 30 days of a red quarterly score", "Scorecard audit log", "per_campaign"),
     kpi("Development and succession actions per team member", "At least 1 documented development action per person per half", "Review records", "half_yearly")]},
   {"name": "Brand Portfolio Health", "weight_pct": 20, "kpis": [
     kpi("Brand awareness and brand health trends", "Improving for Tier A brands once baselines are live (baselines TBC, end August 2026)", "Brand tracking / social listening", "half_yearly", True, "Baselines TBC; tool decision shared with the BMM framework"),
     kpi("Campaign success rate across the portfolio", "70%+ of major campaigns hit their pre-agreed targets", "Campaign post-mortems", "quarterly"),
     kpi("Tradeshow and event performance", "Each show meets its target with post-show report delivered (per post-show report standard)", "Post-show reports", "per_campaign")]},
   {"name": "Strategy & Innovation", "weight_pct": 15, "kpis": [
     kpi("Annual marketing strategy and brand plans approved before FY start", "100% of brands, signed off by senior management", "Approved plans", "annual"),
     kpi("Portfolio-level innovation initiatives", "At least 2 per year implemented with documented results", "Initiative log", "annual"),
     kpi("Market and competitor insight informing strategy", "Quarterly insight review conducted with documented strategic responses", "Review records", "quarterly")]},
   {"name": "Governance & Stakeholders", "weight_pct": 15, "kpis": [
     kpi("Major brand, compliance or reputational incidents unmanaged", "Zero; contingency response initiated within 24 hours of any incident", "Incident log", "ongoing"),
     kpi("End-of-month reporting to senior management", "On schedule, every month", "Report log", "monthly"),
     kpi("Retail partner and vendor relationship health", "Key partner reviews held at least half-yearly (Baby Bunting, Chemist Warehouse, Priceline, Go Vita)", "Meeting records", "half_yearly")]},
  ],
 },
 {
  "staff": {"full_name": "William Han", "role_title": "Marketplace & eCommerce Coordinator", "employment_type": "Full Time",
            "hours": "9:00am to 5:00pm", "work_arrangement": "Brand websites, third-party marketplaces and retail partner listings · every listing treated as a shelf",
            "location": "1 Beyer Road, Braeside VIC 3195", "reports_to": "Melanie Kingsford (Marketing Director)"},
  "doc": ("MEC-Role-KPI-Framework-William-Han.docx", "mec-role-kpi-framework-jul-2026.docx"),
  "areas": [
   {"name": "Marketplace Operations", "weight_pct": 25, "kpis": [
     kpi("Active SKUs listed with complete, optimised content on every in-scope marketplace", "100% (in-scope marketplaces TBC)", "Marketplace listing audit", "monthly", True, "Confirm the in-scope marketplace list (Amazon AU, Baby Bunting Marketplace, others) — the coverage KPI needs a defined universe"),
     kpi("Listing suppressions, errors or stockout flags resolved", "Within 48 hours of detection", "Issue log", "ongoing"),
     kpi("Marketplace sales growth", "Targets per marketplace TBC once baselines locked (Amazon baseline from Prime Day period)", "Marketplace sales reporting", "monthly", True, "Baselines locked per platform by end of August 2026"),
     kpi("Marketplace advertising execution supported on schedule", "100% of agreed campaign actions completed on time", "Campaign tracker with Head of Performance Marketing", "per_campaign")]},
   {"name": "Website Management & Maintenance", "weight_pct": 20, "kpis": [
     kpi("Website updates executed on schedule", "100% of planned updates live on time", "Update log vs plan", "monthly"),
     kpi("Product data accuracy (pricing, SKUs, inventory, specs)", "Zero errors found in monthly audit", "Monthly site audit", "monthly"),
     kpi("Site issues reported and resolved or escalated", "Within 48 hours", "Issue log", "ongoing")]},
   {"name": "Campaign & Promotional Support", "weight_pct": 20, "kpis": [
     kpi("Campaign and promotional updates live on time across sites and marketplaces", "100%, zero pricing or messaging errors", "Campaign checklist", "per_campaign"),
     kpi("Digital storefronts aligned with current campaign narratives", "Zero stale campaign content in monthly check", "Monthly digital audit", "monthly"),
     kpi("Product and offer links delivered to the Email & Loyalty Marketing Manager", "100% on time and accurate", "Request log", "per_campaign")]},
   {"name": "Content & SEO Optimisation", "weight_pct": 20, "kpis": [
     kpi("On-page SEO updates delivered per monthly plan", "100% of planned updates completed", "SEO task log", "monthly"),
     kpi("Organic visibility (rankings and organic traffic to product content)", "Improves quarter on quarter (baselines TBC)", "Analytics + rank tracking", "quarterly", True, "Baselines TBC"),
     kpi("Product content audit with findings actioned", "Quarterly audit, findings closed within 30 days", "Audit checklist + action log", "quarterly")]},
   {"name": "Reporting & Analysis", "weight_pct": 15, "kpis": [
     kpi("eCommerce and marketplace performance reports delivered", "On schedule, every month", "Brand Command Centre", "monthly"),
     kpi("Conversion rate improvement across owned sites", "Exceeds trailing 12-month baseline (TBC)", "Analytics vs locked baseline", "quarterly", True, "Baseline TBC"),
     kpi("Optimisation recommendations documented", "At least 1 per month with expected impact", "Monthly report", "monthly")]},
  ],
 },
 {
  "staff": {"full_name": "Jane Edmonds", "role_title": "Partnerships & Affiliate Manager", "employment_type": "Part Time",
            "hours": "TBA", "work_arrangement": "Partnerships and affiliate programs across the full portfolio · every partnership accountable to revenue and ROI",
            "location": "1 Beyer Road, Braeside VIC 3195", "reports_to": "Melanie Kingsford (Marketing Director)"},
  "doc": ("PAM-Role-KPI-Framework-Jane-Edmonds.docx", "pam-role-kpi-framework-jul-2026.docx"),
  "areas": [
   {"name": "Partnership Performance & ROI", "weight_pct": 25, "kpis": [
     kpi("Partnership-attributed revenue", "Monthly and quarterly targets TBC once baseline locked", "Attribution reporting + Shopify", "monthly", True, "Baseline locked from Commission Factory and attribution reporting by end of August 2026"),
     kpi("ROI of partnership marketing initiatives, including co-branded campaigns", "3:1 or better (consistent with the campaign ROI standard)", "Initiative cost vs attributed revenue", "quarterly"),
     kpi("Engagement on joint marketing activities (CTR, participation, redemptions)", "Exceeds prior comparable activity (baselines TBC)", "Campaign analytics", "per_campaign", True, "Baselines TBC")]},
   {"name": "Affiliate Program Metrics", "weight_pct": 25, "kpis": [
     kpi("Affiliate-generated revenue growth", "+15% YoY total (baseline TBC from Commission Factory)", "Commission Factory reporting", "monthly", True, "Baseline TBC from Commission Factory"),
     kpi("Active affiliate retention", "80%+ of active affiliates remain active month over month (baseline TBC)", "Commission Factory reporting", "monthly", True, "Baseline TBC"),
     kpi("Quality affiliates onboarded", "Target per quarter TBC (suggest 5+)", "Onboarding log", "quarterly", True, "Target TBC — scales with confirmed weekly hours"),
     kpi("Affiliate traffic converting", "Conversion rate from affiliate sources at or above site average", "Analytics + Commission Factory", "monthly")]},
   {"name": "Partnership Acquisition & Growth", "weight_pct": 20, "kpis": [
     kpi("New partnerships signed", "2 per quarter (target TBC), across traditional and non-traditional categories", "Signed agreements", "quarterly", True, "Target scales with confirmed hours (listed TBA)"),
     kpi("Speed to activation", "First contact to live partnership within 8 weeks average (TBC)", "Pipeline tracker", "quarterly", True, "TBC"),
     kpi("Pipeline value maintained", "Forecast annual revenue from active and pending deals at or above target (TBC)", "Pipeline tracker", "monthly", True, "Target TBC")]},
   {"name": "Brand Alignment & Relationship Health", "weight_pct": 15, "kpis": [
     kpi("Partner satisfaction", "8/10 or higher via periodic feedback", "Partner feedback (mechanism TBC)", "half_yearly", True, "Feedback mechanism TBC"),
     kpi("Renewal rate of partnerships and affiliates", "80%+ (baseline TBC)", "Renewal log", "quarterly", True, "Baseline TBC"),
     kpi("Partner activity compliant with brand and campaign guidelines", "Zero compliance breaches", "Brand audit log", "ongoing"),
     kpi("Partner initiatives integrated into wider campaigns", "100% of major activations coordinated through the campaign calendar", "Campaign calendar cross-check", "per_campaign")]},
   {"name": "Innovation & Channel Expansion", "weight_pct": 15, "kpis": [
     kpi("New partnership categories explored", "At least 2 per year (e.g. hospitals, community organisations, loyalty programs)", "Documented exploration + outcomes", "annual"),
     kpi("Pilot initiatives launched", "At least 2 test-and-learn pilots per year with documented results", "Pilot log", "annual"),
     kpi("Earned media or PR from partnerships", "Documented quarterly", "Coverage log", "quarterly")]},
  ],
 },
 {
  "staff": {"full_name": "Alison Soulsby", "role_title": "Brand & Marketing Executive", "employment_type": "Part Time",
            "hours": "9:30am to 2:30pm", "work_arrangement": "Hybrid · campaign coordination across B2B and B2C · measured on coordination quality, timeliness and accuracy, calibrated to part-time hours",
            "location": "1 Beyer Road, Braeside VIC 3195", "reports_to": "Melanie Kingsford (Marketing Director)"},
  "doc": ("BME-Role-KPI-Framework-Alison-Soulsby.docx", "bme-role-kpi-framework-jul-2026.docx"),
  "areas": [
   {"name": "Campaign Planning & Execution", "weight_pct": 25, "kpis": [
     kpi("Supported campaigns delivered on schedule", "95%+ of campaigns", "Campaign tracker", "per_campaign"),
     kpi("Campaign assets complete and on-brand at launch", "Zero missing or off-brand assets", "Launch checklist", "per_campaign"),
     kpi("Post-campaign reporting turnaround", "Within 5 business days of campaign end", "Report received", "per_campaign")]},
   {"name": "Brand & Content Coordination", "weight_pct": 20, "kpis": [
     kpi("Brand compliance across assets produced or coordinated", "98%+ adherence to brand guidelines", "Brand audit checklist", "quarterly"),
     kpi("Asset turnaround from brief to delivery", "100% within agreed SLAs (shared SLA framework, TBC)", "Project tracker", "monthly", True, "SLAs shared with the Creative Lead and DCC frameworks; agree once, apply everywhere"),
     kpi("Product imagery and digital asset updates", "Zero corrections required after publish", "Update log", "monthly")]},
   {"name": "B2B Marketing Support", "weight_pct": 20, "kpis": [
     kpi("Retailer toolkits distributed ahead of campaigns", "Available at least 2 weeks before campaign start, 100%", "Distribution log vs campaign calendar", "per_campaign"),
     kpi("Responsiveness to retailer requests", "Average response under 48 hours", "Request log", "monthly"),
     kpi("Trade activations supported and delivered on time", "100%", "Activation tracker", "per_campaign"),
     kpi("Retail partner satisfaction", "Positive quarterly feedback (mechanism TBC)", "Partner feedback / survey", "quarterly", True, "Quarterly pulse to key contacts at Baby Bunting, Chemist Warehouse, Priceline, Go Vita — mechanism TBC")]},
   {"name": "B2C Marketing & Campaign Support", "weight_pct": 15, "kpis": [
     kpi("Influencer and affiliate deliverables tracked to completion", "100% of agreed content received", "Deliverables tracker (with Partnerships & Affiliate Manager)", "per_campaign"),
     kpi("Consumer promotions executed cleanly", "Zero compliance or fulfilment issues", "Promotion log", "per_campaign"),
     kpi("Website and digital assets aligned with current campaigns", "Zero stale or misaligned assets in monthly check", "Monthly digital audit", "monthly")]},
   {"name": "Events & Activation Support", "weight_pct": 10, "kpis": [
     kpi("Events delivered on time and within budget", "100%", "Event budget vs actual", "per_campaign"),
     kpi("Event logistics quality", "Zero major issues or missing materials", "Event run sheet review", "per_campaign"),
     kpi("Post-event reporting", "Completed within 1 week", "Report received", "per_campaign")]},
   {"name": "Reporting & Administration", "weight_pct": 10, "kpis": [
     kpi("Accuracy and completeness of reports and trackers", "Zero missing data fields", "Tracker audit", "monthly"),
     kpi("Budget tracking variance", "Within ±5% of planned", "Budget tracker", "monthly"),
     kpi("PO and invoice turnaround", "100% within defined SLAs", "Finance log", "monthly"),
     kpi("Marketing calendar and asset library currency", "Up to date 100% of the time", "Spot checks", "monthly")]},
  ],
 },
]

for person in PEOPLE:
    name = person["staff"]["full_name"]
    if req(f"staff_members?full_name=eq.{urllib.parse.quote(name)}&select=id"):
        print(f"skip (already seeded): {name}"); continue
    assert sum(a["weight_pct"] for a in person["areas"]) == 100, name
    staff = req("staff_members", person["staff"])[0]; sid = staff["id"]
    req("staff_brand_assignments", [{"staff_id": sid, "brand": b, "tier": t, "ownership": "primary"}
                                    for t, brands in TIERS.items() for b in brands], prefer="return=minimal")
    n = 0
    for ai, a in enumerate(person["areas"]):
        area = req("kpi_areas", {"staff_id": sid, "name": a["name"], "sort_order": ai, "weight_pct": a["weight_pct"]})[0]
        req("kpis", [{**k, "area_id": area["id"], "sort_order": ki} for ki, k in enumerate(a["kpis"])], prefer="return=minimal")
        n += len(a["kpis"])
    # Attach the source docx.
    src, dest = person["doc"]
    path = f"/Users/melaniekingsford/Downloads/{src}"
    if os.path.exists(path):
        with open(path, "rb") as f: blob = f.read()
        sp = f"{sid}/{dest}"
        r = urllib.request.Request(f"{U}/storage/v1/object/role-documents/{sp}", data=blob, method="POST",
            headers={"apikey": K, "Authorization": f"Bearer {K}", "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "x-upsert": "true"})
        urllib.request.urlopen(r)
        req("role_documents", {"staff_id": sid, "version": 1, "file_path": sp, "source": "uploaded", "label": "July 2026 revision (source document)"}, prefer="return=minimal")
    print(f"seeded: {name} · {len(person['areas'])} areas · {n} kpis · doc attached")
print("done — open /team")
