import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Design board: all synced Asana design boards in one place, with a dashboard-
// managed priority queue and real edits written back to Asana (complete, due
// date, quick-add). Asana remains the source of truth for tasks; the queue
// order lives here.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const missing = (s: number, b: string) => s === 404 || /PGRST205|does not exist|schema cache/i.test(b);
const rest = (p: string, init?: RequestInit) => fetch(`${sbUrl}/rest/v1/${p}`, { ...init, headers: h((init?.headers as any) || {}), cache: "no-store" });

const ASANA = "https://app.asana.com/api/1.0";
const asanaHeaders = () => ({ Authorization: `Bearer ${process.env.ASANA_TOKEN!}`, "Content-Type": "application/json" });

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  const compCutoff = new Date(Date.now() - 120 * 86400_000).toISOString();
  const taskSelect = (withReq: boolean) => `asana_tasks?select=gid,name,notes,assignee,due_on,completed,section,project_gid,project_label,permalink_url,modified_at${withReq ? ",requested_by" : ""}&project_label=not.in.(${encodeURIComponent('"Blogs","Content To Do","Stock Report"')})&order=due_on.asc.nullslast&limit=5000`;
  const [tResFirst, pRes, mRes, cRes, campRes] = await Promise.all([
    rest(taskSelect(true)),
    rest("design_priorities?select=*&order=rank.asc"),
    rest("design_task_meta?select=task_gid,priority,notes,updated_by,updated_at&limit=5000"),
    rest(`design_completions?select=task_gid,name,project_label,due_on,created_at_asana,completed_at,source&completed_at=gte.${compCutoff}&order=completed_at.desc&limit=2000`),
    rest(`campaigns?select=id,campaign,brand,status,key_date,end_date,share_token,brief&brief->>designRequired=eq.true&order=key_date.asc.nullslast`),
  ]);
  // requested_by may not exist yet (add_asana_requested_by.sql) — retry without.
  let tRes = tResFirst;
  let tText = await tRes.text();
  if (!tRes.ok && /requested_by/.test(tText)) { tRes = await rest(taskSelect(false)); tText = await tRes.text(); }
  if (!tRes.ok) return NextResponse.json({ ok: true, needsSetup: missing(tRes.status, tText), tasks: [], priorities: [] });
  const pText = pRes.ok ? await pRes.text() : "[]";
  const mText = mRes.ok ? await mRes.text() : "[]";
  const cText = cRes.ok ? await cRes.text() : "[]";
  const campText = campRes.ok ? await campRes.text() : "[]";
  return NextResponse.json({
    ok: true,
    tasks: JSON.parse(tText || "[]"),
    priorities: pRes.ok ? JSON.parse(pText || "[]") : [],
    meta: mRes.ok ? JSON.parse(mText || "[]") : [],
    completions: cRes.ok ? JSON.parse(cText || "[]") : [],
    designCampaigns: campRes.ok
      ? JSON.parse(campText || "[]").map((c: any) => ({ id: c.id, campaign: c.campaign, brand: c.brand, status: c.status, key_date: c.key_date, end_date: c.end_date, briefUrl: c.share_token ? `/c/${c.share_token}` : null, oneLiner: c.brief?.oneLiner ?? "" }))
      : [],
    prioritiesSetup: pRes.ok || !missing(pRes.status, pText),
    metaSetup: mRes.ok,
    asanaWrite: !!process.env.ASANA_TOKEN,
    aiReady: !!process.env.ANTHROPIC_API_KEY,
  });
}

