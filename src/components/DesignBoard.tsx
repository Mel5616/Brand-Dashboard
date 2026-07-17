"use client";

import { useEffect, useMemo, useState } from "react";

// Design board: per-brand Asana boards grouped into EDM and Social sections,
// brand cards in a grid with brand colours. The admin builds an ordered "This
// week's priorities" queue the designer works straight down; completing, due
// dates and quick-adds write back to Asana. Priority flags + notes live in the
// dashboard only (design_task_meta), completions feed a throughput tracker
// (design_completions), and Claude turns the lot into a weekly briefing.
type Task = {
  gid: string; name: string; notes: string; assignee: string | null; due_on: string | null;
  completed: boolean; section: string; project_gid: string; project_label: string | null;
  permalink_url: string | null; modified_at: string;
};
type Priority = { task_gid: string; rank: number };
type Meta = { priority?: "high" | "medium" | "low" | null; notes?: string | null };
type Completion = { task_gid: string; name: string | null; project_label: string | null; due_on: string | null; created_at_asana: string | null; completed_at: string; source: string };
type BrandRef = { name: string; color: string };

const inp = "text-sm border border-gray-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400";
const dShort = (s?: string | null) => s ? new Date(s + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : "";
const todayStr = () => new Date().toISOString().slice(0, 10);
// Strip the brand-code prefix ("CK - ", "MIA – ") — the card already names the brand.
const cleanName = (name: string) => (name || "").replace(/^[A-Za-z]{2,5}\s*[-–—:]\s*/, "");
const PRIO: Record<string, { label: string; letter: string; cls: string; idle: string; weight: number }> = {
  high: { label: "High", letter: "H", cls: "bg-rose-500 text-white", idle: "border-rose-200 text-rose-400 hover:bg-rose-50", weight: 0 },
  medium: { label: "Med", letter: "M", cls: "bg-amber-400 text-white", idle: "border-amber-200 text-amber-500 hover:bg-amber-50", weight: 1 },
  low: { label: "Low", letter: "L", cls: "bg-sky-400 text-white", idle: "border-sky-200 text-sky-400 hover:bg-sky-50", weight: 2 },
};
const prioWeight = (p?: string | null) => (p && PRIO[p] ? PRIO[p].weight : 3);
// Business weeks run Sunday→Saturday.
const weekStartOf = (iso: string) => {
  const d = new Date(iso.slice(0, 10) + "T00:00:00");
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().slice(0, 10);
};

// Tiny markdown renderer for the AI briefing (bold + bullets only).
function mdLite(text: string) {
  const bold = (s: string, k: string) => s.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <strong key={`${k}-${i}`} className="font-bold text-slate-800">{part}</strong> : part));
  return text.split("\n").map((line, i) => {
    const t = line.trim();
    if (!t) return null;
    if (/^#{1,4}\s/.test(t)) return <p key={i} className="text-[13px] font-bold text-slate-800 mt-3 first:mt-0">{bold(t.replace(/^#{1,4}\s/, ""), String(i))}</p>;
    if (/^[-*•]\s/.test(t)) return <p key={i} className="text-[13px] text-slate-600 leading-relaxed pl-4 relative before:content-['•'] before:absolute before:left-1 before:text-indigo-400">{bold(t.replace(/^[-*•]\s/, ""), String(i))}</p>;
    if (/^\d+\.\s/.test(t)) return <p key={i} className="text-[13px] text-slate-600 leading-relaxed mt-2">{bold(t, String(i))}</p>;
    return <p key={i} className="text-[13px] text-slate-600 leading-relaxed mt-1.5">{bold(t, String(i))}</p>;
  });
}

