// Coolkidz Briefing Engine — shared types, the compliance-aware prompt builder,
// and the Asana write helpers. Brand-agnostic: everything reads from the brand
// profile so adding a brand is inserting a brand_profiles row, never code.

export type Flag = { level: "must" | "check"; note: string };
export type Pillar = { id: string; name: string; desc: string };
export type Moment = { id: string; name: string; pillar: string; objective: string; focus: string };
export type Channel = { id: string; name: string; presets: string; role: string };

export type BrandProfile = {
  essence: string;
  brandLine: string;
  positioning: string;
  hero: string;
  audience: { primary: string; split: string };
  pillars: Pillar[];
  moments: Moment[];
  channels: Channel[];
  mandatory: string[];
  exclusions: string[];
  standingFlags: Flag[];
};

export type BrandRow = { id: string; slug: string; name: string; tier: "A" | "B" | "C"; profile: BrandProfile };
export type Deliverable = { id: string; presets: string; copy_direction: string; visual_direction: string };

// ── Compliance-aware prompt builder ────────────────────────────────────────
export function buildSystemPrompt(brandName: string, p: BrandProfile, pillar: Pillar, moment: Moment, selected: Channel[], focus: string, live?: { siteContext?: string; market?: string }) {
  return `You write marketing briefs for ${brandName}, distributed by Coolkidz Australia.
You produce creative direction only. You never invent facts, statistics, regulatory status or product specs.

BRAND
Essence: ${p.essence}
Brand line: ${p.brandLine}
Positioning: ${p.positioning}
Hero: ${p.hero}
Audience: ${p.audience.primary} ${p.audience.split}
${live?.siteContext ? `\nCURRENT FROM THE BRAND WEBSITE (live, authoritative for product names and the current range):\n${live.siteContext}\nUse these exact product names. Do not reference products that are not on this list.\n` : ""}
PILLAR FOR THIS BRIEF: ${pillar.name}. ${pillar.desc}
CAMPAIGN MOMENT: ${moment.name}. Objective: ${moment.objective}. Focus: ${moment.focus}

HARD RULES
- Australian English throughout. No em dashes anywhere.
- Education-led and reassurance-led. Never fear-based. Never discount-led.
- Honour every standing compliance flag for this brand:
${p.standingFlags.map((f) => `  - ${f.level.toUpperCase()}: ${f.note}`).join("\n")}
- Do not assert any regulatory status. Soften or flag claims rather than stating them as fact.
- Direction must be specific and usable by a designer and a copywriter, not generic.
${live?.market !== undefined ? `
LIVE MARKET CONTEXT
Use the web_search tool to check current ${live.market || "category"} news, seasonal timing and competitor activity in Australia relevant to this moment. Treat everything you find as BACKGROUND CONTEXT ONLY:
- Never lift a statistic, claim, regulatory status, price or efficacy statement from a search result into the brief.
- The standing compliance flags above always win. If a search result conflicts with them, ignore it.
- Use search only to keep the angle timely and relevant, never to make a factual assertion.
` : ""}
Return ONLY valid JSON, no preamble, no markdown fences, in exactly this shape:
{
  "title": "short campaign or brief name",
  "concept": "2 to 3 sentence creative concept tying the pillar to the moment",
  "key_message": "one sentence the whole brief ladders up to",
  "audience_note": "one line on the discovery vs conversion angle for this moment",
  "channels": [
    { "id": "channel id", "copy_direction": "1 to 2 sentences", "visual_direction": "1 to 2 sentences" }
  ]
}
Channel ids to include, in this order: ${selected.map((c) => c.id).join(", ")}.
${selected.some((c) => c.id === "blog") ? `For the blog channel: put the angle and hook in copy_direction, and SEO and structure guidance in visual_direction (target keyword, H2/H3 outline, internal links, FAQ, target word count). Blogs do not need art direction.` : ""}
${focus ? `Specific product or angle focus from the lead: ${focus}` : ""}`;
}