export async function POST(req: Request) {
  const access = await getAccess();
  if (!access.role) return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const admin = access.role === "admin";
  const by = access.user?.email ?? null;

  // ── Priority queue (admin sets priorities) ──
  const BUCKETS = ["urgent", "week", "next", "soon"];
  if (b.action === "priority.add") {
    if (!admin) return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
    if (!b.task_gid) return NextResponse.json({ ok: false }, { status: 400 });
    const bucket = BUCKETS.includes(b.bucket) ? b.bucket : "week";
    const cur = await rest("design_priorities?select=rank&order=rank.desc&limit=1");
    const rows = cur.ok ? JSON.parse((await cur.text()) || "[]") : [];
    const rank = (rows[0]?.rank ?? 0) + 1;
    const row: any = { task_gid: String(b.task_gid), rank, added_by: by, bucket };
    let res = await rest("design_priorities?on_conflict=task_gid", { method: "POST", headers: h({ Prefer: "resolution=merge-duplicates,return=representation" }), body: JSON.stringify(row) });
    let text = await res.text();
    if (!res.ok && /bucket/.test(text)) {
      // bucket column not added yet — fall back to the plain queue
      delete row.bucket;
      res = await rest("design_priorities?on_conflict=task_gid", { method: "POST", headers: h({ Prefer: "resolution=merge-duplicates,return=representation" }), body: JSON.stringify(row) });
      text = await res.text();
    }
    if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text) }, { status: 500 });
    return NextResponse.json({ ok: true, item: JSON.parse(text)[0] });
  }
  if (b.action === "priority.bucket") {
    if (!admin) return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
    if (!b.task_gid || !BUCKETS.includes(b.bucket)) return NextResponse.json({ ok: false }, { status: 400 });
    const res = await rest(`design_priorities?task_gid=eq.${encodeURIComponent(String(b.task_gid))}`, { method: "PATCH", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify({ bucket: b.bucket }) });
    if (!res.ok) return NextResponse.json({ ok: false, error: "Run the bucket SQL first" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (b.action === "priority.remove") {
    if (!admin) return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
    const res = await rest(`design_priorities?task_gid=eq.${encodeURIComponent(String(b.task_gid))}`, { method: "DELETE" });
    return NextResponse.json({ ok: res.ok });
  }
  if (b.action === "priority.reorder") {
    if (!admin) return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
    const order: string[] = Array.isArray(b.order) ? b.order : [];
    for (let i = 0; i < order.length; i++) {
      await rest(`design_priorities?task_gid=eq.${encodeURIComponent(order[i])}`, { method: "PATCH", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify({ rank: i + 1 }) });
    }
    return NextResponse.json({ ok: true });
  }

  // ── Task meta (dashboard-owned; never touches Asana) ──
  if (b.action === "meta.set") {
    if (!b.gid) return NextResponse.json({ ok: false }, { status: 400 });
    if (b.priority !== undefined && !admin) return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
    const row: any = { task_gid: String(b.gid), updated_by: by, updated_at: new Date().toISOString() };
    if (b.priority !== undefined) row.priority = ["high", "medium", "low"].includes(b.priority) ? b.priority : null;
    if (b.notes !== undefined) row.notes = String(b.notes ?? "").slice(0, 4000) || null;
    const res = await rest("design_task_meta?on_conflict=task_gid", { method: "POST", headers: h({ Prefer: "resolution=merge-duplicates,return=representation" }), body: JSON.stringify(row) });
    const text = await res.text();
    if (!res.ok) return NextResponse.json({ ok: false, error: missing(res.status, text) ? "Run add_design_meta.sql first" : "Save failed" }, { status: 500 });
    return NextResponse.json({ ok: true, item: JSON.parse(text)[0] });
  }

  // ── Asana write-backs ──
  if (!process.env.ASANA_TOKEN) return NextResponse.json({ ok: false, error: "ASANA_TOKEN not configured" }, { status: 500 });

  if (b.action === "task.complete") {
    // Any signed-in user (the designer marks her own work done).
    if (!b.gid) return NextResponse.json({ ok: false }, { status: 400 });
    const gid = encodeURIComponent(String(b.gid));
    // Grab the mirror row before it's marked done — feeds the completion log.
    const mirror = await rest(`asana_tasks?select=name,project_label,due_on&gid=eq.${gid}&limit=1`);
    const mrow = mirror.ok ? (JSON.parse((await mirror.text()) || "[]")[0] ?? null) : null;
    const res = await fetch(`${ASANA}/tasks/${encodeURIComponent(String(b.gid))}`, { method: "PUT", headers: asanaHeaders(), body: JSON.stringify({ data: { completed: true } }) });
    if (!res.ok) return NextResponse.json({ ok: false, error: `Asana: ${(await res.text()).slice(0, 150)}` }, { status: 502 });
    await Promise.all([
      rest(`asana_tasks?gid=eq.${gid}`, { method: "PATCH", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify({ completed: true, completed_at: new Date().toISOString() }) }),
      rest(`design_priorities?task_gid=eq.${gid}`, { method: "DELETE" }),
      rest(`design_task_meta?task_gid=eq.${gid}`, { method: "DELETE" }),
      rest("design_completions?on_conflict=task_gid", { method: "POST", headers: h({ Prefer: "resolution=ignore-duplicates,return=minimal" }), body: JSON.stringify({ task_gid: String(b.gid), name: mrow?.name ?? null, project_label: mrow?.project_label ?? null, due_on: mrow?.due_on ?? null, completed_at: new Date().toISOString(), source: "dashboard" }) }),
    ]);
    return NextResponse.json({ ok: true });
  }

  if (b.action === "task.due") {
    if (!admin) return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
    if (!b.gid) return NextResponse.json({ ok: false }, { status: 400 });
    const due_on = b.due_on ? String(b.due_on).slice(0, 10) : null;
    const res = await fetch(`${ASANA}/tasks/${encodeURIComponent(String(b.gid))}`, { method: "PUT", headers: asanaHeaders(), body: JSON.stringify({ data: { due_on } }) });
    if (!res.ok) return NextResponse.json({ ok: false, error: `Asana: ${(await res.text()).slice(0, 150)}` }, { status: 502 });
    await rest(`asana_tasks?gid=eq.${encodeURIComponent(String(b.gid))}`, { method: "PATCH", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify({ due_on }) });
    return NextResponse.json({ ok: true });
  }

  if (b.action === "task.create") {
    // Any signed-in user can request design work; it lands straight on the board.
    const name = String(b.name || "").trim().slice(0, 200);
    const project_gid = String(b.project_gid || "").trim();
    if (!name || !project_gid) return NextResponse.json({ ok: false, error: "Task name and board required" }, { status: 400 });
    const data: any = { name, projects: [project_gid] };
    if (b.notes) data.notes = String(b.notes).slice(0, 2000);
    if (b.due_on) data.due_on = String(b.due_on).slice(0, 10);
    const res = await fetch(`${ASANA}/tasks`, { method: "POST", headers: asanaHeaders(), body: JSON.stringify({ data }) });
    const out = await res.json().catch(() => null);
    if (!res.ok || !out?.data?.gid) return NextResponse.json({ ok: false, error: `Asana: ${JSON.stringify(out).slice(0, 150)}` }, { status: 502 });
    const t = out.data;
    const row: any = {
      gid: t.gid, name, notes: data.notes ?? "", assignee: null, due_on: data.due_on ?? null,
      completed: false, section: "", status: "", priority: "", project_gid,
      project_label: String(b.project_label || "").slice(0, 120) || null,
      permalink_url: t.permalink_url ?? null, modified_at: new Date().toISOString(),
      requested_by: by ? String(by).split("@")[0] : null,
    };
    let up = await rest("asana_tasks?on_conflict=gid", { method: "POST", headers: h({ Prefer: "resolution=merge-duplicates,return=minimal" }), body: JSON.stringify(row) });
    if (!up.ok && /requested_by/.test(await up.text())) {
      delete row.requested_by;
      up = await rest("asana_tasks?on_conflict=gid", { method: "POST", headers: h({ Prefer: "resolution=merge-duplicates,return=minimal" }), body: JSON.stringify(row) });
    }
    return NextResponse.json({ ok: true, item: row });
  }

  return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
}
