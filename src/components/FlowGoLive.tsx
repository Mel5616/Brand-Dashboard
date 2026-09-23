"use client";
import { useEffect, useMemo, useState } from "react";

// Go-live checklist (Email → Flows, top): every Klaviyo flow still in draft
// or manual across the portfolio, with the edit link. Built flows that are
// waiting on a click shouldn't hide inside a 13-account grid.
type Row = { brand_id: number; flow_id: string; name: string; status: string | null; trigger_type: string | null; synced_at: string };
type Brand = { id: number; name: string; color?: string };
const editUrl = (id: string) => `https://www.klaviyo.com/flow/${id}/edit`;

export function FlowGoLive({ brands }: { brands: Brand[] }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [done, setDone] = useState<Set<string>>(() => { try { return new Set(typeof window === "undefined" ? [] : JSON.parse(localStorage.getItem("flowGoLive.done") || "[]")); } catch { return new Set(); } });
  const [showManual, setShowManual] = useState(false);
  useEffect(() => {
    fetch("/api/klaviyo/flows").then(r => r.json()).then(j => { if (j.ok) { setRows(j.items || []); setNeedsSetup(!!j.needsSetup); } }).catch(() => {});
  }, []);
  const name = useMemo(() => new Map(brands.map(b => [b.id, b])), [brands]);
  const drafts = rows.filter(r => (r.status || "").toLowerCase() === "draft");
  const manual = rows.filter(r => (r.status || "").toLowerCase() === "manual");
  const live = rows.filter(r => (r.status || "").toLowerCase() === "live").length;
  const shown = [...drafts, ...(showManual ? manual : [])].sort((a, b) => (name.get(a.brand_id)?.name || "").localeCompare(name.get(b.brand_id)?.name || "") || a.name.localeCompare(b.name));
  const toggle = (id: string) => { const n = new Set(done); n.has(id) ? n.delete(id) : n.add(id); setDone(n); try { localStorage.setItem("flowGoLive.done", JSON.stringify([...n])); } catch { /* ignore */ } };

  if (needsSetup) return <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">The go-live checklist needs <code className="text-xs bg-white px-1 py-0.5 rounded">supabase/add_reviews_email_upgrade.sql</code> run in Supabase, then it fills from the next Klaviyo sync.</div>;
  if (!rows.length) return null;

  return (
    <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Ready to go live</h2>
          <p className="text-[12.5px] text-gray-400 mt-1">{drafts.length} draft flow{drafts.length === 1 ? "" : "s"} across {new Set(drafts.map(d => d.brand_id)).size} brands · {live} live · {manual.length} manual. Open each in Klaviyo, check the emails, press Live, tick it here.</p>
        </div>
        <label className="text-xs text-slate-500 flex items-center gap-1.5"><input type="checkbox" checked={showManual} onChange={e => setShowManual(e.target.checked)} /> Include manual flows</label>
      </div>
      {shown.length === 0 ? <p className="text-sm text-emerald-700">Every built flow is live.</p> : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2">
          {shown.map(r => {
            const b = name.get(r.brand_id); const tick = done.has(r.flow_id);
            return (
              <div key={r.flow_id} className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 ${tick ? "border-emerald-200 bg-emerald-50/50" : "border-slate-200"}`}>
                <input type="checkbox" checked={tick} onChange={() => toggle(r.flow_id)} title="Tick once it's live in Klaviyo (clears on the next sync if it really is)" />
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: b?.color || "#94a3b8" }} />
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm truncate ${tick ? "line-through text-slate-400" : "text-slate-800"}`}>{r.name}</span>
                  <span className="block text-[11px] text-slate-400">{b?.name || r.brand_id} · {r.status}{r.trigger_type ? ` · ${r.trigger_type.replace(/_/g, " ").toLowerCase()}` : ""}</span>
                </span>
                <a href={editUrl(r.flow_id)} target="_blank" rel="noreferrer" className="text-xs font-medium text-emerald-700 hover:underline shrink-0">Open ↗</a>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
