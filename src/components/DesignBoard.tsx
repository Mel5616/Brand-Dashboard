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
  permalink_url: string | null; modified_at: string; requested_by?: string | null;
};
type Priority = { task_gid: string; rank: number; bucket?: string | null };
const BUCKETS = [
  { key: "urgent", label: "🔥 Urgent", head: "text-rose-600", card: "border-rose-200 from-rose-50/70", ring: "border-rose-100", num: "bg-rose-500" },
  { key: "week", label: "📌 This week", head: "text-emerald-700", card: "border-emerald-200 from-emerald-50/70", ring: "border-emerald-100", num: "bg-emerald-500" },
  { key: "next", label: "📅 Next week", head: "text-sky-700", card: "border-sky-200 from-sky-50/70", ring: "border-sky-100", num: "bg-sky-500" },
  { key: "soon", label: "🌱 Coming soon", head: "text-violet-700", card: "border-violet-200 from-violet-50/70", ring: "border-violet-100", num: "bg-violet-500" },
] as const;
type BucketKey = (typeof BUCKETS)[number]["key"];
const bucketOf = (p: Priority): BucketKey => (BUCKETS.some(b => b.key === p.bucket) ? (p.bucket as BucketKey) : "week");
type Meta = { priority?: "high" | "medium" | "low" | null; notes?: string | null };
type Completion = { task_gid: string; name: string | null; project_label: string | null; due_on: string | null; created_at_asana: string | null; completed_at: string; source: string };
type DesignCampaign = { id: string; campaign: string; brand: string; status: string; key_date: string | null; end_date: string | null; briefUrl: string | null; oneLiner: string };
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

// Pastel donut chart via conic-gradient, with legend.
function Donut({ title, segments, center }: { title: string; segments: { label: string; value: number; color: string }[]; center?: string }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total === 0) return null;
  let acc = 0;
  const stops = segments.map(s => { const from = acc / total * 360; acc += s.value; return `${s.color} ${from}deg ${(acc / total * 360)}deg`; }).join(", ");
  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{title}</p>
      <div className="relative w-24 h-24 rounded-full" style={{ background: `conic-gradient(${stops})` }}>
        <div className="absolute inset-[18px] rounded-full bg-white grid place-items-center">
          <span className="text-[13px] font-bold text-slate-700">{center ?? total}</span>
        </div>
      </div>
      <div className="space-y-0.5">
        {segments.filter(s => s.value > 0).map(s => (
          <p key={s.label} className="text-[10.5px] text-slate-500 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />{s.label} · {s.value}{total > 0 ? ` (${Math.round(s.value / total * 100)}%)` : ""}
          </p>
        ))}
      </div>
    </div>
  );
}

