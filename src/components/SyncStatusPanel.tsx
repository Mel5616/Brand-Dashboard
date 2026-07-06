"use client";

import { useEffect, useState } from "react";

// Admin data-freshness panel: per-source OK / stale / failed, so you can trust
// every number is current. Fetched on demand from /api/sync-status.
type Row = { source: string; ok: boolean; message: string; ran_at: string };
const STALE_HOURS = 26;

function ago(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!isFinite(ms)) return "";
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function SyncStatusPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "needsSetup" | "error">("loading");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/sync-status", { cache: "no-store" }).then(r => r.json())
      .then(d => { if (d.needsSetup) setState("needsSetup"); else if (d.ok) { setRows(d.rows ?? []); setState("ready"); } else setState("error"); })
      .catch(() => setState("error"));
  }, []);

  if (state === "loading" || state === "needsSetup" || state === "error") return null;
  if (rows.length === 0) return null;

  const status = (r: Row): "ok" | "stale" | "failed" =>
    !r.ok ? "failed" : (Date.now() - Date.parse(r.ran_at) > STALE_HOURS * 3.6e6 ? "stale" : "ok");
  const scored = rows.map(r => ({ ...r, s: status(r) }));
  const failed = scored.filter(r => r.s === "failed");
  const stale = scored.filter(r => r.s === "stale");
  const bad = failed.length + stale.length;
  const dot = { ok: "#10b981", stale: "#f59e0b", failed: "#ef4444" } as const;

  return (
    <div className={`rounded-2xl border px-4 py-3 mb-4 ${bad ? "bg-amber-50/40 border-amber-100" : "bg-white border-gray-100"}`}>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 flex items-center gap-2">
          Data freshness
          {bad === 0
            ? <span className="text-emerald-600 normal-case tracking-normal font-medium">· all {rows.length} feeds current</span>
            : <span className="text-amber-600 normal-case tracking-normal font-medium">· {failed.length ? `${failed.length} failed` : ""}{failed.length && stale.length ? ", " : ""}{stale.length ? `${stale.length} stale` : ""}</span>}
        </p>
        <div className="flex items-center gap-2">
          {/* health dots strip */}
          <div className="flex items-center gap-0.5">
            {scored.map(r => <span key={r.source} className="w-1.5 h-1.5 rounded-full" style={{ background: dot[r.s] }} title={`${r.source}: ${r.s}`} />)}
          </div>
          <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
        </div>
      </button>
      {(open || bad > 0) && (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {scored.sort((a, b) => (a.s === "ok" ? 1 : 0) - (b.s === "ok" ? 1 : 0) || a.source.localeCompare(b.source)).map(r => (
            <div key={r.source} className="flex items-start gap-2 rounded-lg bg-white/70 border border-gray-100 px-2.5 py-1.5">
              <span className="w-2 h-2 rounded-full mt-1 shrink-0" style={{ background: dot[r.s] }} />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-700 truncate">{r.source}</p>
                <p className="text-[10px] text-gray-400">{r.s === "failed" ? "failed" : ago(r.ran_at)}</p>
                {r.s === "failed" && r.message && <p className="text-[10px] text-rose-500 truncate" title={r.message}>{r.message}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
