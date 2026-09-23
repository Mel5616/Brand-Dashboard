"use client";
import { useCallback, useEffect, useMemo, useState } from "react";

// Today: the one queue. Everything across the dashboard that needs a person
// — low reviews, pending moderation, flows waiting on Live, deliverability,
// send clashes, overdue content, open website requests, failed jobs — built
// live by /api/today, single column, phone first. Dismiss hides an item for
// the team until it changes; it comes back on its own if it does.
type Severity = "urgent" | "attention" | "info";
type Item = { key: string; severity: Severity; area: string; brand: string | null; brandId: number | null; colour: string | null; title: string; detail: string | null; tab: string | null; href: string | null; at: string | null };
type Job = { file: string; label: string; every: string; status: "ok" | "failed" | "stale" | "running" | "never" | "unknown"; lastRun: string | null; url: string | null };
const META: Record<Severity, { label: string; ring: string; chip: string; dot: string }> = {
  urgent: { label: "Urgent", ring: "border-rose-200", chip: "bg-rose-50 text-rose-700", dot: "bg-rose-500" },
  attention: { label: "Needs you", ring: "border-amber-200", chip: "bg-amber-50 text-amber-800", dot: "bg-amber-400" },
  info: { label: "For your info", ring: "border-slate-200", chip: "bg-slate-100 text-slate-600", dot: "bg-slate-400" },
};
const JOB_TONE: Record<Job["status"], string> = { ok: "bg-emerald-50 text-emerald-700 border-emerald-100", running: "bg-blue-50 text-blue-700 border-blue-100", failed: "bg-rose-50 text-rose-700 border-rose-200", stale: "bg-amber-50 text-amber-800 border-amber-200", never: "bg-slate-50 text-slate-500 border-slate-200", unknown: "bg-slate-50 text-slate-400 border-slate-200" };
const ago = (iso: string | null) => { if (!iso) return "never"; const h = (Date.now() - Date.parse(iso)) / 36e5; return h < 1 ? `${Math.max(1, Math.round(h * 60))} min ago` : h < 48 ? `${Math.round(h)} h ago` : `${Math.round(h / 24)} d ago`; };

