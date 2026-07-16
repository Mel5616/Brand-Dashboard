import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Creative production jobs (shoots + design). GET lists (any signed-in user).
// POST performs an action (admin): job.save (create/update, auto-stamps
// delivered_date when moved to delivered) and job.delete.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const missing = (s: number, b: string) => s === 404 || /PGRST205|does not exist|schema cache/i.test(b);
const rest = (p: string, init?: RequestInit) => fetch(`${sbUrl}/rest/v1/${p}`, { ...init, headers: h((init?.headers as any) || {}), cache: "no-store" });
const iso = () => new Date().toISOString();

const STATUSES = ["requested", "in_progress", "review", "delivered"];
const TYPES = ["Shoot", "Design", "Video", "Other"];

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false, jobs: [] }, { status: 401 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false, jobs: [] }, { status: 500 });
  const res = await rest("creative_jobs?select=*&order=due_date.asc.nullslast,created_at.desc");
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: true, needsSetup: missing(res.status, text), jobs: [] });
  return NextResponse.json({ ok: true, jobs: JSON.parse(text || "[]") });
}

export async function POST(req: Request) {
  const access = await getAccess();
  if (access.role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }

  if (b.action === "job.delete") {
    if (!b.id) return NextResponse.json({ ok: false }, { status: 400 });
    const res = await rest(`creative_jobs?id=eq.${encodeURIComponent(b.id)}`, { method: "DELETE" });
    return NextResponse.json({ ok: res.ok });
  }

  if (b.action === "job.save") {
    const status = STATUSES.includes(b.status) ? b.status : "requested";
    const row: any = {
      title: String(b.title || "").slice(0, 200),
      type: TYPES.includes(b.type) ? b.type : "Design",
      brand: String(b.brand || "").slice(0, 80),
      owner_id: b.owner_id || null,
      status,
      priority: ["low", "normal", "high"].includes(b.priority) ? b.priority : "normal",
      due_date: b.due_date || null,
      asset_url: String(b.asset_url || "").slice(0, 500),
      notes: String(b.notes || "").slice(0, 12000),   // full briefs live here
      checklist: Array.isArray(b.checklist) ? b.checklist.slice(0, 100).map((c: any) => ({ text: String(c.text || "").slice(0, 200), done: !!c.done })) : [],
      updated_at: iso(),
    };
    if (!row.title) return NextResponse.json({ ok: false, error: "Title required" }, { status: 400 });
    // Stamp / clear the delivery date so turnaround is accurate.
    if (status === "delivered") row.delivered_date = b.delivered_date || new Date().toISOString().slice(0, 10);
    else row.delivered_date = null;
    if (!b.id) { row.requested_date = b.requested_date || new Date().toISOString().slice(0, 10); row.created_by = access.user?.email ?? null; }

    const res = b.id
      ? await rest(`creative_jobs?id=eq.${encodeURIComponent(b.id)}`, { method: "PATCH", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(row) })
      : await rest("creative_jobs", { method: "POST", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(row) });
    const text = await res.text();
    if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text), error: text.slice(0, 200) }, { status: 500 });
    return NextResponse.json({ ok: true, item: JSON.parse(text)[0] });
  }

  return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
}
