"use client";

import { useEffect, useMemo, useState } from "react";

// Command Centre — one screen that answers: what needs me today, which brands
// are off track, who's delivering. Phase 1+2 of command-page-build-brief.md:
// header strip, action queue, data freshness footer. Governing rule: nothing
// appears unless it's an exception — an empty queue is the win, not a blank
// state to apologise for.
//
// Five queue triggers: design requests + blogs + campaigns (the original
// three), plus metric_alerts (revenue drop / spend spike / ROAS collapse —
// already computed nightly, reused as-is) and genuinely failing syncs. This
// is meant to be the one place that catches everything worth knowing about,
// so scattered per-tab warnings don't need separate checking.

type QueueItem = { type: string; id: string; title: string; brand: string | null; owner: string | null; daysLate: number; href: string; detail?: string };
type Freshness = { source: string; ok: boolean; ran_at: string; message?: string };
type Data = {
  header: { revenueActual: number; revenueBudget: number; revenueVariancePct: number | null; spendActual: number; spendBudget: number; spendVariancePct: number | null; monthElapsedPct: number; daysRemaining: number; queueCount: number };
  queue: QueueItem[]; freshness: Freshness[]; needsSetup?: boolean;
};

const TYPE_META: Record<string, { label: string; verb: string }> = {
  design_request: { label: "Design request", verb: "overdue" },
  blog: { label: "Blog", verb: "overdue" },
  campaign: { label: "Campaign", verb: "launching" },
  metric_alert: { label: "Metric alert", verb: "flagged" },
  sync_failure: { label: "Data feed", verb: "failing" },
};

