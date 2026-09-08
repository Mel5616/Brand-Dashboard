import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

// Pushes a campaign to the real "Marketing Campaigns & Launches" Asana
// project — the one the team actually works from (confirmed via the live
// asana_tasks mirror), not the Briefing Engine's per-channel boards. Matches
// the team's existing convention: one top-level task named "{CODE} - {campaign}"
// in the brand's section, with subtasks for each EDM send (dated, from
// campaign_sends) plus the other deliverables listed in the brief.
export const revalidate = 0;
const ASANA_BASE = "https://app.asana.com/api/1.0";
const PROJECT_GID = "1212645647009899"; // Marketing Campaigns & Launches
const asanaHeaders = () => ({ Authorization: `Bearer ${process.env.ASANA_TOKEN}`, "Content-Type": "application/json" });

// Brand name (as stored in campaigns.brand) -> Asana task-prefix code, per
// influencer_agreement_brand_config.code (the scheme actually typed into Asana).
const BRAND_CODE: Record<string, string> = {
  UPPAbaby: "UB", Frida: "FR", Nanit: "NT", smarTrike: "ST", WonderFold: "WF",
  "Gaia Baby": "GB", Hannie: "HN", Magic: "MG", Zazu: "ZZ", Mamave: "MV",
  "Matchstick Monkey": "MM", MiaMily: "MIA", Coolkidz: "CK", Portfolio: "CK",
};

// Fixed role -> assignee, per how the team actually splits campaign work.
const TEAM = {
  edm: "pierann@coolkidz.com.au", // Pier Ann — EDM
  paid: "anna@coolkidz.com.au",       // Anna Kilmartin — Paid Marketing
  affiliate: "jane@coolkidz.com.au",  // Jane Edmonds — Affiliate (UPPAbaby + Nanit only)
  design: "design@coolkidz.com.au",   // Diep — Design
  retail: "alison@coolkidz.com.au",   // Alison Soulsby — Retail
  website: "mel@coolkidz.com.au",     // Melanie — Website
};
// Socials assignee depends on who owns the brand — same split as the Social tab (src/lib/socialOwners.ts).
const SOCIAL_OWNER_EMAIL: Record<string, string> = { Nicky: "nicky@coolkidz.com.au", Alicia: "alicia@coolkidz.com.au" };
const SOCIAL_BRAND_OWNER: Record<string, string> = {
  UPPAbaby: "Nicky", Mamave: "Nicky", Frida: "Nicky", Nanit: "Nicky", Hannie: "Nicky", Coolkidz: "Nicky",
  WonderFold: "Alicia", Zazu: "Alicia", "Matchstick Monkey": "Alicia", "Gaia Baby": "Alicia", Magic: "Alicia", MiaMily: "Alicia", smarTrike: "Alicia",
};
const socialAssignee = (brand: string): string | undefined => SOCIAL_OWNER_EMAIL[SOCIAL_BRAND_OWNER[brand]];

type Category = "paid" | "affiliate" | "design" | "retail" | "website" | "social";
const CATEGORY_LABEL: Record<Category, string> = { paid: "Paid Marketing", affiliate: "Affiliate", design: "Design", retail: "Retail", website: "Website", social: "Socials" };
// Order matters — most specific first, Design catches everything left over
// (statics, reels, kits, photoshoots — the bulk of "make the assets" work).
function categorize(line: string): Category {
  if (/retail|\bpos\b|\bdoor(s)?\b/i.test(line)) return "retail";
  if (/affiliate|partner/i.test(line)) return "affiliate";
  if (/google ad|ad set|shopping feed|\bpaid\b/i.test(line)) return "paid";
  if (/landing page|\bpdp\b|configurator|capture flow|checklist landing|website/i.test(line)) return "website";
  if (/social|reel|\bstor(y|ies)\b|carousel|\bugc\b|hashtag|instagram|tiktok/i.test(line)) return "social";
  return "design";
}

// A short, role-specific brief for a subtask — not the whole campaign brief,
// just what that specialist needs (per Mel: "a short brief when we do the
// main campaign card", one per discipline, not the full document repeated).
function buildSubtaskNotes(lines: string[], extra?: string): string {
  const parts: string[] = [];
  if (extra) parts.push(escapeHtml(extra));
  if (lines.length) parts.push(`<ul>${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>`);
  return parts.length ? `<body>${parts.join("\n")}</body>` : "";
}