export function DesignBoard({ admin, brands = [] }: { admin: boolean; brands?: BrandRef[] }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [meta, setMeta] = useState<Record<string, Meta>>({});
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [prioritiesSetup, setPrioritiesSetup] = useState(true);
  const [metaSetup, setMetaSetup] = useState(true);
  const [asanaWrite, setAsanaWrite] = useState(true);
  const [aiReady, setAiReady] = useState(false);
  const [err, setErr] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [af, setAf] = useState({ name: "", notes: "", due_on: "", project_gid: "" });
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [channelFilter, setChannelFilter] = useState<"all" | "EDM" | "Social" | "Sales">("all");
  const [notesFor, setNotesFor] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [insights, setInsights] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [showStats, setShowStats] = useState(false);

  useEffect(() => {
    fetch("/api/design").then(r => r.json()).then(d => {
      if (d.needsSetup) setNeedsSetup(true);
      else if (d.ok) {
        setTasks(d.tasks ?? []); setPriorities(d.priorities ?? []);
        setMeta(Object.fromEntries((d.meta ?? []).map((m: any) => [m.task_gid, { priority: m.priority, notes: m.notes }])));
        setCompletions(d.completions ?? []);
        setPrioritiesSetup(d.prioritiesSetup !== false); setMetaSetup(d.metaSetup !== false);
        setAsanaWrite(!!d.asanaWrite); setAiReady(!!d.aiReady);
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const post = (body: any) => fetch("/api/design", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json());
  const byGid = useMemo(() => new Map(tasks.map(t => [t.gid, t])), [tasks]);
  const open = useMemo(() => tasks.filter(t => !t.completed), [tasks]);
  const queued = useMemo(() => new Set(priorities.map(p => p.task_gid)), [priorities]);
  const queue = useMemo(() => priorities.map(p => byGid.get(p.task_gid)).filter((t): t is Task => !!t && !t.completed), [priorities, byGid]);
  const brandColor = (name: string) => brands.find(b => b.name.toLowerCase() === name.toLowerCase())?.color ?? "#94a3b8";
  const brandOfLabel = (label?: string | null) => (label || "").replace(/^(EDM|Social)\s*·\s*/i, "");

  // "EDM · Coolkidz" → channel EDM, brand Coolkidz. The sales request board
  // groups by Asana section instead (= who requested). Anything else → Other.
  const channels = useMemo(() => {
    const chan = new Map<string, Map<string, { brand: string; gid: string; tasks: Task[] }>>();
    for (const t of open) {
      const m = (t.project_label || "").match(/^(EDM|Social)\s*·\s*(.+)$/i);
      const sales = !m && /sales/i.test(t.project_label || "");
      const cName = m ? (m[1].toUpperCase() === "EDM" ? "EDM" : "Social") : sales ? "Sales" : "Other";
      const bName = m ? m[2] : sales ? (t.section || "General") : (t.project_label || "Board");
      const cMap = chan.get(cName) ?? new Map();
      const cur = cMap.get(bName) ?? { brand: bName, gid: t.project_gid, tasks: [] };
      cur.tasks.push(t); cMap.set(bName, cur); chan.set(cName, cMap);
    }
    const order = ["EDM", "Social", "Sales", "Other"];
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

  // Throughput: completions per Sun–Sat week (last 8), on-time rate, this week.
  const stats = useMemo(() => {
    const weeks: { start: string; count: number }[] = [];
    const cur = weekStartOf(todayStr());
    for (let i = 7; i >= 0; i--) {
      const d = new Date(cur + "T00:00:00"); d.setDate(d.getDate() - i * 7);
      weeks.push({ start: d.toISOString().slice(0, 10), count: 0 });
    }
    let onTime = 0, withDue = 0;
    for (const c of completions) {
      const ws = weekStartOf(c.completed_at);
      const w = weeks.find(x => x.start === ws);
      if (w) w.count++;
      if (c.due_on) { withDue++; if (c.completed_at.slice(0, 10) <= c.due_on) onTime++; }
    }
    return { weeks, thisWeek: weeks[weeks.length - 1]?.count ?? 0, total: completions.length, onTimePct: withDue ? Math.round((onTime / withDue) * 100) : null };
  }, [completions]);

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
    else {
      const t = byGid.get(gid);
      setCompletions(p => [{ task_gid: gid, name: t?.name ?? null, project_label: t?.project_label ?? null, due_on: t?.due_on ?? null, created_at_asana: null, completed_at: new Date().toISOString(), source: "dashboard" }, ...p]);
    }
  }
  async function setDue(gid: string, due_on: string) {
    setTasks(p => p.map(t => t.gid === gid ? { ...t, due_on: due_on || null } : t));
    const d = await post({ action: "task.due", gid, due_on: due_on || null });
    if (!d.ok) setErr(d.error || "Couldn't update the due date in Asana.");
  }
  async function setPriority(gid: string, next: Meta["priority"]) {
    const prev = meta[gid]?.priority ?? null;
    setMeta(m => ({ ...m, [gid]: { ...m[gid], priority: next } }));
    const d = await post({ action: "meta.set", gid, priority: next });
    if (!d.ok) { setMeta(m => ({ ...m, [gid]: { ...m[gid], priority: prev } })); setErr(d.error || "Couldn't save priority."); }
  }
  function openNotes(gid: string) {
    setNotesFor(cur => cur === gid ? null : gid);
    setNoteDraft(meta[gid]?.notes ?? "");
  }
  async function saveNotes(gid: string) {
    const d = await post({ action: "meta.set", gid, notes: noteDraft });
    if (d.ok) { setMeta(m => ({ ...m, [gid]: { ...m[gid], notes: noteDraft.trim() || null } })); setNotesFor(null); }
    else setErr(d.error || "Couldn't save notes.");
  }
  async function runInsights() {
    setAiBusy(true); setErr("");
    const d = await fetch("/api/design/insights", { method: "POST" }).then(r => r.json()).catch(() => null);
    setAiBusy(false);
    if (d?.ok) setInsights(d.insights);
    else setErr(d?.error || "Couldn't generate insights.");
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
  const sortTasks = (arr: Task[]) => [...arr].sort((a, b) =>
    prioWeight(meta[a.gid]?.priority) - prioWeight(meta[b.gid]?.priority) ||
    (a.due_on ?? "9999").localeCompare(b.due_on ?? "9999"));

  const TaskRow = ({ t, inQueue }: { t: Task; inQueue: boolean }) => {
    const late = t.due_on && t.due_on < todayStr() && !t.completed;
    const m = meta[t.gid];
    const p = m?.priority && PRIO[m.priority];
    return (
      <div>
        <div className="flex items-start gap-2.5 py-[7px] group">
          <button onClick={() => complete(t.gid)} title="Mark done (updates Asana)"
            className="w-[17px] h-[17px] rounded-full border-2 border-gray-300 hover:border-emerald-500 hover:bg-emerald-100 shrink-0 transition-colors mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] text-slate-700 leading-snug line-clamp-2 break-words">
              {t.permalink_url ? <a href={t.permalink_url} target="_blank" rel="noreferrer" className="hover:text-emerald-700 hover:underline" title={t.name}>{cleanName(t.name)}</a> : cleanName(t.name)}
            </p>
            {inQueue && <p className="text-[11px] text-gray-400 truncate">{t.project_label}</p>}
          </div>
          {metaSetup && (p || admin) && (
            <span className={`flex items-center gap-1 shrink-0 mt-0.5 ${p ? "" : "opacity-0 group-hover:opacity-100"}`}>
              {(["high", "medium", "low"] as const).map(k => {
                const active = m?.priority === k;
                if (!admin && !active) return null;
                return (
                  <button key={k} onClick={admin ? () => setPriority(t.gid, active ? null : k) : undefined}
                    title={admin ? `${PRIO[k].label} priority${active ? " — click to clear" : ""}` : `${PRIO[k].label} priority`}
                    className={`text-[10px] font-bold rounded-full transition-all ${active ? `${PRIO[k].cls} px-2 py-[3px] uppercase tracking-wide` : `w-[19px] h-[19px] border ${PRIO[k].idle}`} ${admin ? "" : "cursor-default"}`}>
                    {active ? PRIO[k].label : PRIO[k].letter}
                  </button>
                );
              })}
            </span>
          )}
          {metaSetup && (
            <button onClick={() => openNotes(t.gid)} title={m?.notes ? m.notes : "Add a note (stays on the dashboard)"}
              className={`text-[13px] leading-none shrink-0 mt-0.5 ${m?.notes ? "opacity-100" : "opacity-0 group-hover:opacity-100 grayscale"}`}>💬</button>
          )}
          {admin && !inQueue && (
            <button onClick={() => addToQueue(t.gid)} title="Add to this week's priorities"
              className="text-[15px] leading-none font-bold text-emerald-500 hover:text-emerald-700 opacity-0 group-hover:opacity-100 shrink-0 px-0.5 mt-0.5">＋</button>
          )}
          {admin && inQueue && <button onClick={() => removeFromQueue(t.gid)} className="text-[11px] text-gray-400 hover:text-rose-500 shrink-0 mt-0.5">remove</button>}
          {admin
            ? <input type="date" value={t.due_on ?? ""} onChange={e => setDue(t.gid, e.target.value)}
                className={`text-[11.5px] border rounded-md px-1 py-0.5 shrink-0 w-[108px] ${late ? "border-rose-200 bg-rose-50 text-rose-600" : "border-transparent hover:border-gray-200 text-slate-400 bg-transparent"}`} />
            : t.due_on && <span className={`text-[11.5px] rounded-md px-1.5 py-0.5 shrink-0 ${late ? "bg-rose-50 text-rose-600 font-semibold" : "text-gray-400"}`}>{dShort(t.due_on)}</span>}
        </div>
        {notesFor === t.gid && (
          <div className="ml-7 mb-2 bg-amber-50/60 border border-amber-100 rounded-xl p-2.5 space-y-2">
            <textarea value={noteDraft} onChange={e => setNoteDraft(e.target.value)} rows={2} autoFocus
              placeholder="Notes for the team — brief details, links, feedback… (dashboard only, not sent to Asana)"
              className="w-full text-[12.5px] border border-amber-200 rounded-lg px-2.5 py-1.5 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-amber-300 resize-y" />
            <div className="flex gap-2">
              <button onClick={() => saveNotes(t.gid)} className="text-[11.5px] font-semibold text-white bg-amber-500 hover:bg-amber-600 rounded-md px-3 py-1">Save note</button>
              <button onClick={() => setNotesFor(null)} className="text-[11.5px] text-gray-400 hover:text-gray-600">Cancel</button>
            </div>
          </div>
        )}
        {m?.notes && notesFor !== t.gid && (
          <p className="ml-7 -mt-1 mb-1.5 text-[11.5px] text-amber-700/90 bg-amber-50/70 rounded-lg px-2 py-1 line-clamp-2 cursor-pointer" onClick={() => openNotes(t.gid)}>💬 {m.notes}</p>
        )}
      </div>
    );
  };

  const maxWeek = Math.max(1, ...stats.weeks.map(w => w.count));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Design</h1>
          <p className="text-sm text-gray-400">EDM and social work across every brand. Queue the week here — ticks, due dates and new tasks write back to Asana.</p>
        </div>
        <div className="flex gap-2 shrink-0">
          {aiReady && (
            <button onClick={runInsights} disabled={aiBusy}
              className="text-sm font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg px-4 py-2 disabled:opacity-60">
              {aiBusy ? "Thinking…" : "✨ AI insights"}
            </button>
          )}
          {asanaWrite && <button onClick={() => setShowAdd(v => !v)} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-4 py-2">{showAdd ? "Cancel" : "+ New task"}</button>}
        </div>
      </div>
      {err && <p className="text-sm text-rose-500">{err}</p>}
      {!metaSetup && <p className="text-[12px] text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">Run <code className="bg-white px-1 rounded">add_design_meta.sql</code> to enable priorities, notes and the completion tracker.</p>}

      {/* AI briefing */}
      {insights && (
        <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50/80 to-white shadow-sm p-5 relative">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-600">✨ This week&apos;s AI briefing</p>
            <button onClick={() => setInsights("")} className="text-[11px] text-gray-400 hover:text-gray-600">dismiss</button>
          </div>
          <div className="space-y-0.5">{mdLite(insights)}</div>
        </div>
      )}

      {/* Summary + channel filter */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4"><p className="text-[11px] uppercase tracking-wider text-gray-400">Open tasks</p><p className="text-2xl font-bold text-slate-800">{open.length}</p></div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4"><p className="text-[11px] uppercase tracking-wider text-gray-400">This week</p><p className="text-2xl font-bold text-emerald-600">{queue.length}</p></div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4"><p className="text-[11px] uppercase tracking-wider text-gray-400">Overdue</p><p className={`text-2xl font-bold ${overdue ? "text-rose-500" : "text-slate-800"}`}>{overdue}</p></div>
        <button onClick={() => setShowStats(v => !v)} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-left hover:border-emerald-200 transition-colors">
          <p className="text-[11px] uppercase tracking-wider text-gray-400">Done this week {showStats ? "▾" : "▸"}</p>
          <p className="text-2xl font-bold text-slate-800">{stats.thisWeek}</p>
        </button>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center col-span-2 sm:col-span-1">
          <div className="inline-flex bg-gray-100 rounded-lg p-0.5 mx-auto">
            {(["all", "EDM", "Social", "Sales"] as const).map(c => (
              <button key={c} onClick={() => setChannelFilter(c)} className={`px-2.5 py-1 rounded-md text-[12px] font-semibold ${channelFilter === c ? "bg-white shadow-sm text-slate-700" : "text-gray-400 hover:text-gray-600"}`}>{c === "all" ? "All" : c}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Throughput tracker */}
      {showStats && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Completed per week · last 8 weeks</p>
            <p className="text-[12px] text-gray-400">
              {stats.total} done in ~4 months{stats.onTimePct !== null && <> · <span className={stats.onTimePct >= 70 ? "text-emerald-600 font-semibold" : "text-amber-600 font-semibold"}>{stats.onTimePct}% on time</span></>}
            </p>
          </div>
          {stats.total === 0 ? (
            <p className="text-sm text-gray-400">No completions logged yet — they&apos;ll appear as tasks get ticked off here or finished in Asana.</p>
          ) : (
            <div className="flex items-end gap-2 h-24">
              {stats.weeks.map((w, i) => (
                <div key={w.start} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[11px] font-semibold text-slate-500">{w.count || ""}</span>
                  <div className={`w-full rounded-t-md ${i === stats.weeks.length - 1 ? "bg-emerald-400" : "bg-emerald-200"}`} style={{ height: `${Math.max(3, (w.count / maxWeek) * 64)}px` }} />
                  <span className="text-[10px] text-gray-400">{dShort(w.start)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
                <div className="flex-1 min-w-0"><TaskRow t={t} inQueue /></div>
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
          .map(b => ({ ...b, tasks: sortTasks(b.tasks.filter(t => !queued.has(t.gid) && matchesQ(t))) }))
          .filter(b => b.tasks.length > 0);
        if (brandCards.length === 0) return null;
        const total = brandCards.reduce((s, b) => s + b.tasks.length, 0);
        return (
          <div key={c.name}>
            <div className="flex items-baseline gap-2 mb-2 px-1">
              <h2 className="text-[13px] font-bold uppercase tracking-[0.14em] text-slate-500">{c.name === "EDM" ? "✉️ EDMs" : c.name === "Social" ? "📱 Social" : c.name === "Sales" ? "🤝 Sales team requests · by requester" : c.name}</h2>
              <span className="text-[12px] text-gray-400">{total} open</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {brandCards.map(b => {
                const col = brandColor(b.brand);
                const hi = b.tasks.filter(t => meta[t.gid]?.priority === "high").length;
                return (
                  <div key={b.brand} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow" style={{ borderTop: `3px solid ${col}` }}>
                    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-50" style={{ background: `${col}0D` }}>
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: col }} />
                      <p className="text-[13px] font-bold text-slate-800 truncate">{b.brand}</p>
                      {hi > 0 && <span className="text-[10.5px] font-bold text-rose-600 bg-rose-100 rounded-full px-1.5 py-0.5 shrink-0">{hi} high</span>}
                      <span className="ml-auto text-[11px] font-semibold text-gray-400 bg-white/70 rounded-full px-2 py-0.5 shrink-0">{b.tasks.length}</span>
                    </div>
                    <div className="px-4 py-1 divide-y divide-gray-50">
                      {b.tasks.map(t => <TaskRow key={t.gid} t={t} inQueue={false} />)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {open.length === 0 && <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">No boards synced yet — add board IDs to the Asana sync config.</div>}
    </div>
  );
}
