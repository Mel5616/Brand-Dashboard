import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Content to-do list (Asana board "Content To Do", synced into asana_tasks)
// shown on the Creative Production tab. Writes (complete / due / create / meta)
// go through /api/design — they operate per-task and are board-agnostic.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = () => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json" });

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  const [tRes, mRes] = await Promise.all([
    fetch(`${sbUrl}/rest/v1/asana_tasks?select=gid,name,notes,assignee,due_on,completed,section,project_gid,project_label,permalink_url&project_label=eq.${encodeURIComponent("Content To Do")}&completed=eq.false&order=due_on.asc.nullslast&limit=1000`, { headers: h(), cache: "no-store" }),
    fetch(`${sbUrl}/rest/v1/design_task_meta?select=task_gid,priority,notes&limit=5000`, { headers: h(), cache: "no-store" }),
  ]);
  const tasks = tRes.ok ? JSON.parse((await tRes.text()) || "[]") : [];
  const meta = mRes.ok ? JSON.parse((await mRes.text()) || "[]") : [];
  return NextResponse.json({ ok: true, tasks, meta, asanaWrite: !!process.env.ASANA_TOKEN });
}
