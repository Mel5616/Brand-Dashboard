"use client";

import { useEffect, useMemo, useState } from "react";

// Design board: per-brand Asana boards grouped into EDM and Social sections,
// brand cards in a grid with brand colours. The admin builds an ordered "This
// week's priorities" queue the designer works straight down; completing, due
// dates and quick-adds write back to Asana.
type Task = {
  gid: string; name: string; notes: string; assignee: string | null; due_on: string | null;
  completed: boolean; section: string; project_gid: string; project_label: string | null;
  permalink_url: string | null; modified_at: string;
};
type Priority = { task_gid: string; rank: number };
type BrandRef = { name: string; color: string };

const inp = "text-sm border border-gray-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400";
const dShort = (s?: string | null) => s ? new Date(s + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : "";
const todayStr = () => new Date().toISOString().slice(0, 10);
// Strip the brand-code prefix ("CK - ", "MIA – ") — the card already names the brand.
const cleanName = (name: string) => (name || "").replace(/^[A-Za-z]{2,5}\s*[-–—:]\s*/, "");

export function DesignBoard({ admin, brands = [] }: { admin: boolean; brands?: BrandRef[] }) {
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
  const [channelFilter, setChannelFilter] = useState<"all" | "EDM" | "Social">("all");

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
  const brandColor = (name: string) => brands.find(b => b.name.toLowerCase() === name.toLowerCase())?.color ?? "#94a3b8";
  const brandOfLabel = (label?: string | null) => (label || "").replace(/^(EDM|Social)\s*·\s*/i, "");

  // "EDM · Coolkidz" → channel EDM, brand Coolkidz. Anything unmatched → Other.
  const channels = useMemo(() => {
    const chan = new Map<string, Map<string, { brand: string; gid: string; tasks: Task[] }>>();
    for (const t of open) {
      const m = (t.project_label || "").match(/^(EDM|Social)\s*·\s*(.+)$/i);
      const cName = m ? (m[1].toUpperCase() === "EDM" ? "EDM" : "Social") : "Other";
      const bName = m ? m[2] : (t.project_label || "Board");
      const cMap = chan.get(cName) ?? new Map();
      const cur = cMap.get(bName) ?? { brand: bName, gid: t.project_gid, tasks: [] };
      cur.tasks.push(t); cMap.set(bName, cur); chan.set(cName, cMap);
    }
    const order = ["EDM", "Social", "Other"];
    return order.filter(c => chan.has(c)).map(c => ({
      name: c,
      brands: [...chan.get(c)!.values()].sort((a, b) => b.tasks.length - a.tasks.length || a.brand.localeCompare(b.brand)),
    }));
  }, [open]);
  const overdue = open.filter(t => t.due_on && t.due_on < todayStr()).length;
  const boardsForAdd = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of open) if (t.project_label && !m.has(t.project_label)) m.set(t.project_label, t.project_gid);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [open]);

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
    const label = boardsForAdd.find(([, g]) => g === af.project_gid)?.[0] || "";
    const d = await post({ action: "task.create", ...af, project_label: label });
    setBusy(false);
    if (d.ok) { setTasks(p => [d.item, ...p]); setAf({ name: "", notes: "", due_on: "", project_gid: af.project_gid }); setShowAdd(false); }
    else setErr(d.error || "Couldn't create the task.");
  }

  if (needsSetup) return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-500">Run <code className="bg-gray-100 px-1 rounded">add_asana_tasks.sql</code> and configure the Asana sync first.</div>;
  if (loading) return <div className="p-8 text-center text-sm text-gray-400">Loading…</div>;

  const matchesQ = (t: Task) => !q || t.name.toLowerCase().includes(q.toLowerCase());

  const TaskRow = ({ t, inQueue, showBrand = false }: { t: Task; inQueue: boolean; showBrand?: boolean }) => {
    const late = t.due_on && t.due_on < todayStr() && !t.completed;
    return (
      <div className="flex items-center gap-2.5 py-[7px] group">
        <button onClick={() => complete(t.gid)} title="Mark done (updates Asana)"
          className="w-[17px] h-[17px] rounded-full border-2 border-gray-300 hover:border-emerald-500 hover:bg-emerald-100 shrink-0 transition-colors" />
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] text-slate-700 leading-snug truncate">
            {t.permalink_url ? <a href={t.permalink_url} target="_blank" rel="noreferrer" className="hover:text-emerald-700 hover:underline" title={t.name}>{cleanName(t.name)}</a> : cleanName(t.name)}
          </p>
          {showBrand && <p className="text-[11px] text-gray-400 truncate">{t.project_label}</p>}
        </div>
        {admin && !inQueue && (
          <button onClick={() => addToQueue(t.gid)} title="Add to this week's priorities"
            className="text-[15px] leading-none font-bold text-emerald-500 hover:text-emerald-700 opacity-0 group-hover:opacity-100 shrink-0 px-0.5">＋</button>
        )}
        {admin && inQueue && <button onClick={() => removeFromQueue(t.gid)} className="text-[11px] text-gray-400 hover:text-rose-500 shrink-0">remove</button>}
        {admin
          ? <input type="date" value={t.due_on ?? ""} onChange={e => setDue(t.gid, e.target.value)}
              className={`text-[11.5px] border rounded-md px-1 py-0.5 shrink-0 w-[108px] ${late ? "border-rose-200 bg-rose-50 text-rose-600" : "border-transparent hover:border-gray-200 text-slate-400 bg-transparent"}`} />
          : t.due_on && <span className={`text-[11.5px] rounded-md px-1.5 py-0.5 shrink-0 ${late ? "bg-rose-50 text-rose-600 font-semibold" : "text-gray-400"}`}>{dShort(t.due_on)}</span>}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Design</h1>
          <p className="text-sm text-gray-400">EDM and social work across every brand. Queue the week here — ticks, due dates and new tasks write back to Asana.</p>
        </div>
        {asanaWrite && <button onClick={() => setShowAdd(v => !v)} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-4 py-2 shrink-0">{showAdd ? "Cancel" : "+ New task"}</button>}
      </div>
      {err && <p className="text-sm text-rose-500">{err}</p>}

      {/* Summary + channel filter */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4"><p className="text-[11px] uppercase tracking-wider text-gray-400">Open tasks</p><p className="text-2xl font-bold text-slate-800">{open.length}</p></div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4"><p className="text-[11px] uppercase tracking-wider text-gray-400">This week</p><p className="text-2xl font-bold text-emerald-600">{queue.length}</p></div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4"><p className="text-[11px] uppercase tracking-wider text-gray-400">Overdue</p><p className={`text-2xl font-bold ${overdue ? "text-rose-500" : "text-slate-800"}`}>{overdue}</p></div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center">
          <div className="inline-flex bg-gray-100 rounded-lg p-0.5">
            {(["all", "EDM", "Social"] as const).map(c => (
              <button key={c} onClick={() => setChannelFilter(c)} className={`px-2.5 py-1 rounded-md text-[12px] font-semibold ${channelFilter === c ? "bg-white shadow-sm text-slate-700" : "text-gray-400 hover:text-gray-600"}`}>{c === "all" ? "All" : c}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Quick add */}
      {showAdd && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          <input value={af.name} onChange={e => setAf({ ...af, name: e.target.value })} placeholder="Task name" className={`${inp} lg:col-span-2`} />
          <select value={af.project_gid} onChange={e => setAf({ ...af, project_gid: e.target.value })} className={inp}>
            <option value="">Board…</option>
            {boardsForAdd.map(([label, gid]) => <option key={gid} value={gid}>{label}</option>)}
          </select>
          <input type="date" value={af.due_on} onChange={e => setAf({ ...af, due_on: e.target.value })} className={inp} />
          <button onClick={createTask} disabled={busy} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-4 py-2 disabled:opacity-60">{busy ? "Creating…" : "Add to Asana"}</button>
          <textarea value={af.notes} onChange={e => setAf({ ...af, notes: e.target.value })} rows={2} placeholder="Brief / notes (optional)" className={`${inp} resize-y sm:col-span-2 lg:col-span-5`} />
        </div>
      )}

      {/* This week's priorities */}
      <div className="rounded-2xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50/70 to-white shadow-sm p-5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">This week&apos;s priorities · work top to bottom</p>
          {!prioritiesSetup && <span className="text-[11px] text-rose-500">Run add_design_priorities.sql to enable the queue</span>}
        </div>
        {queue.length === 0 ? <p className="text-sm text-gray-400 py-3">Nothing queued yet{admin ? " — hover a task below and click ＋." : "."}</p> : (
          <div className="space-y-1">
            {queue.map((t, i) => (
              <div key={t.gid} className="flex items-center gap-2.5 bg-white rounded-xl border border-emerald-100 px-3 py-1">
                <span className="w-6 h-6 rounded-full bg-emerald-500 text-white text-[12px] font-bold grid place-items-center shrink-0">{i + 1}</span>
                {admin && (
                  <span className="flex flex-col shrink-0">
                    <button onClick={() => move(t.gid, -1)} disabled={i === 0} className="text-gray-300 hover:text-slate-600 disabled:opacity-20 leading-none text-[11px]">▲</button>
                    <button onClick={() => move(t.gid, 1)} disabled={i === queue.length - 1} className="text-gray-300 hover:text-slate-600 disabled:opacity-20 leading-none text-[11px]">▼</button>
                  </span>
                )}
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: brandColor(brandOfLabel(t.project_label)) }} />
                <div className="flex-1 min-w-0"><TaskRow t={t} inQueue showBrand /></div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Search */}
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search tasks across all brands…" className={`${inp} w-full`} />

      {/* Channel sections → brand cards */}
      {channels.filter(c => channelFilter === "all" || c.name === channelFilter).map(c => {
        const brandCards = c.brands
          .map(b => ({ ...b, tasks: b.tasks.filter(t => !queued.has(t.gid) && matchesQ(t)) }))
          .filter(b => b.tasks.length > 0);
        if (brandCards.length === 0) return null;
        const total = brandCards.reduce((s, b) => s + b.tasks.length, 0);
        return (
          <div key={c.name}>
            <div className="flex items-baseline gap-2 mb-2 px-1">
              <h2 className="text-[13px] font-bold uppercase tracking-[0.14em] text-slate-500">{c.name === "EDM" ? "✉️ EDMs" : c.name === "Social" ? "📱 Social" : c.name}</h2>
              <span className="text-[12px] text-gray-400">{total} open</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {brandCards.map(b => (
                <div key={b.brand} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden" style={{ borderTop: `3px solid ${brandColor(b.brand)}` }}>
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-50">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: brandColor(b.brand) }} />
                    <p className="text-[13px] font-bold text-slate-800 truncate">{b.brand}</p>
                    <span className="ml-auto text-[11px] font-semibold text-gray-400 bg-gray-50 rounded-full px-2 py-0.5 shrink-0">{b.tasks.length}</span>
                  </div>
                  <div className="px-4 py-1 divide-y divide-gray-50">
                    {b.tasks.map(t => <TaskRow key={t.gid} t={t} inQueue={false} />)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {open.length === 0 && <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">No boards synced yet — add board IDs to the Asana sync config.</div>}
    </div>
  );
}