// Pulls just the "Social mirrors: ..." line out of the cascade field (which
// also carries "Google mirrors: ..." — not this subtask's business).
function socialCascadeLine(cascade: unknown): string | undefined {
  const m = String(cascade || "").match(/Social mirrors:[^\n]*/i);
  return m?.[0];
}

const isIsoDate = (s: string) => /^\d{4}-\d{2}-\d{2}/.test(s || "");

async function findSectionGid(name: string): Promise<string | null> {
  const res = await fetch(`${ASANA_BASE}/projects/${PROJECT_GID}/sections`, { headers: asanaHeaders() });
  if (!res.ok) return null;
  const json = await res.json();
  const target = name.trim().toLowerCase();
  const match = (json.data || []).find((s: { name: string }) => s.name.trim().toLowerCase() === target || s.name.trim().toLowerCase().startsWith(target));
  return match?.gid ?? null;
}

async function createSection(name: string): Promise<string | null> {
  const res = await fetch(`${ASANA_BASE}/projects/${PROJECT_GID}/sections`, { method: "POST", headers: asanaHeaders(), body: JSON.stringify({ data: { name } }) });
  if (!res.ok) return null;
  return (await res.json()).data?.gid ?? null;
}

async function addTaskToSection(taskGid: string, sectionGid: string) {
  await fetch(`${ASANA_BASE}/sections/${sectionGid}/addTask`, { method: "POST", headers: asanaHeaders(), body: JSON.stringify({ data: { task: taskGid } }) });
}

async function createSubtask(parentGid: string, name: string, opts?: { dueOn?: string | null; assignee?: string; htmlNotes?: string }) {
  const data: Record<string, unknown> = { name };
  if (opts?.dueOn && isIsoDate(opts.dueOn)) data.due_on = opts.dueOn;
  if (opts?.assignee) data.assignee = opts.assignee;
  if (opts?.htmlNotes) data.html_notes = opts.htmlNotes;
  await fetch(`${ASANA_BASE}/tasks/${parentGid}/subtasks`, { method: "POST", headers: asanaHeaders(), body: JSON.stringify({ data }) });
}

const escapeHtml = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Multi-line brief fields (do/dont/compliance/dependencies/cascade) are stored
// as "\n"-separated lines — render each as a bullet so it reads like the
// dashboard's brief drawer, not a wall of text.
function block(label: string, value: unknown): string {
  const text = String(value || "").trim();
  if (!text) return "";
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const body = lines.length > 1
    ? `<ul>${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>`
    : escapeHtml(lines[0] || "");
  return `<strong>${escapeHtml(label)}</strong>\n${body}`;
}

// Full brief in Asana's rich-text format, so staff get real direction on the
// task card itself and don't have to open the dashboard to know what to do.
function buildNotes(c: any): string {
  const b = c.brief || {};
  const parts = [
    b.oneLiner ? escapeHtml(b.oneLiner) : "",
    block("Objective", b.objective),
    block("Why now", b.whyNow),
    block("Audience", b.audience),
    block("Key message", b.keyMessage),
    block("Offer / mechanic", b.offerMechanic),
    block("Channels", b.channels),
    block("Creative direction", b.creativeDirection),
    block("Do", b.do),
    block("Don't", b.dont),
    block("Send cascade", b.cascade),
    block("Success measure", b.successMeasure),
    block("Dependencies / ready to launch", b.dependencies),
    block("Compliance", b.compliance),
  ].filter(Boolean);
  return `<body>${parts.join("\n")}</body>`;
}

