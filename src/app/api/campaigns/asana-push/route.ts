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

async function createSubtask(parentGid: string, name: string, dueOn?: string | null) {
  const data: Record<string, unknown> = { name };
  if (dueOn && isIsoDate(dueOn)) data.due_on = dueOn;
  await fetch(`${ASANA_BASE}/tasks/${parentGid}/subtasks`, { method: "POST", headers: asanaHeaders(), body: JSON.stringify({ data }) });
}

function buildNotes(c: any): string {
  const b = c.brief || {};
  const lines = [
    b.oneLiner, "",
    b.objective ? `Objective: ${b.objective}` : null,
    b.whyNow ? `Why now: ${b.whyNow}` : null,
    b.audience ? `Audience: ${b.audience}` : null,
    b.offerMechanic ? `Offer/mechanic: ${b.offerMechanic}` : null,
    b.successMeasure ? `Success measure: ${b.successMeasure}` : null,
  ].filter((x) => x !== null);
  return lines.join("\n");
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
  const notes = buildNotes(c);
  const dueOn = isIsoDate(c.key_date) ? c.key_date : null;

  try {
    let taskGid: string = c.asana_task_gid || "";

    if (taskGid) {
      // Already pushed — just refresh the main task, don't re-create subtasks.
      const res = await fetch(`${ASANA_BASE}/tasks/${taskGid}`, {
        method: "PUT", headers: asanaHeaders(), body: JSON.stringify({ data: { name: taskName, notes, ...(dueOn ? { due_on: dueOn } : {}) } }),
      });
      if (!res.ok) throw new Error((await res.text()).slice(0, 200));
    } else {
      const createRes = await fetch(`${ASANA_BASE}/tasks`, {
        method: "POST", headers: asanaHeaders(),
        body: JSON.stringify({ data: { name: taskName, notes, projects: [PROJECT_GID], ...(dueOn ? { due_on: dueOn } : {}) } }),
      });
      if (!createRes.ok) throw new Error((await createRes.text()).slice(0, 200));
      const created = (await createRes.json()).data;
      taskGid = created.gid;

      // Drop into the brand's section (find, else create one).
      let sectionGid = await findSectionGid(c.brand);
      if (!sectionGid) sectionGid = await createSection(c.brand);
      if (sectionGid) await addTaskToSection(taskGid, sectionGid);

      // Subtasks: one per dated EDM send tied to this campaign...
      const { data: sends } = await sb.from("campaign_sends").select("send_date,subject").eq("campaign_id", id).order("send_date", { ascending: true });
      for (const s of sends || []) {
        await createSubtask(taskGid, `${code} - ${s.subject}`, s.send_date);
      }
      // ...plus the other deliverables (assets, reels, statics) with no date.
      const deliverables = String(c.brief?.deliverables || "").split("\n").map((l: string) => l.trim()).filter(Boolean);
      for (const line of deliverables) {
        if (/^\d+\s*edm/i.test(line)) continue; // already covered by dated send subtasks
        await createSubtask(taskGid, line);
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