const money = (n: number) => n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${Math.round(n)}`;
const STALE_HOURS = 26;

function Collapsible({ id, title, count, children }: { id: string; title: string; count?: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    try { const raw = localStorage.getItem(`command.band.${id}`); if (raw != null) setOpen(raw === "1"); } catch { /* ignore */ }
  }, [id]);
  function toggle() {
    setOpen(v => { const next = !v; try { localStorage.setItem(`command.band.${id}`, next ? "1" : "0"); } catch { /* ignore */ } return next; });
  }
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button onClick={toggle} className="w-full flex items-center justify-between px-4 py-3 text-left">
        <span className="text-sm font-bold text-slate-800 flex items-center gap-2">
          {title}
          {count != null && count > 0 && <span className="text-[10.5px] font-bold rounded-full px-2 py-0.5 bg-rose-100 text-rose-600">{count}</span>}
        </span>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

function SnoozeRow({ item, onDone }: { item: QueueItem; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [resurface, setResurface] = useState(() => new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    if (!reason.trim()) { setErr("A reason is required."); return; }
    setBusy(true); setErr("");
    const d = await fetch("/api/command", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "snooze", item_type: item.type, item_id: item.id, reason, resurface_at: resurface }) }).then(r => r.json()).catch(() => null);
    setBusy(false);
    if (d?.ok) onDone(); else setErr(d?.error || "Couldn't snooze — try again.");
  }

  if (open) {
    return (
      <div className="flex flex-col gap-2 py-2.5 px-3 bg-slate-50 rounded-xl mt-1.5">
        <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Why snooze this? (required)" className="text-[13px] border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
        <div className="flex items-center gap-2">
          <input type="date" value={resurface} onChange={e => setResurface(e.target.value)} className="text-[13px] border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
          <button onClick={submit} disabled={busy} className="text-[12.5px] font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-3 py-1.5 disabled:opacity-50">{busy ? "…" : "Snooze"}</button>
          <button onClick={() => setOpen(false)} className="text-[12.5px] font-semibold text-slate-400 hover:text-slate-600">Cancel</button>
        </div>
        {err && <p className="text-[12px] text-rose-500">{err}</p>}
      </div>
    );
  }
  return <button onClick={() => setOpen(true)} className="text-[11.5px] font-semibold text-slate-400 hover:text-slate-600 shrink-0">Snooze</button>;
}

export function CommandCentre() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  function load() {
    fetch("/api/command").then(r => r.json()).then(d => {
      if (d?.ok) setData(d); else setErr(d?.error || "Couldn't load the command view.");
    }).catch(() => setErr("Couldn't load the command view.")).finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  const staleFeeds = useMemo(() => (data?.freshness ?? []).filter(f => !f.ok || Date.now() - Date.parse(f.ran_at) > STALE_HOURS * 3.6e6), [data]);

  if (loading) return <div className="min-h-screen grid place-items-center text-sm text-gray-400">Loading…</div>;
  if (err) return <div className="min-h-screen grid place-items-center text-sm text-rose-500">{err}</div>;
  if (data?.needsSetup) {
    return <div className="min-h-screen grid place-items-center bg-slate-50 p-6 text-center text-sm text-gray-500">
      Run <code className="bg-white border border-gray-200 px-1.5 py-0.5 rounded">supabase/add_command_center.sql</code> to enable the Command Centre.
    </div>;
  }
  if (!data) return null;
  const h = data.header;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b-2 border-slate-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 h-[60px] flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logos/Coolkidz Logo.png" alt="Coolkidz Australia" className="h-6 w-auto" />
            <span className="text-[15px] font-bold text-slate-800">Command</span>
          </div>
          <a href="/" className="text-[12.5px] font-semibold text-slate-500 hover:text-slate-700">Full dashboard →</a>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-3">
        {staleFeeds.length > 0 && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5 text-[13px] text-amber-800 font-semibold">
            ⚠ {staleFeeds.length} data feed{staleFeeds.length === 1 ? "" : "s"} stale or failing — numbers below may be out of date. See freshness at the bottom.
          </div>
        )}

        {/* Band 1: Header strip */}
        <div className="grid grid-cols-2 gap-3">
          <a href="/?tab=sales-budget" className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:border-emerald-200 transition">
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Revenue vs budget MTD</p>
            <p className="text-xl font-extrabold text-slate-800 mt-1">{money(h.revenueActual)}</p>
            <p className={`text-[12px] font-semibold mt-0.5 ${h.revenueVariancePct == null ? "text-gray-300" : h.revenueVariancePct >= 0 ? "text-emerald-600" : "text-rose-500"}`}>
              {h.revenueVariancePct == null ? "no budget set" : `${h.revenueVariancePct >= 0 ? "+" : ""}${h.revenueVariancePct}% vs ${money(h.revenueBudget)}`}
            </p>
          </a>
          <a href="/?tab=budget" className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:border-emerald-200 transition">
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Spend vs budget MTD</p>
            <p className="text-xl font-extrabold text-slate-800 mt-1">{money(h.spendActual)}</p>
            <p className={`text-[12px] font-semibold mt-0.5 ${h.spendVariancePct == null ? "text-gray-300" : h.spendVariancePct <= 0 ? "text-emerald-600" : "text-amber-600"}`}>
              {h.spendVariancePct == null ? "no budget set" : `${h.spendVariancePct >= 0 ? "+" : ""}${h.spendVariancePct}% · ${h.monthElapsedPct}% of month elapsed`}
            </p>
          </a>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Days remaining</p>
            <p className="text-xl font-extrabold text-slate-800 mt-1">{h.daysRemaining}</p>
            <p className="text-[12px] text-gray-400 mt-0.5">in the month</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Needs you</p>
            <p className={`text-xl font-extrabold mt-1 ${h.queueCount > 0 ? "text-rose-600" : "text-emerald-600"}`}>{h.queueCount}</p>
            <p className="text-[12px] text-gray-400 mt-0.5">{h.queueCount === 0 ? "all clear" : "open items"}</p>
          </div>
        </div>

        {/* Band 2: Needs you today */}
        <Collapsible id="queue" title="Needs you today" count={data.queue.length}>
          {data.queue.length === 0 ? (
            <p className="text-sm text-emerald-600 font-semibold py-3">🎉 Nothing needs you right now.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {data.queue.map(item => (
                <div key={`${item.type}:${item.id}`} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800 truncate">{item.title}</p>
                    <p className="text-[12px] text-gray-400 truncate">
                      {TYPE_META[item.type]?.label ?? item.type}
                      {item.brand ? ` · ${item.brand}` : ""}
                      {item.owner ? ` · ${item.owner}` : ""}
                      {" · "}
                      <span className={item.daysLate >= 0 ? "text-rose-500 font-semibold" : "text-amber-600 font-semibold"}>
                        {item.daysLate >= 0 ? `${item.daysLate}d ${TYPE_META[item.type]?.verb ?? "late"}` : `in ${-item.daysLate}d`}
                      </span>
                    </p>
                    {item.detail && <p className="text-[11.5px] text-gray-400 truncate mt-0.5">{item.detail}</p>}
                  </div>
                  <SnoozeRow item={item} onDone={load} />
                  <a href={item.href} className="text-gray-300 hover:text-emerald-600 shrink-0">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </a>
                </div>
              ))}
            </div>
          )}
        </Collapsible>

        {/* Band 6: Data freshness footer */}
        <Collapsible id="freshness" title="Data freshness">
          <div className="space-y-1.5">
            {data.freshness.map(f => {
              const stale = !f.ok || Date.now() - Date.parse(f.ran_at) > STALE_HOURS * 3.6e6;
              return (
                <div key={f.source} className="flex items-center justify-between text-[12.5px] py-1">
                  <span className="flex items-center gap-2 text-slate-600">
                    <span className={`w-1.5 h-1.5 rounded-full ${stale ? "bg-amber-500" : "bg-emerald-500"}`} />
                    {f.source}
                  </span>
                  <span className="text-gray-400">{new Date(f.ran_at).toLocaleString("en-AU", { timeZone: "Australia/Melbourne", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
                </div>
              );
            })}
          </div>
        </Collapsible>

        <p className="text-[11px] text-gray-400 text-center pt-2">Brand grid, team view and the weekly trend aren&apos;t built yet — this is phases 1–2 only.</p>
      </div>
    </div>
  );
}