export function DesignBoard({ admin, brands = [] }: { admin: boolean; brands?: BrandRef[] }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [meta, setMeta] = useState<Record<string, Meta>>({});
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [designCampaigns, setDesignCampaigns] = useState<DesignCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [prioritiesSetup, setPrioritiesSetup] = useState(true);
  const [metaSetup, setMetaSetup] = useState(true);
  const [asanaWrite, setAsanaWrite] = useState(true);
  const [err, setErr] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [af, setAf] = useState({ name: "", notes: "", due_on: "", project_gid: "" });
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [channelFilter, setChannelFilter] = useState<"all" | "EDM" | "Social" | "Sales">("all");
  const [notesFor, setNotesFor] = useState<string | null>(null);
  const [plusFor, setPlusFor] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [showStats, setShowStats] = useState(false);

  useEffect(() => {
    fetch("/api/design").then(r => r.json()).then(d => {
      if (d.needsSetup) setNeedsSetup(true);
      else if (d.ok) {
        setTasks(d.tasks ?? []); setPriorities(d.priorities ?? []);
        setMeta(Object.fromEntries((d.meta ?? []).map((m: any) => [m.task_gid, { priority: m.priority, notes: m.notes }])));
        setCompletions(d.completions ?? []);
        setDesignCampaigns(d.designCampaigns ?? []);
        setPrioritiesSetup(d.prioritiesSetup !== false); setMetaSetup(d.metaSetup !== false);
        setAsanaWrite(!!d.asanaWrite);
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const post = (body: any) => fetch("/api/design", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json());
  const byGid = useMemo(() => new Map(tasks.map(t => [t.gid, t])), [tasks]);
  const open = useMemo(() => tasks.filter(t => !t.completed), [tasks]);
  const queued = useMemo(() => new Set(priorities.map(p => p.task_gid)), [priorities]);
  // Queue entries are Asana tasks OR campaigns (gid "campaign:<id>").
  type QueueItem = { kind: "task"; gid: string; t: Task } | { kind: "campaign"; gid: string; c: DesignCampaign };
  const buckets = useMemo(() => {
    const out = new Map<BucketKey, QueueItem[]>(BUCKETS.map(b => [b.key, []]));
    const campById = new Map(designCampaigns.map(c => [`campaign:${c.id}`, c]));
    for (const p of [...priorities].sort((a, b) => a.rank - b.rank)) {
      const c = campById.get(p.task_gid);
      if (c) { out.get(bucketOf(p))!.push({ kind: "campaign", gid: p.task_gid, c }); continue; }
      const t = byGid.get(p.task_gid);
      if (t && !t.completed) out.get(bucketOf(p))!.push({ kind: "task", gid: p.task_gid, t });
    }
    return out;
  }, [priorities, byGid, designCampaigns]);
  const queueCount = (buckets.get("urgent")?.length ?? 0) + (buckets.get("week")?.length ?? 0);
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
    // Requests first (sales team + Diep's own list), then the brand channels.
    const order = ["Sales", "Other", "EDM", "Social"];
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

  // Analytics for the visual dashboard panel.
  const analytics = useMemo(() => {
    const today = todayStr();
    const in7 = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);
    const in14 = new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10);
    const counts = { overdue: 0, dueToday: 0, due7: 0, due14: 0 };
    const byChannel = new Map<string, number>();
    const byPriority = { high: 0, medium: 0, low: 0, none: 0 };
    const byBrand = new Map<string, number>();
    const byRequester = new Map<string, number>();
    for (const t of open) {
      if (t.due_on) {
        if (t.due_on < today) counts.overdue++;
        else if (t.due_on === today) counts.dueToday++;
        else if (t.due_on <= in7) counts.due7++;
        else if (t.due_on <= in14) counts.due14++;
      }
      const m = (t.project_label || "").match(/^(EDM|Social)\s*·\s*(.+)$/i);
      const ch = m ? (m[1].toUpperCase() === "EDM" ? "EDM" : "Social") : /sales/i.test(t.project_label || "") ? "Sales" : "Other";
      byChannel.set(ch, (byChannel.get(ch) ?? 0) + 1);
      const p = meta[t.gid]?.priority;
      byPriority[p && p in byPriority ? p : "none"]++;
      const brand = m ? m[2] : null;
      if (brand) byBrand.set(brand, (byBrand.get(brand) ?? 0) + 1);
      if (t.requested_by) {
        const name = t.requested_by.split(" ")[0];
        byRequester.set(name, (byRequester.get(name) ?? 0) + 1);
      }
    }
    return {
      counts,
      byChannel: [...byChannel.entries()].sort((a, b) => b[1] - a[1]),
      byPriority,
      byBrand: [...byBrand.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10),
      byRequester: [...byRequester.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
    };
  }, [open, meta]);

  async function addToQueue(gid: string, bucket: BucketKey) {
    setPlusFor(null);
    const d = await post({ action: "priority.add", task_gid: gid, bucket });
    if (d.ok) setPriorities(p => [...p, { task_gid: gid, rank: (d.item?.rank ?? (p[p.length - 1]?.rank ?? 0) + 1), bucket: d.item?.bucket ?? bucket }]);
    else setErr(d.error || "Couldn't add.");
  }
  async function removeFromQueue(gid: string) {
    const d = await post({ action: "priority.remove", task_gid: gid });
    if (d.ok) setPriorities(p => p.filter(x => x.task_gid !== gid));
  }
  async function moveBucket(gid: string, bucket: BucketKey) {
    const prev = priorities;
    setPriorities(p => p.map(x => x.task_gid === gid ? { ...x, bucket } : x));
    const d = await post({ action: "priority.bucket", task_gid: gid, bucket });
    if (!d.ok) { setPriorities(prev); setErr(d.error || "Couldn't move — has the bucket SQL been run?"); }
  }
  async function move(gid: string, dir: -1 | 1) {
    // Reorder within the task's bucket only.
    const me = priorities.find(p => p.task_gid === gid);
    if (!me) return;
    const order = priorities.filter(p => bucketOf(p) === bucketOf(me)).sort((a, b) => a.rank - b.rank).map(p => p.task_gid);
    const i = order.indexOf(gid), j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    const ranks = new Map(order.map((g, idx) => [g, idx + 1]));
    setPriorities(p => p.map(x => ranks.has(x.task_gid) ? { ...x, rank: ranks.get(x.task_gid)! } : x));
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
        <div className="py-[7px] group">
          {/* Line 1: tick + full task name (never truncated) */}
          <div className="flex items-start gap-2.5">
            <button onClick={() => complete(t.gid)} title="Mark done (updates Asana)"
              className="w-[17px] h-[17px] rounded-full border-2 border-gray-300 hover:border-emerald-500 hover:bg-emerald-100 shrink-0 transition-colors mt-0.5" />
            <p className="text-[13.5px] text-slate-700 leading-snug flex-1 min-w-0">
              {t.permalink_url ? <a href={t.permalink_url} target="_blank" rel="noreferrer" className="hover:text-emerald-700 hover:underline">{cleanName(t.name)}</a> : cleanName(t.name)}
            </p>
          </div>
          {/* Line 2: meta + controls */}
          <div className="flex items-center gap-1.5 flex-wrap pl-[27px] mt-0.5">
            {admin && !inQueue
              ? <input type="date" value={t.due_on ?? ""} onChange={e => setDue(t.gid, e.target.value)}
                  className={`text-[11px] border rounded-md px-1 py-0.5 shrink-0 w-[104px] ${late ? "border-rose-200 bg-rose-50 text-rose-600" : "border-transparent hover:border-gray-200 text-slate-400 bg-transparent"}`} />
              : t.due_on && <span className={`text-[11px] rounded-md px-1 py-0.5 shrink-0 ${late ? "bg-rose-50 text-rose-600 font-semibold" : "text-gray-400"}`}>{dShort(t.due_on)}</span>}
            {t.requested_by && <span className="text-[10.5px] text-gray-400 bg-gray-50 rounded-full px-1.5 py-0.5" title={`Requested by ${t.requested_by}`}>req. {t.requested_by.split(" ")[0]}</span>}
            {inQueue && <span className="text-[10.5px] text-gray-400">{t.project_label}</span>}
            {metaSetup && (p || admin) && (
              <span className={`flex items-center gap-1 ${p ? "" : "opacity-0 group-hover:opacity-100"}`}>
                {(["high", "medium", "low"] as const).map(k => {
                  const active = m?.priority === k;
                  if (!admin && !active) return null;
                  return (
                    <button key={k} onClick={admin ? () => setPriority(t.gid, active ? null : k) : undefined}
                      title={admin ? `${PRIO[k].label} priority${active ? " — click to clear" : ""}` : `${PRIO[k].label} priority`}
                      className={`text-[10px] font-bold rounded-full transition-all ${active ? `${PRIO[k].cls} px-2 py-[2px] uppercase tracking-wide` : `w-[18px] h-[18px] border ${PRIO[k].idle}`} ${admin ? "" : "cursor-default"}`}>
                      {active ? PRIO[k].label : PRIO[k].letter}
                    </button>
                  );
                })}
              </span>
            )}
            {metaSetup && (
              <button onClick={() => openNotes(t.gid)} title={m?.notes ? m.notes : "Add a note (stays on the dashboard)"}
                className={`text-[13px] leading-none ${m?.notes ? "opacity-100" : "opacity-0 group-hover:opacity-100 grayscale"}`}>💬</button>
            )}
            {admin && !inQueue && (
              <span className="relative">
                <button onClick={() => setPlusFor(cur => cur === t.gid ? null : t.gid)} title="Add to the plan"
                  className={`text-[15px] leading-none font-bold text-emerald-500 hover:text-emerald-700 px-0.5 ${plusFor === t.gid ? "" : "opacity-0 group-hover:opacity-100"}`}>＋</button>
                {plusFor === t.gid && (
                  <span className="absolute left-0 top-6 z-20 bg-white border border-gray-200 rounded-xl shadow-lg p-1 flex flex-col min-w-[140px]">
                    {BUCKETS.map(bk => (
                      <button key={bk.key} onClick={() => addToQueue(t.gid, bk.key)}
                        className="text-left text-[12.5px] text-slate-600 hover:bg-gray-50 rounded-lg px-2.5 py-1.5 whitespace-nowrap">{bk.label}</button>
                    ))}
                  </span>
                )}
              </span>
            )}
            {admin && inQueue && <button onClick={() => removeFromQueue(t.gid)} className="text-[10.5px] text-gray-400 hover:text-rose-500">remove</button>}
          </div>
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
        {asanaWrite && <button onClick={() => setShowAdd(v => !v)} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-4 py-2 shrink-0">{showAdd ? "Cancel" : "+ New task"}</button>}
      </div>
      {err && <p className="text-sm text-rose-500">{err}</p>}
      {!metaSetup && <p className="text-[12px] text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">Run <code className="bg-white px-1 rounded">add_design_meta.sql</code> to enable priorities, notes and the completion tracker.</p>}

      {/* Summary + channel filter */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4"><p className="text-[11px] uppercase tracking-wider text-gray-400">Open tasks</p><p className="text-2xl font-bold text-slate-800">{open.length}</p></div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4"><p className="text-[11px] uppercase tracking-wider text-gray-400">This week</p><p className="text-2xl font-bold text-emerald-600">{queueCount}</p></div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4"><p className="text-[11px] uppercase tracking-wider text-gray-400">Overdue</p><p className={`text-2xl font-bold ${overdue ? "text-rose-500" : "text-slate-800"}`}>{overdue}</p></div>
        <button onClick={() => setShowStats(v => !v)} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-left hover:border-emerald-200 transition-colors">
          <p className="text-[11px] uppercase tracking-wider text-gray-400">📊 Analytics {showStats ? "▾" : "▸"}</p>
          <p className="text-2xl font-bold text-slate-800">{stats.thisWeek} <span className="text-[12px] font-normal text-gray-400">done this wk</span></p>
        </button>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center col-span-2 sm:col-span-1">
          <div className="inline-flex bg-gray-100 rounded-lg p-0.5 mx-auto">
            {(["all", "EDM", "Social", "Sales"] as const).map(c => (
              <button key={c} onClick={() => setChannelFilter(c)} className={`px-2.5 py-1 rounded-md text-[12px] font-semibold ${channelFilter === c ? "bg-white shadow-sm text-slate-700" : "text-gray-400 hover:text-gray-600"}`}>{c === "all" ? "All" : c}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Analytics dashboard */}
      {showStats && (
        <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/40 via-white to-pink-50/40 shadow-sm p-5 space-y-5">
          {/* KPI strip */}
          <div className="grid grid-cols-3 sm:grid-cols-6 rounded-xl bg-amber-50/70 border border-amber-100 divide-x divide-amber-100 text-center overflow-hidden">
            {[["Open tasks", open.length, "text-slate-800"],
              ["Overdue", analytics.counts.overdue, analytics.counts.overdue ? "text-rose-500" : "text-slate-800"],
              ["Due today", analytics.counts.dueToday, analytics.counts.dueToday ? "text-amber-600" : "text-slate-800"],
              ["Due ≤ 7 days", analytics.counts.due7, "text-slate-800"],
              ["Due ≤ 14 days", analytics.counts.due14, "text-slate-800"],
              ["Done this week", stats.thisWeek, "text-emerald-600"]].map(([l, v, cls]) => (
              <div key={String(l)} className="py-2.5 px-1">
                <p className={`text-xl font-bold ${cls}`}>{v as number}</p>
                <p className="text-[9.5px] uppercase tracking-wider text-amber-700/60">{l}</p>
              </div>
            ))}
          </div>

          {/* Donuts */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Donut title="By channel" segments={analytics.byChannel.map(([ch, n], i) => ({ label: ch, value: n, color: ["#818cf8", "#f9a8d4", "#fcd34d", "#94a3b8"][i % 4] }))} />
            <Donut title="By priority" segments={[
              { label: "High", value: analytics.byPriority.high, color: "#fb7185" },
              { label: "Medium", value: analytics.byPriority.medium, color: "#fbbf24" },
              { label: "Low", value: analytics.byPriority.low, color: "#7dd3fc" },
              { label: "Unset", value: analytics.byPriority.none, color: "#e2e8f0" },
            ]} />
            {stats.onTimePct !== null && (
              <Donut title="On time" center={`${stats.onTimePct}%`} segments={[
                { label: "On time", value: stats.onTimePct, color: "#34d399" },
                { label: "Late", value: 100 - stats.onTimePct, color: "#fda4af" },
              ]} />
            )}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 mb-2 text-center">Requested by</p>
              <div className="space-y-1.5">
                {analytics.byRequester.map(([name, n]) => (
                  <div key={name} className="flex items-center gap-2">
                    <span className="text-[10.5px] text-slate-500 w-14 truncate">{name}</span>
                    <div className="flex-1 h-2.5 rounded-full bg-gray-100"><div className="h-2.5 rounded-full bg-indigo-300" style={{ width: `${(n / (analytics.byRequester[0]?.[1] || 1)) * 100}%` }} /></div>
                    <span className="text-[10.5px] font-semibold text-slate-600 w-5 text-right">{n}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Brand workload + weekly timeline */}
          <div className="grid lg:grid-cols-2 gap-5">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 mb-2">Open tasks by brand</p>
              <div className="space-y-1.5">
                {analytics.byBrand.map(([brand, n]) => (
                  <div key={brand} className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-600 w-28 truncate">{brand}</span>
                    <div className="flex-1 h-3 rounded-full bg-gray-100"><div className="h-3 rounded-full" style={{ width: `${(n / (analytics.byBrand[0]?.[1] || 1)) * 100}%`, background: brandColor(brand) }} /></div>
                    <span className="text-[11px] font-semibold text-slate-600 w-5 text-right">{n}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 mb-2">Completed per week · last 8 weeks{stats.onTimePct !== null && <span className="normal-case tracking-normal text-gray-400 font-normal"> · {stats.total} done in ~4 months</span>}</p>
              {stats.total === 0 ? (
                <p className="text-sm text-gray-400">No completions logged yet.</p>
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
          </div>
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

      {/* The plan: urgent / this week / next week / coming soon */}
      <div>
        {!prioritiesSetup && <p className="text-[11px] text-rose-500 mb-1">Run add_design_priorities.sql to enable the plan</p>}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {BUCKETS.map(bk => {
            const list = buckets.get(bk.key) ?? [];
            return (
              <div key={bk.key} className={`rounded-2xl border-2 bg-gradient-to-br to-white shadow-sm p-4 ${bk.card}`}>
                <p className={`text-[11px] font-bold uppercase tracking-[0.16em] mb-2 ${bk.head}`}>{bk.label} <span className="opacity-50 font-semibold">· {list.length}</span></p>
                {list.length === 0 ? (
                  <p className="text-[12.5px] text-gray-400 py-2">Empty{admin ? " — hover a task below, click ＋" : ""}</p>
                ) : (
                  <div className="space-y-1">
                    {list.map((item, i) => (
                      <div key={item.gid} className={`bg-white rounded-xl border px-2.5 py-1 ${bk.ring}`}>
                        <div className="flex items-center gap-2">
                          <span className={`w-5 h-5 rounded-full text-white text-[11px] font-bold grid place-items-center shrink-0 ${bk.num}`}>{i + 1}</span>
                          {admin && (
                            <span className="flex flex-col shrink-0">
                              <button onClick={() => move(item.gid, -1)} disabled={i === 0} className="text-gray-300 hover:text-slate-600 disabled:opacity-20 leading-none text-[10px]">▲</button>
                              <button onClick={() => move(item.gid, 1)} disabled={i === list.length - 1} className="text-gray-300 hover:text-slate-600 disabled:opacity-20 leading-none text-[10px]">▼</button>
                            </span>
                          )}
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: item.kind === "task" ? brandColor(brandOfLabel(item.t.project_label)) : brandColor(item.c.brand.split("+")[0].trim()) }} />
                          {item.kind === "task"
                            ? <div className="flex-1 min-w-0"><TaskRow t={item.t} inQueue /></div>
                            : (
                              <div className="flex-1 min-w-0 py-[7px] group">
                                <p className="text-[13.5px] text-slate-700 leading-snug line-clamp-2 break-words">
                                  <span className="text-[10px] font-bold uppercase tracking-wide text-pink-500 bg-pink-50 rounded px-1 py-0.5 mr-1 align-middle">🎨</span>
                                  {item.c.briefUrl ? <a href={item.c.briefUrl} target="_blank" rel="noreferrer" className="hover:text-pink-700 hover:underline">{item.c.campaign}</a> : item.c.campaign}
                                </p>
                                <p className="text-[11px] text-gray-400 truncate">
                                  {item.c.brand}{item.c.key_date ? ` · launches ${dShort(item.c.key_date)}` : ""}
                                  {admin && <> · <button onClick={() => removeFromQueue(item.gid)} className="text-gray-400 hover:text-rose-500">remove</button></>}
                                </p>
                              </div>
                            )}
                        </div>
                        {admin && (
                          <div className="flex gap-1 pb-1 pl-7">
                            {BUCKETS.filter(x => x.key !== bk.key).map(x => (
                              <button key={x.key} onClick={() => moveBucket(item.gid, x.key)} title={`Move to ${x.label}`}
                                className="text-[10px] text-gray-400 hover:text-slate-600 hover:bg-gray-50 rounded px-1 py-0.5">{x.label.split(" ")[0]}→</button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Search */}
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search tasks across all brands…" className={`${inp} w-full`} />

      {/* Campaigns flagged "Design required" on the campaign calendar */}
      {designCampaigns.length > 0 && (
        <div className="rounded-2xl border-2 border-pink-200 bg-gradient-to-br from-pink-50/70 to-white shadow-sm p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-pink-600 mb-2">🎨 Campaigns needing design</p>
          <div className="space-y-1.5">
            {[...designCampaigns].sort((a, b) =>
              prioWeight(meta[`campaign:${a.id}`]?.priority) - prioWeight(meta[`campaign:${b.id}`]?.priority) ||
              (a.key_date ?? "9999").localeCompare(b.key_date ?? "9999")).map(c => {
              const gid = `campaign:${c.id}`;
              const m = meta[gid];
              const p = m?.priority && PRIO[m.priority];
              const soon = c.key_date && c.key_date <= new Date(Date.now() + 10 * 86400_000).toISOString().slice(0, 10);
              return (
                <div key={c.id} className="flex items-center gap-2.5 bg-white rounded-xl border border-pink-100 px-3 py-2 group">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: brandColor(c.brand.split("+")[0].trim()) }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-semibold text-slate-800 leading-snug">
                      {c.briefUrl ? <a href={c.briefUrl} target="_blank" rel="noreferrer" className="hover:text-pink-700 hover:underline">{c.campaign}</a> : c.campaign}
                      <span className="font-normal text-gray-400"> · {c.brand}</span>
                    </p>
                    <p className="text-[11.5px] text-gray-400">
                      {c.key_date ? <span className={soon ? "text-rose-500 font-semibold" : ""}>launches {dShort(c.key_date)}</span> : "no date"}
                      {c.status ? ` · ${c.status}` : ""}
                      {c.briefUrl && <> · <a href={c.briefUrl} target="_blank" rel="noreferrer" className="text-emerald-600 font-semibold hover:underline">Open brief →</a></>}
                    </p>
                  </div>
                  {metaSetup && (p || admin) && (
                    <span className={`flex items-center gap-1 shrink-0 ${p ? "" : "opacity-0 group-hover:opacity-100"}`}>
                      {(["high", "medium", "low"] as const).map(k => {
                        const active = m?.priority === k;
                        if (!admin && !active) return null;
                        return (
                          <button key={k} onClick={admin ? () => setPriority(gid, active ? null : k) : undefined}
                            title={admin ? `${PRIO[k].label} urgency${active ? " — click to clear" : ""}` : `${PRIO[k].label} urgency`}
                            className={`text-[10px] font-bold rounded-full transition-all ${active ? `${PRIO[k].cls} px-2 py-[3px] uppercase tracking-wide` : `w-[19px] h-[19px] border ${PRIO[k].idle}`} ${admin ? "" : "cursor-default"}`}>
                            {active ? PRIO[k].label : PRIO[k].letter}
                          </button>
                        );
                      })}
                    </span>
                  )}
                  {queued.has(gid)
                    ? <span className="text-[10.5px] font-semibold text-emerald-600 bg-emerald-50 rounded-full px-2 py-0.5 shrink-0">In the plan ✓</span>
                    : admin && (
                      <span className="relative shrink-0">
                        <button onClick={() => setPlusFor(cur => cur === gid ? null : gid)} title="Add to the plan"
                          className={`text-[15px] leading-none font-bold text-emerald-500 hover:text-emerald-700 px-0.5 ${plusFor === gid ? "" : "opacity-0 group-hover:opacity-100"}`}>＋</button>
                        {plusFor === gid && (
                          <span className="absolute right-0 top-6 z-20 bg-white border border-gray-200 rounded-xl shadow-lg p-1 flex flex-col min-w-[140px]">
                            {BUCKETS.map(bk => (
                              <button key={bk.key} onClick={() => addToQueue(gid, bk.key)}
                                className="text-left text-[12.5px] text-slate-600 hover:bg-gray-50 rounded-lg px-2.5 py-1.5 whitespace-nowrap">{bk.label}</button>
                            ))}
                          </span>
                        )}
                      </span>
                    )}
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-gray-400 mt-2">Flagged from the campaign calendar — untick &quot;🎨 Design required&quot; on the campaign card when the work is done.</p>
        </div>
      )}

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
                  <div key={b.brand} className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow" style={{ borderTop: `3px solid ${col}` }}>
                    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-50 rounded-t-[13px]" style={{ background: `${col}0D` }}>
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