// ── Live brand-site context (Shopify) ──────────────────────────────────────
// Pulls the current product range from the brand's Shopify site so briefs use the
// real, current SKUs. Reliable structured feed, no scraping. Fails soft.
export async function fetchSiteContext(siteUrl?: string): Promise<string> {
  if (!siteUrl) return "";
  const base = siteUrl.replace(/\/$/, "");
  const out: string[] = [];
  try {
    const r = await fetch(`${base}/products.json?limit=50`, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (r.ok) {
      const j = await r.json();
      const names = (j.products || []).map((p: { title?: string }) => p.title).filter(Boolean).slice(0, 40);
      if (names.length) out.push(`Current product range (${names.length} live): ${names.join("; ")}`);
    }
  } catch { /* site feed unavailable — fall back to the profile */ }
  return out.join("\n");
}

// ── Asana routing (real GIDs) ──────────────────────────────────────────────
// Downstream channel boards a brief flows to once approved. Workspace: Coolkidz
// Australia (497448915301999). Other 11 brands added as their profiles are baked in.
export const ASANA_ROUTES: Record<string, Record<string, string>> = {
  nanit: {
    social: "1212637192218254",   // Nanit (Social Media Pages 2026)
    edm: "1212637191678633",      // Nanit EDMs (Email Marketing 2026)
    blog: "1213417959049946",     // Blogs board (the content pipeline)
    _default: "1205954873551895", // Design To Do List (Diep) — paid, pdp, affiliate, event
  },
};
export const BRIEFING_ENGINE_PROJECT = process.env.BRIEFING_ENGINE_PROJECT_GID || "";
export const DRAFTED_SECTION_NAME = "Drafted · needs Mel";
export const APPROVED_SECTION_NAME = "Approved";
// While true, approvals push back into the Briefing Engine board (Approved section)
// instead of the live downstream brand boards, so the flow can be tested safely.
// Set BRIEFING_STAGING=false in Vercel (or flip this) to go live.
export const BRIEFING_STAGING = process.env.BRIEFING_STAGING !== "false";

// ── Asana write helpers ────────────────────────────────────────────────────
const ASANA_BASE = "https://app.asana.com/api/1.0";
function asanaHeaders() {
  return { Authorization: `Bearer ${process.env.ASANA_TOKEN!}`, "Content-Type": "application/json" };
}

async function findSectionGid(projectGid: string, name: string): Promise<string | null> {
  const res = await fetch(`${ASANA_BASE}/projects/${projectGid}/sections`, { headers: asanaHeaders() });
  const json = await res.json();
  const match = (json.data || []).find((s: { name: string }) => s.name === name);
  return match?.gid ?? null;
}

export async function createBriefTask(opts: {
  projectGid: string; sectionName?: string; name: string; htmlNotes: string; assignee?: string; dueOn?: string | null;
}): Promise<string | null> {
  const body: { data: Record<string, unknown> } = {
    data: { name: opts.name, projects: [opts.projectGid], html_notes: opts.htmlNotes },
  };
  if (opts.assignee) body.data.assignee = opts.assignee;
  if (opts.dueOn) body.data.due_on = opts.dueOn;

  const res = await fetch(`${ASANA_BASE}/tasks`, { method: "POST", headers: asanaHeaders(), body: JSON.stringify(body) });
  const json = await res.json();
  const taskGid = json.data?.gid ?? null;

  if (opts.sectionName && taskGid) {
    const sectionGid = await findSectionGid(opts.projectGid, opts.sectionName);
    if (sectionGid) {
      await fetch(`${ASANA_BASE}/sections/${sectionGid}/addTask`, {
        method: "POST", headers: asanaHeaders(), body: JSON.stringify({ data: { task: taskGid } }),
      });
    }
  }
  return taskGid;
}

function escapeHtml(s = ""): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Builds the Asana task notes from a brief.
export function briefToHtmlNotes(b: any, brandName: string, tier: string): string {
  const flags = (b.compliance_flags || []).map((f: Flag) => `<li><strong>${f.level.toUpperCase()}:</strong> ${escapeHtml(f.note)}</li>`).join("");
  const deliv = (b.deliverables || []).map((d: Deliverable) => `<li><strong>${escapeHtml(d.id)}:</strong> ${escapeHtml(d.copy_direction)} ${escapeHtml(d.visual_direction)}</li>`).join("");
  const mand = (b.mandatory || []).map((m: string) => `<li>${escapeHtml(m)}</li>`).join("");
  return `<body><strong>${escapeHtml(brandName)} (Tier ${escapeHtml(tier)})</strong>
<ul><li><strong>Moment:</strong> ${escapeHtml(b.moment)}</li>
<li><strong>Pillar:</strong> ${escapeHtml(b.pillar)}</li>
<li><strong>Channels:</strong> ${escapeHtml((b.channels || []).join(", "))}</li></ul>
<strong>Key message</strong><ul><li>${escapeHtml(b.key_message)}</li></ul>
<strong>Deliverables</strong><ul>${deliv}</ul>
<strong>Mandatory</strong><ul>${mand}</ul>
<strong>Compliance flags</strong><ul>${flags}</ul></body>`;
}
