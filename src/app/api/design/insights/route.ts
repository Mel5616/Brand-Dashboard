import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// AI read of the design board: workload, overdue risk and throughput per brand,
// distilled into a short "who gets priority this week" briefing.
export const revalidate = 0;
export const maxDuration = 60;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = () => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json" });
const rest = (p: string) => fetch(`${sbUrl}/rest/v1/${p}`, { headers: h(), cache: "no-store" }).then(async r => (r.ok ? JSON.parse((await r.text()) || "[]") : []));

export async function POST() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });

  const compCutoff = new Date(Date.now() - 42 * 86400_000).toISOString();
  const [tasks, meta, queue, comps] = await Promise.all([
    rest("asana_tasks?select=gid,name,due_on,project_label&project_label=neq.Blogs&completed=eq.false&limit=5000"),
    rest("design_task_meta?select=task_gid,priority,notes&limit=5000"),
    rest("design_priorities?select=task_gid&order=rank.asc"),
    rest(`design_completions?select=project_label,due_on,completed_at&completed_at=gte.${compCutoff}&limit=2000`),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const metaBy = new Map<string, any>(meta.map((m: any) => [m.task_gid, m]));
  const queued = new Set(queue.map((q: any) => q.task_gid));

  // Per-board rollup the model can reason over without seeing 140 raw tasks.
  const boards = new Map<string, any>();
  for (const t of tasks) {
    const label = t.project_label || "Other";
    const b = boards.get(label) ?? { label, open: 0, overdue: 0, high: 0, queued: 0, noDue: 0, soonest: null as string | null, overdueTasks: [] as string[] };
    b.open++;
    if (!t.due_on) b.noDue++;
    else if (t.due_on < today) { b.overdue++; if (b.overdueTasks.length < 4) b.overdueTasks.push(`${t.name} (due ${t.due_on})`); }
    if (t.due_on && (!b.soonest || t.due_on < b.soonest)) b.soonest = t.due_on;
    if (metaBy.get(t.gid)?.priority === "high") b.high++;
    if (queued.has(t.gid)) b.queued++;
    boards.set(label, b);
  }
  const throughput = new Map<string, { done: number; late: number }>();
  for (const c of comps) {
    const t = throughput.get(c.project_label || "Other") ?? { done: 0, late: 0 };
    t.done++;
    if (c.due_on && c.completed_at?.slice(0, 10) > c.due_on) t.late++;
    throughput.set(c.project_label || "Other", t);
  }
  const summary = [...boards.values()].map(b => ({ ...b, done6w: throughput.get(b.label)?.done ?? 0, late6w: throughput.get(b.label)?.late ?? 0 }));

  const userMsg = `You are the marketing operations analyst for Coolkidz Brands (Australian nursery/baby brand distributor). One graphic designer services all these boards. Today is ${today}. Weeks run Sunday-Saturday.

Per-board design workload (EDM · Brand = email design, Social · Brand = social design). "queued" = already on this week's priority list; "done6w"/"late6w" = tasks completed / completed late in the last 6 weeks:

${JSON.stringify(summary, null, 1)}

Write a short, punchy briefing for the Marketing Director deciding which brands get the designer's time this week:
1. **This week's call** — the 3-5 brands/boards that should get priority and why (one line each).
2. **At risk** — overdue or about-to-slip work worth chasing (name the tasks).
3. **Watch-outs** — imbalances or patterns (e.g. a brand consuming the designer, a brand getting nothing, chronic lateness).

Use markdown with the three bold headers above and tight bullet points. Under 220 words. Be direct and specific — name brands and tasks. No preamble.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 800, messages: [{ role: "user", content: userMsg }] }),
  });
  const out = await res.json().catch(() => null);
  const text = out?.content?.map((c: any) => c.text ?? "").join("") ?? "";
  if (!res.ok || !text) return NextResponse.json({ ok: false, error: `AI: ${JSON.stringify(out?.error?.message ?? out).slice(0, 150)}` }, { status: 502 });
  return NextResponse.json({ ok: true, insights: text, generatedAt: new Date().toISOString() });
}