export async function POST(req: Request) {
  const access = await getAccess();
  if (access.role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  if (!process.env.ASANA_TOKEN) return NextResponse.json({ ok: false, error: "ASANA_TOKEN not configured" }, { status: 500 });

  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const id = String(b.id || "");
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });

  const sb = await createClient();
  const { data: c } = await sb.from("campaigns").select("*").eq("id", id).single();
  if (!c) return NextResponse.json({ ok: false, error: "Campaign not found" }, { status: 404 });

  const code = BRAND_CODE[c.brand] || c.brand.slice(0, 2).toUpperCase();
  const taskName = `${code} - ${c.campaign}`;
  const htmlNotes = buildNotes(c);
  const dueOn = isIsoDate(c.key_date) ? c.key_date : null;

  try {
    let taskGid: string = c.asana_task_gid || "";

    if (taskGid) {
      // Already pushed — just refresh the main task, don't re-create subtasks.
      const res = await fetch(`${ASANA_BASE}/tasks/${taskGid}`, {
        method: "PUT", headers: asanaHeaders(), body: JSON.stringify({ data: { name: taskName, html_notes: htmlNotes, ...(dueOn ? { due_on: dueOn } : {}) } }),
      });
      if (!res.ok) throw new Error((await res.text()).slice(0, 200));
    } else {
      const createRes = await fetch(`${ASANA_BASE}/tasks`, {
        method: "POST", headers: asanaHeaders(),
        body: JSON.stringify({ data: { name: taskName, html_notes: htmlNotes, projects: [PROJECT_GID], ...(dueOn ? { due_on: dueOn } : {}) } }),
      });
      if (!createRes.ok) throw new Error((await createRes.text()).slice(0, 200));
      const created = (await createRes.json()).data;
      taskGid = created.gid;

      // Drop into the brand's section (find, else create one).
      let sectionGid = await findSectionGid(c.brand);
      if (!sectionGid) sectionGid = await createSection(c.brand);
      if (sectionGid) await addTaskToSection(taskGid, sectionGid);

      // Subtasks — simplified to how the team actually splits the work:
      // one dated subtask per EDM send (always Pier Ann), plus one subtask
      // per discipline (Paid Marketing / Socials / Design / Retail / Website
      // / Affiliate) grouping the relevant deliverable lines, each with a
      // short brief for that specialist rather than the whole campaign brief.
      const edmExtra = [c.brief?.keyMessage, c.brief?.edmBrief].filter(Boolean).join(" — ");
      const edmNotes = buildSubtaskNotes([], edmExtra);
      const { data: sends } = await sb.from("campaign_sends").select("send_date,subject").eq("campaign_id", id).order("send_date", { ascending: true });
      for (const s of sends || []) {
        await createSubtask(taskGid, `${code} - ${s.subject}`, { dueOn: s.send_date, assignee: TEAM.edm || undefined, htmlNotes: edmNotes });
      }

      const deliverables = String(c.brief?.deliverables || "").split("\n").map((l: string) => l.trim()).filter(Boolean);
      const buckets: Record<Category, string[]> = { paid: [], affiliate: [], design: [], retail: [], website: [], social: [] };
      for (const line of deliverables) {
        if (/^\d+\s*edm/i.test(line)) continue; // already covered by dated send subtasks
        let cat = categorize(line);
        if (cat === "affiliate" && c.brand !== "UPPAbaby" && c.brand !== "Nanit") cat = "design";
        buckets[cat].push(line);
      }

      const social = socialCascadeLine(c.brief?.cascade);
      if (social) buckets.social.push(social);
      if (c.brief?.creativeDirection) buckets.design.push(c.brief.creativeDirection);

      // Explicit per-discipline requirements from the brief drawer (edmBrief
      // is handled above) — these take priority over the guessed deliverable
      // categorisation, which stays as a fallback for older/looser briefs.
      const CATEGORY_BRIEF_FIELD: Record<Category, string> = {
        paid: "paidBrief", affiliate: "affiliateBrief", design: "designBrief",
        retail: "retailBrief", website: "websiteBrief", social: "socialsBrief",
      };

      for (const cat of Object.keys(buckets) as Category[]) {
        if (cat === "affiliate" && c.brand !== "UPPAbaby" && c.brand !== "Nanit") continue;
        const explicit = c.brief?.[CATEGORY_BRIEF_FIELD[cat]];
        if (!buckets[cat].length && !explicit) continue;
        const assignee = cat === "social" ? socialAssignee(c.brand) : TEAM[cat];
        const extraParts = [explicit, cat === "paid" || cat === "website" ? c.brief?.offerMechanic : undefined].filter(Boolean);
        await createSubtask(taskGid, CATEGORY_LABEL[cat], { assignee, htmlNotes: buildSubtaskNotes(buckets[cat], extraParts.join(" — ")) });
      }
    }

    const getRes = await fetch(`${ASANA_BASE}/tasks/${taskGid}?opt_fields=permalink_url`, { headers: asanaHeaders() });
    const permalink = getRes.ok ? (await getRes.json()).data?.permalink_url : null;

    await sb.from("campaigns").update({ asana_task_gid: taskGid, asana_permalink_url: permalink || c.asana_permalink_url || null }).eq("id", id);
    return NextResponse.json({ ok: true, taskGid, permalink });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e.message || e).slice(0, 300) }, { status: 500 });
  }
}
