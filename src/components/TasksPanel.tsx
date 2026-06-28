"use client";

import type { AsanaTask } from "@/lib/db";

// Status / priority colours mirror the Asana project's field colours.
const STATUS_COLOR: Record<string, string> = {
  "Approved": "#16a34a", "Ready to post": "#d97706", "Waiting Approval": "#dc2626", "On Hold": "#ea580c",
};
const PRIORITY_COLOR: Record<string, string> = { "High": "#16a34a", "Medium": "#ca8a04", "Low": "#dc2626" };

// Read-only Asana tasks for one project, grouped by section (Asana stays the
// source of truth — the dashboard only reads).
export function TasksPanel({ tasks, brands }: { tasks: AsanaTask[]; brands: { id: number; name: string; color?: string }[] }) {
  if (!tasks.length) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
        <p className="text-sm text-gray-500 font-medium">No Asana tasks yet</p>
        <p className="text-xs text-gray-400 mt-1 max-w-md mx-auto">Run <code className="bg-gray-50 px-1 rounded">supabase/add_asana_tasks.sql</code>, add the <code className="bg-gray-50 px-1 rounded">ASANA_TOKEN</code> and <code className="bg-gray-50 px-1 rounded">ASANA_PROJECT_ID</code> secrets, then sync.</p>
      </div>
    );
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const open = tasks.filter(t => !t.completed);
  const done = tasks.filter(t => t.completed);
  const dueSoon = open.filter(t => {
    if (!t.due_on) return false;
    const d = new Date(t.due_on + "T00:00:00"); const wk = new Date(today); wk.setDate(wk.getDate() + 7);
    return d >= today && d <= wk;
  }).length;

  const waiting = open.filter(t => (t.status || "").toLowerCase().includes("waiting")).length;
  const kpis = [
    { label: "Open tasks", value: String(open.length), accent: "#1e3a5f" },
    { label: "Waiting approval", value: String(waiting), accent: "#dc2626" },
    { label: "Due this week", value: String(dueSoon), accent: "#f97316" },
    { label: "Completed", value: String(done.length), accent: "#10b981" },
  ];

  // Group open tasks by section (preserving first-seen order).
  const order: string[] = [];
  const bySection = new Map<string, AsanaTask[]>();
  for (const t of open) {
    const k = t.section || "No section";
    if (!bySection.has(k)) { bySection.set(k, []); order.push(k); }
    bySection.get(k)!.push(t);
  }

  const fmtDue = (s: string | null) => s ? new Date(s + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : null;
  const brandOf = (id: number | null) => id == null ? null : brands.find(b => b.id === id);

  const Row = (t: AsanaTask) => {
    const due = t.due_on ? new Date(t.due_on + "T00:00:00") : null;
    const isOverdue = due && due < today;
    const b = brandOf(t.brand_id);
    const inner = (
      <div className="flex items-center gap-2.5 py-2">
        {t.priority && <span className="shrink-0 w-2 h-2 rounded-full" title={`Priority: ${t.priority}`} style={{ background: PRIORITY_COLOR[t.priority] ?? "#cbd5e1" }} />}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-700 truncate">{t.name || "Task"}</p>
          <p className="text-[11px] text-gray-400 truncate">{[t.assignee, b?.name].filter(Boolean).join(" · ") || "Unassigned"}</p>
        </div>
        {t.status && (
          <span className="shrink-0 text-[10px] font-semibold rounded-full px-2 py-0.5 text-white" style={{ background: STATUS_COLOR[t.status] ?? "#64748b" }}>{t.status}</span>
        )}
        {t.due_on && (
          <span className={`shrink-0 text-[11px] font-medium rounded-full px-2 py-0.5 ${isOverdue ? "bg-red-50 text-red-600" : "bg-gray-50 text-gray-500"}`}>{fmtDue(t.due_on)}</span>
        )}
      </div>
    );
    return t.permalink_url
      ? <a key={t.gid} href={t.permalink_url} target="_blank" rel="noopener noreferrer" className="block px-2 -mx-2 rounded-lg hover:bg-gray-50/70 transition-colors">{inner}</a>
      : <div key={t.gid}>{inner}</div>;
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
            <p className="text-[11px] font-medium text-gray-400 flex items-center gap-1.5"><span className="w-2 h-2 rounded-full inline-block" style={{ background: k.accent }} />{k.label}</p>
            <p className="text-2xl font-bold text-slate-800 mt-1 leading-none">{k.value}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4 items-start">
        {order.map(sec => (
          <div key={sec} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-50">
              <h3 className="text-sm font-bold text-slate-700">{sec}</h3>
              <span className="text-xs font-medium text-gray-400">{bySection.get(sec)!.length}</span>
            </div>
            <div className="divide-y divide-gray-50">{bySection.get(sec)!.map(Row)}</div>
          </div>
        ))}
      </div>

      {done.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-1">Recently completed</h3>
          <div className="divide-y divide-gray-50">{done.slice(0, 12).map(Row)}</div>
        </div>
      )}
    </div>
  );
}
