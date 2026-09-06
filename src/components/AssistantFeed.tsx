"use client";

import { useEffect, useMemo, useState } from "react";

type Row = { id: number; created_at: string; brand: string; session: string | null; page: string | null; question: string; answer: string; handoff: boolean; flagged: boolean; note: string | null };

const BRANDS: { id: string; label: string; site: string; color: string }[] = [
  { id: "zazu", label: "Zazu · Ask Davy", site: "zazu-kids.com.au", color: "bg-red-100 text-red-700" },
  { id: "frida", label: "Frida · Ask Frida", site: "fridaaustralia.com.au", color: "bg-sky-100 text-sky-700" },
];
const when = (s: string) => new Date(s).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" });
const STOP = new Set("the a an and or to of in on for is it my me i do does can how what when where which with your you are be will this that about there from have has not no yes at as if any".split(" "));

export function AssistantFeed({ admin }: { admin: boolean }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [brand, setBrand] = useState("");
  const [q, setQ] = useState("");
  const [days, setDays] = useState(30);
  const [onlyHandoff, setOnlyHandoff] = useState(false);
  const [open, setOpen] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    const qs = new URLSearchParams({ days: String(days) });
    if (brand) qs.set("brand", brand);
    if (q) qs.set("q", q);
    const r = await fetch(`/api/assistant-logs?${qs}`).then(x => x.json()).catch(() => ({ ok: false }));
    setLoading(false);
    if (!r.ok || r.needsSetup) { setNeedsSetup(true); return; }
    setNeedsSetup(false); setRows(r.rows);
  }
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [brand, q, days]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => onlyHandoff ? rows.filter(r => r.handoff) : rows, [rows, onlyHandoff]);

  // Group by session so a back-and-forth reads as one conversation.
  const convos = useMemo(() => {
    const map = new Map<string, Row[]>();
    shown.forEach(r => { const k = `${r.brand}:${r.session || r.id}`; (map.get(k) || map.set(k, []).get(k)!).push(r); });
    return Array.from(map.values()).map(list => list.sort((a, b) => a.created_at.localeCompare(b.created_at))).sort((a, b) => b[b.length - 1].created_at.localeCompare(a[a.length - 1].created_at));
  }, [shown]);

  const stats = useMemo(() => {
    const day = Date.now() - 86400000, week = Date.now() - 7 * 86400000;
    const per = (b: string) => rows.filter(r => r.brand === b);
    return {
      today: rows.filter(r => new Date(r.created_at).getTime() > day).length,
      week: rows.filter(r => new Date(r.created_at).getTime() > week).length,
      handoff: rows.filter(r => r.handoff).length,
      byBrand: BRANDS.map(b => ({ ...b, n: per(b.id).length, conv: new Set(per(b.id).map(r => r.session || r.id)).size })),
    };
  }, [rows]);

  const topics = useMemo(() => {
    const count = new Map<string, number>();
    rows.forEach(r => { const seen = new Set<string>(); r.question.toLowerCase().replace(/[^a-z0-9' ]/g, " ").split(/\s+/).filter(w => w.length > 3 && !STOP.has(w)).forEach(w => { if (!seen.has(w)) { seen.add(w); count.set(w, (count.get(w) || 0) + 1); } }); });
    return Array.from(count.entries()).sort((a, b) => b[1] - a[1]).slice(0, 14);
  }, [rows]);

  async function patch(id: number, body: Partial<Row>) {
    setRows(rs => rs.map(r => r.id === id ? { ...r, ...body } : r));
    await fetch("/api/assistant-logs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...body }) });
  }

  if (needsSetup) return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
      <p className="font-semibold">The shared assistant log table is not set up yet.</p>
      <p className="mt-1">Run <code className="rounded bg-white px-1">supabase/assistant_logs.sql</code> in the Supabase SQL editor. It creates <code className="rounded bg-white px-1">assistant_logs</code> and copies the existing Ask Davy history across.</p>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Questions today" value={stats.today} />
        <Stat label="Questions, 7 days" value={stats.week} />
        <Stat label={`Questions, ${days} days`} value={rows.length} />
        <Stat label="Handed to a human or HP" value={stats.handoff} hint="Answers that pointed to the contact page or a health professional" />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {stats.byBrand.map(b => (
          <div key={b.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${b.color}`}>{b.label}</span><span className="text-xs text-slate-500">{b.site}</span></div>
            <div className="mt-3 flex gap-6 text-sm"><span><strong className="text-lg">{b.conv}</strong> <span className="text-slate-500">conversations</span></span><span><strong className="text-lg">{b.n}</strong> <span className="text-slate-500">questions</span></span></div>
          </div>
        ))}
      </div>
      {topics.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">What people ask about</p>
          <div className="mt-2 flex flex-wrap gap-2">{topics.map(([w, n]) => <button key={w} type="button" onClick={() => setQ(w)} className="rounded-full border border-slate-200 px-3 py-1 text-xs hover:bg-slate-50">{w} <span className="text-slate-400">{n}</span></button>)}</div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
          {[{ id: "", label: "All" }, ...BRANDS.map(b => ({ id: b.id, label: b.label.split(" · ")[0] }))].map(b => (
            <button key={b.id} type="button" onClick={() => setBrand(b.id)} className={`rounded-md px-3 py-1.5 ${brand === b.id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{b.label}</button>
          ))}
        </div>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search questions and answers" className="h-9 min-w-[240px] flex-1 rounded-lg border border-slate-200 px-3 text-sm" />
        <select value={days} onChange={e => setDays(Number(e.target.value))} className="h-9 rounded-lg border border-slate-200 px-2 text-sm">{[7, 30, 90, 365].map(d => <option key={d} value={d}>Last {d} days</option>)}</select>
        <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={onlyHandoff} onChange={e => setOnlyHandoff(e.target.checked)} /> Hand-offs only</label>
        <button type="button" onClick={load} className="h-9 rounded-lg border border-slate-200 px-3 text-sm hover:bg-slate-50">Refresh</button>
      </div>
      {loading && <p className="text-sm text-slate-500">Loading…</p>}
      {!loading && convos.length === 0 && <p className="text-sm text-slate-500">No conversations yet for this filter.</p>}
      <div className="space-y-3">
        {convos.map(list => {
          const first = list[0], last = list[list.length - 1]; const b = BRANDS.find(x => x.id === first.brand);
          const isOpen = open === first.id;
          return (
            <div key={first.id} className={`rounded-xl border bg-white ${list.some(r => r.flagged) ? "border-amber-300" : "border-slate-200"}`}>
              <button type="button" onClick={() => setOpen(isOpen ? null : first.id)} className="flex w-full items-start gap-3 p-4 text-left">
                <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${b?.color || "bg-slate-100 text-slate-600"}`}>{first.brand}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900">{first.question}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{when(last.created_at)} · {list.length} {list.length === 1 ? "question" : "questions"}{first.page ? ` · ${first.page}` : ""}{list.some(r => r.handoff) ? " · handed off" : ""}</span>
                </span>
                <span className="text-slate-400">{isOpen ? "−" : "+"}</span>
              </button>
              {isOpen && (
                <div className="space-y-4 border-t border-slate-100 p-4">
                  {list.map(r => (
                    <div key={r.id} className="space-y-2">
                      <p className="rounded-2xl rounded-br-md bg-slate-900 px-3 py-2 text-sm text-white">{r.question}</p>
                      <p className="whitespace-pre-wrap rounded-2xl rounded-bl-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">{r.answer}</p>
                      {admin && (
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <button type="button" onClick={() => patch(r.id, { flagged: !r.flagged })} className={`rounded-md border px-2 py-1 ${r.flagged ? "border-amber-300 bg-amber-50 text-amber-800" : "border-slate-200 text-slate-600"}`}>{r.flagged ? "Flagged for review" : "Flag answer"}</button>
                          <input defaultValue={r.note || ""} onBlur={e => { if (e.target.value !== (r.note || "")) patch(r.id, { note: e.target.value }); }} placeholder="Note: what to fix in the knowledge file" className="h-7 min-w-[260px] flex-1 rounded-md border border-slate-200 px-2" />
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
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4" title={hint}><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-900">{value}</p></div>;
}
