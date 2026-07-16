"use client";

import { useEffect, useMemo, useState } from "react";

// Creative production hub: shoots and design jobs move through a pipeline
// (Requested → In progress → Review → Delivered). Each job carries a shot-list /
// deliverables checklist, a due date, turnaround on delivery, and an asset link.
type Check = { text: string; done: boolean };
type Job = {
  id: string; title: string; type: string; brand: string; owner_id: string | null;
  status: string; priority: string; requested_date: string; due_date: string | null;
  delivered_date: string | null; asset_url: string; notes: string; checklist: Check[];
};
type Brand = { id: number; name: string };
type Member = { id: string; name: string };

const STATUSES = [{ key: "requested", label: "Requested" }, { key: "in_progress", label: "In progress" }, { key: "review", label: "Review" }, { key: "delivered", label: "Delivered" }];
const TYPES = ["Shoot", "Design", "Video", "Other"];
const TYPE_COLOR: Record<string, string> = { Shoot: "#0891b2", Design: "#db2777", Video: "#7c3aed", Other: "#64748b" };
const inp = "w-full text-sm border border-gray-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400";
const todayStr = () => new Date().toISOString().slice(0, 10);
const dShort = (s?: string | null) => s ? new Date(s + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : "";
const daysBetween = (a: string, b: string) => Math.round((new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime()) / 864e5);

export function CreativePanel({ brands, admin }: { brands: Brand[]; admin: boolean }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [af, setAf] = useState({ title: "", type: "Design", brand: "", owner_id: "", due_date: "", priority: "normal" });
  const [newCheck, setNewCheck] = useState("");

  useEffect(() => {
    fetch("/api/creative").then(r => r.json()).then(d => {
      if (d.needsSetup) setNeedsSetup(true); else if (d.ok) setJobs(d.jobs ?? []);
    }).catch(() => {}).finally(() => setLoading(false));
    fetch("/api/team-hub").then(r => r.json()).then(d => { if (d.ok) setMembers((d.members ?? []).map((m: any) => ({ id: m.id, name: m.name }))); }).catch(() => {});
  }, []);

  const post = (body: any) => fetch("/api/creative", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json());
  const memberName = (id: string | null) => id ? (members.find(m => m.id === id)?.name ?? "") : "";
  const isOverdue = (j: Job) => j.due_date && j.status !== "delivered" && j.due_date < todayStr();

  const summary = useMemo(() => {
    const delivered = jobs.filter(j => j.status === "delivered" && j.delivered_date);
    const avg = delivered.length ? Math.round(delivered.reduce((s, j) => s + Math.max(0, daysBetween(j.requested_date, j.delivered_date!)), 0) / delivered.length) : null;
    const overdue = jobs.filter(isOverdue).length;
    const shoots = jobs.filter(j => j.type === "Shoot" && j.status !== "delivered" && j.due_date && j.due_date >= todayStr()).sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1)).slice(0, 4);
    return { avg, overdue, shoots, active: jobs.filter(j => j.status !== "delivered").length };
  }, [jobs, members]);

  async function addJob() {
    if (!af.title.trim()) return;
    const d = await post({ action: "job.save", ...af, checklist: [] });
    if (d.ok) { setJobs(p => [d.item, ...p]); setAf({ title: "", type: af.type, brand: "", owner_id: "", due_date: "", priority: "normal" }); setShowAdd(false); }
  }
  async function saveJob(job: Job, patch: Partial<Job>) {
    const next = { ...job, ...patch };
    setJobs(p => p.map(j => j.id === job.id ? next : j));
    const d = await post({ action: "job.save", id: job.id, title: next.title, type: next.type, brand: next.brand, owner_id: next.owner_id, status: next.status, priority: next.priority, due_date: next.due_date, asset_url: next.asset_url, notes: next.notes, checklist: next.checklist });
    if (d.ok && d.item) setJobs(p => p.map(j => j.id === job.id ? d.item : j));
  }
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  // Mint the public brief link and copy it — the sheet at /brief/[token] is what
  // the team (or an external photographer) opens; Print → PDF from there.
  async function shareBrief(id: string) {
    const d = await post({ action: "job.share", id });
    if (d.ok && d.token) {
      const url = `${window.location.origin}/brief/${d.token}`;
      try { await navigator.clipboard.writeText(url); setShareMsg("Link copied ✓"); } catch { setShareMsg(url); }
      window.open(url, "_blank");
      setTimeout(() => setShareMsg(null), 2500);
    } else setShareMsg(d.needsSetup ? "Run add_creative_share.sql first" : "Couldn’t create the link");
  }
  async function delJob(id: string) {
    if (typeof window !== "undefined" && !window.confirm("Delete this job?")) return;
    const d = await post({ action: "job.delete", id });
    if (d.ok) { setJobs(p => p.filter(j => j.id !== id)); if (selected === id) setSelected(null); }
  }

  if (needsSetup) return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-500">Run <code className="bg-gray-100 px-1 rounded">add_creative_jobs.sql</code> in Supabase to enable the creative hub.</div>;
  if (loading) return <div className="p-8 text-center text-sm text-gray-400">Loading…</div>;

  const sel = selected ? jobs.find(j => j.id === selected) : null;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Creative production</h1>
          <p className="text-sm text-gray-400">Shoots and design jobs, from request to delivered assets.</p>
        </div>
        {admin && <button onClick={() => setShowAdd(v => !v)} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-4 py-2 shrink-0">{showAdd ? "Cancel" : "+ New job"}</button>}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4"><p className="text-[11px] uppercase tracking-wider text-gray-400">Active jobs</p><p className="text-2xl font-bold text-slate-800">{summary.active}</p></div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4"><p className="text-[11px] uppercase tracking-wider text-gray-400">Overdue</p><p className={`text-2xl font-bold ${summary.overdue ? "text-rose-500" : "text-slate-800"}`}>{summary.overdue}</p></div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4"><p className="text-[11px] uppercase tracking-wider text-gray-400">Avg turnaround</p><p className="text-2xl font-bold text-slate-800">{summary.avg != null ? `${summary.avg}d` : "—"}</p></div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4"><p className="text-[11px] uppercase tracking-wider text-gray-400">Next shoots</p>{summary.shoots.length ? <p className="text-[13px] text-slate-700 leading-tight mt-0.5">{summary.shoots.map(s => `${s.title} · ${dShort(s.due_date)}`).join(" · ")}</p> : <p className="text-lg font-bold text-slate-300">None booked</p>}</div>
      </div>

      {/* Add form */}
      {showAdd && admin && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <input value={af.title} onChange={e => setAf({ ...af, title: e.target.value })} placeholder="Job title" className={`${inp} sm:col-span-2`} />
          <select value={af.type} onChange={e => setAf({ ...af, type: e.target.value })} className={inp}>{TYPES.map(t => <option key={t}>{t}</option>)}</select>
          <select value={af.brand} onChange={e => setAf({ ...af, brand: e.target.value })} className={inp}><option value="">Brand…</option>{brands.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}<option value="Multiple">Multiple</option></select>
          <select value={af.owner_id} onChange={e => setAf({ ...af, owner_id: e.target.value })} className={inp}><option value="">Owner…</option>{members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
          <label className="flex flex-col"><span className="text-[9px] uppercase tracking-wider text-gray-400">Due</span><input type="date" value={af.due_date} onChange={e => setAf({ ...af, due_date: e.target.value })} className={inp} /></label>
          <button onClick={addJob} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-4 py-2 sm:col-span-2 lg:col-span-1">Add job</button>
        </div>
      )}

      {/* Board */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {STATUSES.map(col => {
          const colJobs = jobs.filter(j => j.status === col.key);
          return (
            <div key={col.key} className="bg-gray-50/70 rounded-2xl border border-gray-100 p-2.5">
              <div className="flex items-center justify-between px-1.5 pb-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{col.label}</p>
                <span className="text-[11px] text-gray-400">{colJobs.length}</span>
              </div>
              <div className="space-y-2">
                {colJobs.map(j => (
                  <button key={j.id} onClick={() => setSelected(selected === j.id ? null : j.id)} className={`w-full text-left bg-white rounded-xl border p-3 hover:shadow-sm transition-shadow ${selected === j.id ? "border-emerald-300 ring-1 ring-emerald-200" : "border-gray-100"}`}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${TYPE_COLOR[j.type]}1a`, color: TYPE_COLOR[j.type] }}>{j.type}</span>
                      {j.priority === "high" && <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">High</span>}
                      {j.checklist.length > 0 && <span className="text-[10px] text-gray-400 ml-auto">{j.checklist.filter(c => c.done).length}/{j.checklist.length}</span>}
                    </div>
                    <p className="text-[13px] font-semibold text-slate-800 leading-snug">{j.title}</p>
                    <div className="flex items-center gap-2 mt-1.5 text-[11px] text-gray-400">
                      {j.brand && <span className="text-slate-500">{j.brand}</span>}
                      {j.owner_id && <span>· {memberName(j.owner_id)}</span>}
                      {j.status === "delivered" && j.delivered_date ? <span className="ml-auto text-emerald-600">{Math.max(0, daysBetween(j.requested_date, j.delivered_date))}d</span>
                        : j.due_date && <span className={`ml-auto ${isOverdue(j) ? "text-rose-500 font-semibold" : ""}`}>{isOverdue(j) ? "Overdue " : "Due "}{dShort(j.due_date)}</span>}
                    </div>
                  </button>
                ))}
                {colJobs.length === 0 && <p className="text-[12px] text-gray-300 text-center py-3">—</p>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Detail */}
      {sel && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            {admin ? <input value={sel.title} onChange={e => saveJob(sel, { title: e.target.value })} className="text-lg font-bold text-slate-800 border-0 border-b border-dashed border-gray-200 focus:border-emerald-400 focus:outline-none flex-1" />
              : <p className="text-lg font-bold text-slate-800">{sel.title}</p>}
            <button onClick={() => setSelected(null)} className="text-xs text-gray-400 hover:text-gray-600 shrink-0">Close</button>
          </div>

          {/* Pipeline mover */}
          <div className="flex flex-wrap gap-1.5">
            {STATUSES.map(s => (
              <button key={s.key} onClick={() => admin && saveJob(sel, { status: s.key })} disabled={!admin}
                className={`text-xs font-semibold rounded-full px-3 py-1.5 ${sel.status === s.key ? "bg-slate-800 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>{s.label}</button>
            ))}
            {sel.status === "delivered" && sel.delivered_date && <span className="text-xs text-emerald-600 self-center ml-1">Turnaround {Math.max(0, daysBetween(sel.requested_date, sel.delivered_date))} days</span>}
          </div>

          {admin && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <label className="flex flex-col"><span className="text-[9px] uppercase tracking-wider text-gray-400">Type</span><select value={sel.type} onChange={e => saveJob(sel, { type: e.target.value })} className={inp}>{TYPES.map(t => <option key={t}>{t}</option>)}</select></label>
              <label className="flex flex-col"><span className="text-[9px] uppercase tracking-wider text-gray-400">Brand</span><select value={sel.brand} onChange={e => saveJob(sel, { brand: e.target.value })} className={inp}><option value="">—</option>{brands.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}<option value="Multiple">Multiple</option></select></label>
              <label className="flex flex-col"><span className="text-[9px] uppercase tracking-wider text-gray-400">Owner</span><select value={sel.owner_id ?? ""} onChange={e => saveJob(sel, { owner_id: e.target.value || null })} className={inp}><option value="">—</option>{members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
              <label className="flex flex-col"><span className="text-[9px] uppercase tracking-wider text-gray-400">Priority</span><select value={sel.priority} onChange={e => saveJob(sel, { priority: e.target.value })} className={inp}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></select></label>
              <label className="flex flex-col"><span className="text-[9px] uppercase tracking-wider text-gray-400">Due{sel.type === "Shoot" ? " / shoot date" : ""}</span><input type="date" value={sel.due_date ?? ""} onChange={e => saveJob(sel, { due_date: e.target.value || null })} className={inp} /></label>
              <label className="flex flex-col sm:col-span-3"><span className="text-[9px] uppercase tracking-wider text-gray-400">Asset link (Drive / Dropbox)</span><input value={sel.asset_url} onChange={e => saveJob(sel, { asset_url: e.target.value })} placeholder="https://…" className={inp} /></label>
            </div>
          )}
          {!admin && sel.asset_url && <a href={sel.asset_url} target="_blank" rel="noreferrer" className="text-sm font-medium text-emerald-600 hover:underline">Delivered assets ↗</a>}
          {admin && sel.asset_url && <a href={sel.asset_url} target="_blank" rel="noreferrer" className="text-sm font-medium text-emerald-600 hover:underline">Open assets ↗</a>}

          {/* Checklist / shot list */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">{sel.type === "Shoot" ? "Shot list" : "Deliverables"}</p>
            <div className="space-y-1">
              {sel.checklist.map((c, i) => (
                <div key={i} className="flex items-center gap-2 group">
                  <button onClick={() => admin && saveJob(sel, { checklist: sel.checklist.map((x, j) => j === i ? { ...x, done: !x.done } : x) })} className={`w-4 h-4 rounded border shrink-0 grid place-items-center ${c.done ? "bg-emerald-500 border-emerald-500" : "bg-white border-gray-300"}`}>
                    {c.done && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                  </button>
                  <span className={`text-[14px] flex-1 ${c.done ? "text-gray-400 line-through" : "text-slate-700"}`}>{c.text}</span>
                  {admin && <button onClick={() => saveJob(sel, { checklist: sel.checklist.filter((_, j) => j !== i) })} className="text-gray-300 hover:text-rose-500 text-sm px-1 opacity-0 group-hover:opacity-100">✕</button>}
                </div>
              ))}
              {sel.checklist.length === 0 && <p className="text-[13px] text-gray-300">Nothing listed yet.</p>}
            </div>
            {admin && (
              <div className="flex items-center gap-2 mt-2">
                <input value={newCheck} onChange={e => setNewCheck(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && newCheck.trim()) { saveJob(sel, { checklist: [...sel.checklist, { text: newCheck.trim(), done: false }] }); setNewCheck(""); } }} placeholder={sel.type === "Shoot" ? "Add a shot…" : "Add a deliverable…"} className={`${inp} flex-1`} />
                <button onClick={() => { if (newCheck.trim()) { saveJob(sel, { checklist: [...sel.checklist, { text: newCheck.trim(), done: false }] }); setNewCheck(""); } }} className="text-sm font-medium text-emerald-600 hover:text-emerald-700 shrink-0">+ Add</button>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Notes</p>
            {admin ? <textarea key={sel.id} defaultValue={sel.notes} onBlur={e => saveJob(sel, { notes: e.target.value })} rows={2} placeholder="Brief, location, references…" className={`${inp} resize-y`} />
              : (sel.notes ? <p className="text-[14px] text-slate-600 whitespace-pre-wrap">{sel.notes}</p> : <p className="text-[13px] text-gray-300">None.</p>)}
          </div>

          <div className="flex items-center gap-3 pt-1">
            {admin && <button onClick={() => shareBrief(sel.id)} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-4 py-2">Share brief link</button>}
            {shareMsg && <span className="text-xs text-emerald-600 break-all">{shareMsg}</span>}
            {admin && <button onClick={() => delJob(sel.id)} className="ml-auto text-xs font-medium text-gray-400 hover:text-rose-500">Delete job</button>}
          </div>
        </div>
      )}
    </div>
  );
}
