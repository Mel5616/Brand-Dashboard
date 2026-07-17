"use client";

import { useEffect, useMemo, useState } from "react";

// Design board: every synced Asana design board in one place. The admin builds
// an ordered "This week's priorities" queue the designer works straight down;
// completing, due dates and quick-adds write back to Asana.
type Task = {
  gid: string; name: string; notes: string; assignee: string | null; due_on: string | null;
  completed: boolean; section: string; project_gid: string; project_label: string | null;
  permalink_url: string | null; modified_at: string;
};
type Priority = { task_gid: string; rank: number };

const inp = "text-sm border border-gray-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400";
const dShort = (s?: string | null) => s ? new Date(s + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : "";
const todayStr = () => new Date().toISOString().slice(0, 10);

export function DesignBoard({ admin }: { admin: boolean }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [prioritiesSetup, setPrioritiesSetup] = useState(true);
  const [asanaWrite, setAsanaWrite] = useState(true);
  const [err, setErr] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [af, setAf] = useState({ name: "", notes: "", due_on: "", project_gid: "" });
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [openBoards, setOpenBoards] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/design").then(r => r.json()).then(d => {
      if (d.needsSetup) setNeedsSetup(true);
      else if (d.ok) { setTasks(d.tasks ?? []); setPriorities(d.priorities ?? []); setPrioritiesSetup(d.prioritiesSetup !== false); setAsanaWrite(!!d.asanaWrite); }
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const post = (body: any) => fetch("/api/design", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json());
  const byGid = useMemo(() => new Map(tasks.map(t => [t.gid, t])), [tasks]);
  const open = useMemo(() => tasks.filter(t => !t.completed), [tasks]);
  const queued = useMemo(() => new Set(priorities.map(p => p.task_gid)), [priorities]);
  const queue = useMemo(() => priorities.map(p => byGid.get(p.task_gid)).filter((t): t is Task => !!t && !t.completed), [priorities, byGid]);
  const boards = useMemo(() => {
    const m = new Map<string, { label: string; gid: string; tasks: Task[] }>();
    for (const t of open) {
      const label = t.project_label || "Design";
      const cur = m.get(label) ?? { label, gid: t.project_gid, tasks: [] };
      cur.tasks.push(t); m.set(label, cur);
    }
    return [...m.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [open]);
  const overdue = open.filter(t => t.due_on && t.due_on < todayStr()).length;

  async function addToQueue(gid: string) {
    const d = await post({ action: "priority.add", task_gid: gid });
    if (d.ok) setPriorities(p => [...p, { task_gid: gid, rank: (p[p.length - 1]?.rank ?? 0) + 1 }]);
    else setErr(d.error || "Couldn't add.");
  }
  async function removeFromQueue(gid: string) {
    const d = await post({ action: "priority.remove", task_gid: gid });
    if (d.ok) setPriorities(p => p.filter(x => x.task_gid !== gid));
  }
  async function move(gid: string, dir: -1 | 1) {
    const order = priorities.map(p => p.task_gid);
    const i = order.indexOf(gid), j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    setPriorities(order.map((g, idx) => ({ task_gid: g, rank: idx + 1 })));
    await post({ action: "priority.reorder", order });
  }
  async function complete(gid: string) {
    setTasks(p => p.map(t => t.gid === gid ? { ...t, completed: true } : t));
    setPriorities(p => p.filter(x => x.task_gid !== gid));
    const d = await post({ action: "task.complete", gid });
    if (!d.ok) { setErr(d.error || "Couldn't complete in Asana."); setTasks(p => p.map(t => t.gid === gid ? { ...t, completed: false } : t)); }
  }
  async function setDue(gid: string, due_on: string) {
    setTasks(p => p.map(t => t.gid === gid ? { ...t, due_on: due_on || null } : t));
    const d = await post({ action: "task.due", gid, due_on: due_on || null });
    if (!d.ok) setErr(d.error || "Couldn't update the due date in Asana.");
  }
  async function createTask() {
    if (!af.name.trim() || !af.project_gid) { setErr("Task name and board required."); return; }
    setBusy(true); setErr("");
    const label = boards.find(bd => bd.gid === af.project_gid)?.label || "";
    const d = await post({ action: "task.create", ...af, project_label: label });
    setBusy(false);
    if (d.ok) { setTasks(p => [d.item, ...p]); setAf({ name: "", notes: "", due_on: "", project_gid: af.project_gid }); setShowAdd(false); }
    else setErr(d.error || "Couldn't create the task.");
  }

  if (needsSetup) return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-500">Run <code className="bg-gray-100 px-1 rounded">add_asana_tasks.sql</code> and configure the Asana sync first.</div>;
  if (loading) return <div className="p-8 text-center text-sm text-gray-400">Loading…</div>;

  const TaskRow = ({ t, inQueue }: { t: Task; inQueue: boolean }) => (
    <div className="flex items-center gap-2.5 py-2 group">
      <button onClick={() => complete(t.gid)} title="Mark done (updates Asana)"
        className="w-4.5 h-4.5 w-[18px] h-[18px] rounded-full border-2 border-gray-300 hover:border-emerald-500 hover:bg-emerald-50 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] text-slate-700 leading-snug">{t.permalink_url ? <a href={t.permalink_url} target="_blank" rel="noreferrer" className="hover:text-emerald-700 hover:underline">{t.name}</a> : t.name}</p>
        <p className="text-[11px] text-gray-400">{t.project_label}{t.section ? ` · ${t.section}` : ""}{t.assignee ? ` · ${t.assignee}` : ""}</p>
      </div>
      {admin
        ? <input type="date" value={t.due_on ?? ""} onChange={e => setDue(t.gid, e.target.value)} className={`text-[12px] border rounded-lg px-1.5 py-1 shrink-0 ${t.due_on && t.due_on < todayStr() ? "border-rose-300 text-rose-600" : "border-gray-200 text-slate-500"}`} />
        : t.due_on && <span className={`text-[12px] shrink-0 ${t.due_on < todayStr() ? "text-rose-500 font-semibold" : "text-gray-400"}`}>{dShort(t.due_on)}</span>}
      {admin && (inQueue
        ? <button onClick={() => removeFromQueue(t.gid)} className="text-[11px] text-gray-400 hover:text-rose-500 shrink-0">remove</button>
        : <button onClick={() => addToQueue(t.gid)} className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 opacity-0 group-hover:opacity-100 shrink-0">+ priority</button>)}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Design</h1>
          <p className="text-sm text-gray-400">All Asana design boards in one place. Set the weekly priorities here — ticks, due dates and new tasks write back to Asana.</p>
        </div>
        {asanaWrite && <button onClick={() => setShowAdd(v => !v)} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-4 py-2 shrink-0">{showAdd ? "Cancel" : "+ New design task"}</button>}
      </div>
      {err && <p className="text-sm text-rose-500">{err}</p>}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4"><p className="text-[11px] uppercase tracking-wider text-gray-400">Open tasks</p><p className="text-2xl font-bold text-slate-800">{open.length}</p></div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4"><p className="text-[11px] uppercase tracking-wider text-gray-400">This week&apos;s priorities</p><p className="text-2xl font-bold text-emerald-600">{queue.length}</p></div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4"><p className="text-[11px] uppercase tracking-wider text-gray-400">Overdue</p><p className={`text-2xl font-bold ${overdue ? "text-rose-500" : "text-slate-800"}`}>{overdue}</p></div>
      </div>

      {/* Quick add */}
      {showAdd && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          <input value={af.name} onChange={e => setAf({ ...af, name: e.target.value })} placeholder="Task name" className={`${inp} lg:col-span-2`} />
          <select value={af.project_gid} onChange={e => setAf({ ...af, project_gid: e.target.value })} className={inp}>
            <option value="">Board…</option>
            {boards.map(bd => <option key={bd.gid} value={bd.gid}>{bd.label}</option>)}
          </select>
          <input type="date" value={af.due_on} onChange={e => setAf({ ...af, due_on: e.target.value })} className={inp} />
          <button onClick={createTask} disabled={busy} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-4 py-2 disabled:opacity-60">{busy ? "Creating…" : "Add to Asana"}</button>
          <textarea value={af.notes} onChange={e => setAf({ ...af, notes: e.target.value })} rows={2} placeholder="Brief / notes (optional)" className={`${inp} resize-y sm:col-span-2 lg:col-span-5`} />
        </div>
      )}

      {/* This week's priorities — the designer's ordered queue */}
      <div className="bg-white rounded-2xl border-2 border-emerald-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">This week&apos;s priorities · work top to bottom</p>
          {!prioritiesSetup && <span className="text-[11px] text-rose-500">Run add_design_priorities.sql to enable the queue</span>}
        </div>
        {queue.length === 0 ? <p className="text-sm text-gray-300 py-3">Nothing queued yet{admin ? " — hover a task below and click “+ priority”." : "."}</p> : (
          <div className="divide-y divide-gray-50">
            {queue.map((t, i) => (
              <div key={t.gid} className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-emerald-500 text-white text-[12px] font-bold grid place-items-center shrink-0">{i + 1}</span>
                {admin && (
                  <span className="flex flex-col shrink-0">
                    <button onClick={() => move(t.gid, -1)} disabled={i === 0} className="text-gray-300 hover:text-slate-600 disabled:opacity-20 leading-none text-[11px]">▲</button>
                    <button onClick={() => move(t.gid, 1)} disabled={i === queue.length - 1} className="text-gray-300 hover:text-slate-600 disabled:opacity-20 leading-none text-[11px]">▼</button>
                  </span>
                )}
                <div className="flex-1 min-w-0"><TaskRow t={t} inQueue /></div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* All boards — searchable; big boards collapse behind a count */}
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search tasks across all boards…" className={`${inp} w-full`} />
      {boards.map(bd => {
        const matches = bd.tasks.filter(t => !queued.has(t.gid) && (!q || t.name.toLowerCase().includes(q.toLowerCase()) || (t.section || "").toLowerCase().includes(q.toLowerCase())));
        const expanded = !!q || openBoards.has(bd.label) || matches.length <= 30;
        return (
          <div key={bd.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <button onClick={() => setOpenBoards(p => { const n = new Set(p); n.has(bd.label) ? n.delete(bd.label) : n.add(bd.label); return n; })} className="w-full flex items-center justify-between text-left">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">{bd.label} <span className="font-normal text-gray-400 normal-case tracking-normal">· {matches.length}{q ? " matching" : " open"}</span></p>
              {!expanded && <span className="text-[12px] text-emerald-600 font-medium">Show ▾</span>}
            </button>
            {expanded && (
              <div className="divide-y divide-gray-50 mt-1">
                {matches.slice(0, 200).map(t => <TaskRow key={t.gid} t={t} inQueue={false} />)}
                {matches.length > 200 && <p className="text-[12px] text-gray-400 py-2">Showing 200 of {matches.length} — search to narrow.</p>}
                {matches.length === 0 && <p className="text-[13px] text-gray-300 py-2">{q ? "No matches." : "All queued."}</p>}
              </div>
            )}
          </div>
        );
      })}
      {boards.length === 0 && <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">No design boards synced yet — add the board IDs to the Asana sync config.</div>}
    </div>
  );
}
