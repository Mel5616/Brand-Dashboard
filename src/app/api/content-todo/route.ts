import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Content to-do list (Asana board "Content To Do", synced into asana_tasks)
// shown on the Creative Production tab. Writes (complete / due / create / meta)
// go through /api/design — they operate per-task and are board-agnostic.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = () => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json" });

export async function GET(req: Request) {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  const label = new URL(req.url).searchParams.get("label") || "Content To Do";
  const sel = (extra: string) => `${sbUrl}/rest/v1/asana_tasks?select=gid,name,notes,assignee,due_on,completed,section,project_gid,project_label,permalink_url,modified_at${extra}&project_label=eq.${encodeURIComponent(label)}&completed=eq.false&order=due_on.asc.nullslast&limit=1000`;
  let [tRes, mRes] = await Promise.all([
    fetch(sel(",requested_by,custom_fields"), { headers: h(), cache: "no-store" }),
    fetch(`${sbUrl}/rest/v1/design_task_meta?select=task_gid,priority,notes&limit=5000`, { headers: h(), cache: "no-store" }),
  ]);
  // Newer columns may not exist yet — degrade gracefully.
  if (!tRes.ok) {
    const msg = await tRes.text();
    if (/custom_fields/.test(msg)) tRes = await fetch(sel(",requested_by"), { headers: h(), cache: "no-store" });
    if (!tRes.ok && /requested_by/.test(msg)) tRes = await fetch(sel(""), { headers: h(), cache: "no-store" });
  }
  const tasks = tRes.ok ? JSON.parse((await tRes.text()) || "[]") : [];
  const meta = mRes.ok ? JSON.parse((await mRes.text()) || "[]") : [];
  return NextResponse.json({ ok: true, tasks, meta, asanaWrite: !!process.env.ASANA_TOKEN });
}
