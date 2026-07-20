"use client";

import { useState } from "react";
import type { AsanaTask } from "@/lib/db";

// Status / priority colours mirror the Asana projects' field colours (Blogs + Design Requirements).
const STATUS_COLOR: Record<string, string> = {
  // shared / approval flow
  "Waiting Approval": "#dc2626", "Approved": "#16a34a", "On Hold": "#ea580c", "Cancelled": "#9ca3af",
  // blogs
  "Ready to post": "#d97706",
  // design requirements
  "Ready to Action": "#d97706", "Planning": "#6366f1", "In Progress": "#3b82f6",
  "Ready to Schedule": "#0891b2", "Making Changes": "#ea580c", "Sent to Print": "#7c3aed",
  "Completed": "#10b981", "Need Graphics": "#d97706", "Artwork Done": "#0d9488",
  "Uploaded to Socials": "#16a34a", "Need EDM Planning": "#d97706", "Needs Eventbrite": "#d97706",
  "Needs Content": "#d97706", "Scheduled": "#0891b2", "LIVE": "#16a34a",
};
const PRIORITY_COLOR: Record<string, string> = { "High": "#16a34a", "Medium": "#ca8a04", "Low": "#dc2626" };

// Maps a dashboard login to its Asana assignee name, so "assigned to me" works.
// Add team members here as they start being assigned blog tasks.
const ASANA_NAME_BY_EMAIL: Record<string, string> = {
  "mel@coolkidz.com.au": "Melanie Kingsford",
  "william@coolkidz.com.au": "William Han",
};
const isWaiting = (s: string | null) => (s || "").toLowerCase().includes("waiting");

// Read-only Asana tasks for one project, grouped by section (Asana stays the
// source of truth — the dashboard only reads).
type Suggestion = { taskName: string; brand: string; title: string; primaryKeyword: string; category: string; stage: string; angle: string };

export function TasksPanel({ tasks, brands, currentEmail, admin = false }: { tasks: AsanaTask[]; brands: { id: number; name: string; color?: string }[]; currentEmail?: string; admin?: boolean }) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [blogsGid, setBlogsGid] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState("");
  const [added, setAdded] = useState<Set<string>>(new Set());
  async function suggest() {
    setAiBusy(true); setAiErr("");
    const d = await fetch("/api/blogs/suggest", { method: "POST" }).then(r => r.json()).catch(() => null);
    setAiBusy(false);
    if (d?.ok) { setSuggestions(d.suggestions ?? []); setBlogsGid(d.blogsGid ?? null); }
    else setAiErr(d?.error || "Couldn't generate suggestions.");
  }
  async function addToBoard(sg: Suggestion) {
    if (!blogsGid) { setAiErr("Blogs board id not configured (ASANA_PROJECT_ID)."); return; }
    const d = await fetch("/api/design", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "task.create", name: sg.taskName, project_gid: blogsGid, project_label: "Blogs",
        notes: `Category: ${sg.category}\nCustomer stage: ${sg.stage}\nPrimary keyword: ${sg.primaryKeyword}\nAngle: ${sg.angle}\n\nSuggested by the dashboard AI — brief in the house SEO style before writing.` }) }).then(r => r.json()).catch(() => null);
    if (d?.ok) setAdded(prev => new Set(prev).add(sg.taskName));
    else setAiErr(d?.error || "Couldn't add to Asana.");
  }
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

  const waiting = open.filter(t => isWaiting(t.status)).length;
  const kpis = [
    { label: "Open tasks", value: String(open.length), accent: "#0e7490" },
    { label: "Waiting approval", value: String(waiting), accent: "#dc2626" },
    { label: "Due this week", value: String(dueSoon), accent: "#0ea5e9" },
    { label: "Completed", value: String(done.length), accent: "#14b8a6" },
  ];

  // Tasks assigned to the logged-in user that are awaiting their approval — pinned to the top.
  const myName = ASANA_NAME_BY_EMAIL[(currentEmail || "").toLowerCase()];
  const myWaiting = myName ? open.filter(t => isWaiting(t.status) && t.assignee === myName) : [];
  const pinned = new Set(myWaiting.map(t => t.gid));

  // Group the remaining open tasks by section (preserving first-seen order).
  const order: string[] = [];
  const bySection = new Map<string, AsanaTask[]>();
  for (const t of open) {
    if (pinned.has(t.gid)) continue;
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

      {admin && (
        <div className="rounded-2xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50/60 to-white shadow-sm p-5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-600">✨ Suggested blogs</p>
              <p className="text-[12.5px] text-gray-400 mt-0.5">AI topic ideas in the house SEO style — seasonal, campaign-aware, no duplicates of the board.</p>
            </div>
            <button onClick={suggest} disabled={aiBusy} className="text-sm font-semibold text-indigo-700 bg-indigo-100 hover:bg-indigo-200 rounded-lg px-4 py-2 disabled:opacity-60">{aiBusy ? "Thinking…" : suggestions.length ? "↻ Regenerate" : "Suggest blog topics"}</button>
          </div>
          {aiErr && <p className="text-sm text-rose-500 mt-2">{aiErr}</p>}
          {suggestions.length > 0 && (
            <div className="mt-3 space-y-2">
              {suggestions.map(sg => (
                <div key={sg.taskName} className="bg-white rounded-xl border border-indigo-100 px-4 py-3 flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-semibold text-slate-800">{sg.taskName}</p>
                    <p className="text-[12px] text-gray-500 mt-0.5">{sg.angle}</p>
                    <p className="text-[11px] text-gray-400 mt-1">
                      <span className="bg-indigo-50 text-indigo-600 rounded-full px-2 py-0.5 font-semibold">{sg.brand}</span>
                      <span className="ml-1.5">{sg.category} · {sg.stage} · kw: {sg.primaryKeyword}</span>
                    </p>
                  </div>
                  {added.has(sg.taskName)
                    ? <span className="text-[12px] font-semibold text-emerald-600 shrink-0 mt-1">✓ On the board</span>
                    : <button onClick={() => addToBoard(sg)} className="text-[12.5px] font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-3 py-1.5 shrink-0">+ Add to Asana</button>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {myWaiting.length > 0 && (
        <div className="bg-amber-50 rounded-2xl border border-amber-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-2 pb-2 border-b border-amber-200/70">
            <span className="text-base">📌</span>
            <h3 className="text-sm font-bold text-amber-800">Waiting your approval</h3>
            <span className="text-xs font-semibold text-white rounded-full px-2 py-0.5" style={{ background: "#d97706" }}>{myWaiting.length}</span>
          </div>
          <div className="divide-y divide-amber-200/50">{myWaiting.map(Row)}</div>
        </div>
      )}

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