export function TodayPanel({ onOpen, firstName }: { onOpen: (tab: string) => void; firstName?: string }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsSource, setJobsSource] = useState<"github" | "none">("none");
  const [needsSetup, setNeedsSetup] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [area, setArea] = useState<string>("all");
  const [showJobs, setShowJobs] = useState(false);
  const load = useCallback(() => fetch("/api/today").then(r => r.json()).then(j => { if (!j.ok) return; setItems(j.items || []); setJobs(j.jobs || []); setJobsSource(j.jobsSource || "none"); setNeedsSetup(!!j.needsSetup); setGeneratedAt(j.generatedAt || null); }).catch(() => setItems([])), []);
  useEffect(() => { load(); const t = setInterval(load, 5 * 60e3); return () => clearInterval(t); }, [load]);

  const dismiss = async (key: string) => {
    setItems(prev => (prev || []).filter(i => i.key !== key));
    const r = await fetch("/api/today", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }) }).then(x => x.json()).catch(() => ({ ok: false }));
    if (!r.ok) { setNeedsSetup(!!r.needsSetup); load(); }
  };
  const areas = useMemo(() => ["all", ...new Set((items || []).map(i => i.area))], [items]);
  const shown = useMemo(() => (items || []).filter(i => area === "all" || i.area === area), [items, area]);
  const counts = useMemo(() => ({ urgent: (items || []).filter(i => i.severity === "urgent").length, attention: (items || []).filter(i => i.severity === "attention").length, info: (items || []).filter(i => i.severity === "info").length }), [items]);
  const badJobs = jobs.filter(j => j.status === "failed" || j.status === "stale");
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-5">
        <h2 className="text-2xl font-bold text-slate-900">{greeting}{firstName ? `, ${firstName}` : ""}.</h2>
        <p className="text-sm text-slate-500 mt-1">
          {items === null ? "Checking everything…" : items.length === 0 ? "Nothing needs you right now." : <>{counts.urgent ? <span className="text-rose-700 font-semibold">{counts.urgent} urgent</span> : null}{counts.urgent && (counts.attention || counts.info) ? ", " : ""}{counts.attention ? <span className="text-amber-800 font-semibold">{counts.attention} need you</span> : null}{counts.attention && counts.info ? ", " : ""}{counts.info ? <span>{counts.info} for info</span> : null}.</>}
          {generatedAt && <span className="text-slate-400"> Checked {ago(generatedAt)}. Refreshes every 5 minutes; a digest lands in your inbox at 7am.</span>}
        </p>
      </div>

      {needsSetup && <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-4">Dismiss needs <code className="font-mono text-xs">supabase/add_today.sql</code> run in Supabase. Everything else here works without it.</p>}

      {/* Job health strip */}
      <div className="mb-5">
        <button onClick={() => setShowJobs(v => !v)} className="w-full flex items-center justify-between text-left">
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Jobs {badJobs.length ? <span className="text-rose-700">· {badJobs.length} need attention</span> : jobsSource === "github" ? <span className="text-emerald-700">· all running</span> : <span className="text-slate-400">· status unavailable</span>}</span>
          <span className="text-xs text-slate-400">{showJobs ? "Hide" : "Show"}</span>
        </button>
        {(showJobs || badJobs.length > 0) && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {(showJobs ? jobs : badJobs).map(j => (
              <a key={j.file} href={j.url || undefined} target="_blank" rel="noreferrer" title={`${j.label} · runs ${j.every} · last ${ago(j.lastRun)}`} className={`text-[11px] font-medium rounded-full border px-2.5 py-1 ${JOB_TONE[j.status]}`}>{j.label.split(" (")[0]} · {j.status === "ok" ? ago(j.lastRun) : j.status}</a>
            ))}
          </div>
        )}
      </div>

      {areas.length > 2 && (
        <div className="flex gap-1.5 mb-4 overflow-x-auto no-scrollbar">
          {areas.map(a => <button key={a} onClick={() => setArea(a)} className={`text-xs rounded-full px-3 py-1.5 border whitespace-nowrap ${area === a ? "bg-slate-800 text-white border-slate-800" : "text-slate-600 border-slate-200 bg-white"}`}>{a === "all" ? `All ${items?.length ?? ""}` : `${a} ${(items || []).filter(i => i.area === a).length}`}</button>)}
        </div>
      )}

      {items !== null && items.length === 0 && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 px-5 py-8 text-center">
          <p className="text-lg font-semibold text-emerald-800">All clear.</p>
          <p className="text-sm text-emerald-700 mt-1">No low reviews, nothing pending, no flows waiting, no clashes, jobs running. Come back after the next sync.</p>
        </div>
      )}

      {(["urgent", "attention", "info"] as Severity[]).map(s => {
        const rows = shown.filter(i => i.severity === s);
        if (!rows.length) return null;
        return (
          <section key={s} className="mb-6">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-2 flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${META[s].dot}`} />{META[s].label} · {rows.length}</h3>
            <div className="space-y-2">
              {rows.map(i => (
                <div key={i.key} className={`bg-white rounded-xl border ${META[s].ring} px-4 py-3`} style={i.colour ? { borderLeft: `4px solid ${i.colour}` } : undefined}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] text-slate-400">{i.brand ? `${i.brand} · ` : ""}{i.area}{i.at ? ` · ${new Date(i.at).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Melbourne" })}` : ""}</p>
                      <p className="text-sm font-semibold text-slate-900 mt-0.5">{i.title}</p>
                      {i.detail && <p className="text-[13px] text-slate-600 mt-1 leading-snug">{i.detail}</p>}
                    </div>
                    <button onClick={() => dismiss(i.key)} title="Hide until it changes" className="text-slate-300 hover:text-slate-500 shrink-0 text-lg leading-none -mt-1">×</button>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2.5">
                    {i.tab && <button onClick={() => onOpen(i.tab!)} className="text-xs font-medium rounded-lg px-3 py-1.5 bg-slate-800 text-white hover:bg-slate-900">Open {i.tab === "today" ? "job" : "tab"}</button>}
                    {i.href && <a href={i.href} target="_blank" rel="noreferrer" className="text-xs font-medium rounded-lg px-3 py-1.5 border border-slate-200 text-slate-700 hover:bg-slate-50">Open source ↗</a>}
                    <button onClick={() => dismiss(i.key)} className="text-xs text-slate-400 px-2 py-1.5 hover:text-slate-600">Dismiss</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
