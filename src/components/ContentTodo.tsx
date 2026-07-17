"use client";

import { useEffect, useMemo, useState } from "react";

// Content to-do list on the Creative Production tab — the "Content To Do"
// Asana board synced into the dashboard, grouped by Asana section. Ticks, due
// dates and quick-adds write back to Asana via /api/design; priority flags and
// notes share design_task_meta.
type Task = {
  gid: string; name: string; notes: string; assignee: string | null; due_on: string | null;
  section: string | null; project_gid: string; permalink_url: string | null; requested_by?: string | null;
};
type Meta = { priority?: "high" | "medium" | "low" | null; notes?: string | null };

const BOARD_GID = "1207220459783085";
const BOARD_LABEL = "Content To Do";
const inp = "text-sm border border-gray-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400";
const dShort = (s?: string | null) => s ? new Date(s + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : "";
const todayStr = () => new Date().toISOString().slice(0, 10);
const PRIO: Record<string, { label: string; letter: string; cls: string; idle: string; weight: number }> = {
  high: { label: "High", letter: "H", cls: "bg-rose-500 text-white", idle: "border-rose-200 text-rose-400 hover:bg-rose-50", weight: 0 },
  medium: { label: "Med", letter: "M", cls: "bg-amber-400 text-white", idle: "border-amber-200 text-amber-500 hover:bg-amber-50", weight: 1 },
  low: { label: "Low", letter: "L", cls: "bg-sky-400 text-white", idle: "border-sky-200 text-sky-400 hover:bg-sky-50", weight: 2 },
};
const prioWeight = (p?: string | null) => (p && PRIO[p] ? PRIO[p].weight : 3);

export function ContentTodo({ admin }: { admin: boolean }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [meta, setMeta] = useState<Record<string, Meta>>({});
  const [asanaWrite, setAsanaWrite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [af, setAf] = useState({ name: "", due_on: "" });
  const [busy, setBusy] = useState(false);
  const [notesFor, setNotesFor] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

  useEffect(() => {
    fetch("/api/content-todo").then(r => r.json()).then(d => {
      if (d.ok) {
        setTasks(d.tasks ?? []);
        setMeta(Object.fromEntries((d.meta ?? []).map((m: any) => [m.task_gid, { priority: m.priority, notes: m.notes }])));
        setAsanaWrite(!!d.asanaWrite);
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const post = (body: any) => fetch("/api/design", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json());

  const sections = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of tasks) {
      const k = t.section || "General";
      m.set(k, [...(m.get(k) ?? []), t]);
    }
    for (const [k, list] of m) m.set(k, [...list].sort((a, b) =>
      prioWeight(meta[a.gid]?.priority) - prioWeight(meta[b.gid]?.priority) || (a.due_on ?? "9999").localeCompare(b.due_on ?? "9999")));
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  }, [tasks, meta]);
  const overdue = tasks.filter(t => t.due_on && t.due_on < todayStr()).length;

  async function complete(gid: string) {
    const prev = tasks;
    setTasks(p => p.filter(t => t.gid !== gid));
    const d = await post({ action: "task.complete", gid });
    if (!d.ok) { setTasks(prev); setErr(d.error || "Couldn't complete in Asana."); }
  }
  async function setDue(gid: string, due_on: string) {
    setTasks(p => p.map(t => t.gid === gid ? { ...t, due_on: due_on || null } : t));
    const d = await post({ action: "task.due", gid, due_on: due_on || null });
    if (!d.ok) setErr(d.error || "Couldn't update the due date.");
  }
  async function setPriority(gid: string, next: Meta["priority"]) {
    const prev = meta[gid]?.priority ?? null;
    setMeta(m => ({ ...m, [gid]: { ...m[gid], priority: next } }));
    const d = await post({ action: "meta.set", gid, priority: next });
    if (!d.ok) { setMeta(m => ({ ...m, [gid]: { ...m[gid], priority: prev } })); setErr(d.error || "Couldn't save priority."); }
  }
  async function saveNotes(gid: string) {
    const d = await post({ action: "meta.set", gid, notes: noteDraft });
    if (d.ok) { setMeta(m => ({ ...m, [gid]: { ...m[gid], notes: noteDraft.trim() || null } })); setNotesFor(null); }
    else setErr(d.error || "Couldn't save notes.");
  }
  async function createTask() {
    if (!af.name.trim()) { setErr("Task name required."); return; }
    setBusy(true); setErr("");
    const d = await post({ action: "task.create", name: af.name, due_on: af.due_on, project_gid: BOARD_GID, project_label: BOARD_LABEL });
    setBusy(false);
    if (d.ok) { setTasks(p => [d.item, ...p]); setAf({ name: "", due_on: "" }); setShowAdd(false); }
    else setErr(d.error || "Couldn't create the task.");
  }

  if (loading) return null;

  return (
    <div className="pt-2">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2 px-1">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[13px] font-bold uppercase tracking-[0.14em] text-slate-500">📝 Content to-do</h2>
          <span className="text-[12px] text-gray-400">{tasks.length} open{overdue ? <> · <span className="text-rose-500 font-semibold">{overdue} overdue</span></> : null} · from Asana</span>
        </div>
        {asanaWrite && admin && <button onClick={() => setShowAdd(v => !v)} className="text-[12.5px] font-semibold text-emerald-600 hover:text-emerald-700">{showAdd ? "Cancel" : "+ Add to the list"}</button>}
      </div>
      {err && <p className="text-sm text-rose-500 mb-2">{err}</p>}
      {showAdd && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 mb-3 flex flex-wrap gap-2">
          <input value={af.name} onChange={e => setAf({ ...af, name: e.target.value })} placeholder="What content is needed?" className={`${inp} flex-1 min-w-[220px]`} />
          <input type="date" value={af.due_on} onChange={e => setAf({ ...af, due_on: e.target.value })} className={inp} />
          <button onClick={createTask} disabled={busy} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-4 py-2 disabled:opacity-60">{busy ? "Creating…" : "Add to Asana"}</button>
        </div>
      )}
      {tasks.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center text-sm text-gray-400">Nothing on the content list — it fills from the Content To Do board in Asana after the next sync.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {sections.map(([section, list]) => (
            <div key={section} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden" style={{ borderTop: "3px solid #0891b2" }}>
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-50 bg-cyan-50/40">
                <p className="text-[13px] font-bold text-slate-800 truncate">{section}</p>
                <span className="ml-auto text-[11px] font-semibold text-gray-400 bg-white/70 rounded-full px-2 py-0.5 shrink-0">{list.length}</span>
              </div>
              <div className="px-4 py-1 divide-y divide-gray-50">
                {list.map(t => {
                  const late = t.due_on && t.due_on < todayStr();
                  const m = meta[t.gid];
                  const p = m?.priority && PRIO[m.priority];
                  return (
                    <div key={t.gid}>
                      <div className="flex items-start gap-2.5 py-[7px] group">
                        <button onClick={() => complete(t.gid)} title="Mark done (updates Asana)"
                          className="w-[17px] h-[17px] rounded-full border-2 border-gray-300 hover:border-emerald-500 hover:bg-emerald-100 shrink-0 transition-colors mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[13.5px] text-slate-700 leading-snug">
                            {t.permalink_url ? <a href={t.permalink_url} target="_blank" rel="noreferrer" className="hover:text-emerald-700 hover:underline">{t.name}</a> : t.name}
                          </p>
                          {(t.assignee || t.requested_by) && (
                            <p className="text-[11px] text-gray-400">
                              {t.assignee}
                              {t.requested_by && <span className="ml-1 bg-gray-50 rounded-full px-1.5 py-0.5" title={`Requested by ${t.requested_by}`}>req. {t.requested_by.split(" ")[0]}</span>}
                            </p>
                          )}
                        </div>
                        {(p || admin) && (
                          <span className={`flex items-center gap-1 shrink-0 mt-0.5 ${p ? "" : "opacity-0 group-hover:opacity-100"}`}>
                            {(["high", "medium", "low"] as const).map(k => {
                              const active = m?.priority === k;
                              if (!admin && !active) return null;
                              return (
                                <button key={k} onClick={admin ? () => setPriority(t.gid, active ? null : k) : undefined}
                                  className={`text-[10px] font-bold rounded-full transition-all ${active ? `${PRIO[k].cls} px-2 py-[3px] uppercase tracking-wide` : `w-[19px] h-[19px] border ${PRIO[k].idle}`} ${admin ? "" : "cursor-default"}`}>
                                  {active ? PRIO[k].label : PRIO[k].letter}
                                </button>
                              );
                            })}
                          </span>
                        )}
                        <button onClick={() => { setNotesFor(cur => cur === t.gid ? null : t.gid); setNoteDraft(m?.notes ?? ""); }}
                          title={m?.notes ? m.notes : "Add a note"}
                          className={`text-[13px] leading-none shrink-0 mt-0.5 ${m?.notes ? "opacity-100" : "opacity-0 group-hover:opacity-100 grayscale"}`}>💬</button>
                        {admin
                          ? <input type="date" value={t.due_on ?? ""} onChange={e => setDue(t.gid, e.target.value)}
                              className={`text-[11.5px] border rounded-md px-1 py-0.5 shrink-0 w-[108px] ${late ? "border-rose-200 bg-rose-50 text-rose-600" : "border-transparent hover:border-gray-200 text-slate-400 bg-transparent"}`} />
                          : t.due_on && <span className={`text-[11.5px] rounded-md px-1.5 py-0.5 shrink-0 ${late ? "bg-rose-50 text-rose-600 font-semibold" : "text-gray-400"}`}>{dShort(t.due_on)}</span>}
                      </div>
                      {notesFor === t.gid && (
                        <div className="ml-7 mb-2 bg-amber-50/60 border border-amber-100 rounded-xl p-2.5 space-y-2">
                          <textarea value={noteDraft} onChange={e => setNoteDraft(e.target.value)} rows={2} autoFocus
                            placeholder="Notes for the team… (dashboard only, not sent to Asana)"
                            className="w-full text-[12.5px] border border-amber-200 rounded-lg px-2.5 py-1.5 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-amber-300 resize-y" />
                          <div className="flex gap-2">
                            <button onClick={() => saveNotes(t.gid)} className="text-[11.5px] font-semibold text-white bg-amber-500 hover:bg-amber-600 rounded-md px-3 py-1">Save note</button>
                            <button onClick={() => setNotesFor(null)} className="text-[11.5px] text-gray-400 hover:text-gray-600">Cancel</button>
                          </div>
                        </div>
                      )}
                      {m?.notes && notesFor !== t.gid && (
                        <p className="ml-7 -mt-1 mb-1.5 text-[11.5px] text-amber-700/90 bg-amber-50/70 rounded-lg px-2 py-1 line-clamp-2 cursor-pointer" onClick={() => { setNotesFor(t.gid); setNoteDraft(m?.notes ?? ""); }}>💬 {m.notes}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
