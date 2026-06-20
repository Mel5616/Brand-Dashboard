"use client";

import { useEffect, useState, useRef } from "react";
import type { Brand } from "@/lib/db";

type Row = { brand_id: number; name: string; boothRevenue: number; boothOrders: number; onlineRevenue: number; onlineOrders: number };
type LiveData = { live: boolean; boothTotal: number; boothOrders: number; showTotal: number; showOrders: number; rows: Row[]; updatedAt: string; show?: { state?: string } };

const aud = (n: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n);
const REFRESH_MS = 45000;

export function LiveShowPanel({ showId, brands }: { showId: string; brands: Brand[] }) {
  const [data, setData] = useState<LiveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [ago, setAgo] = useState(0);
  const colorOf = (id: number) => brands.find(b => b.id === id)?.color ?? "#6366f1";

  useEffect(() => {
    let alive = true;
    const load = () => fetch(`/api/live-show?showId=${showId}`)
      .then(r => r.json())
      .then((d: LiveData) => { if (alive) { setData(d); setLoading(false); setAgo(0); } })
      .catch(() => { if (alive) setLoading(false); });
    load();
    const iv = setInterval(load, REFRESH_MS);
    const tick = setInterval(() => setAgo(a => a + 1), 1000);
    return () => { alive = false; clearInterval(iv); clearInterval(tick); };
  }, [showId]);

  const maxRev = Math.max(1, ...(data?.rows ?? []).map(r => r.boothRevenue + r.onlineRevenue));

  return (
    <div className="rounded-xl overflow-hidden border border-emerald-200">
      {/* Live banner — both figures */}
      <div className="px-5 py-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-white">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span className="text-[11px] font-bold uppercase tracking-[0.2em]">Live · Show Day</span>
          </div>
          <p className="text-[10px] text-white/70">{loading ? "connecting…" : `updated ${ago}s ago · refreshes every ${REFRESH_MS / 1000}s`}</p>
        </div>
        <div className="flex items-end gap-8 mt-2 flex-wrap">
          <div>
            <p className="text-3xl font-bold tabular-nums">{loading ? "…" : aud(data?.boothTotal ?? 0)}</p>
            <p className="text-xs text-white/85">Booth sales · {data?.boothOrders ?? 0} orders</p>
            <p className="text-[10px] text-white/65">POS + Coolkidz till + QR</p>
          </div>
          <div className="opacity-90">
            <p className="text-2xl font-semibold tabular-nums">{loading ? "…" : aud(data?.showTotal ?? 0)}</p>
            <p className="text-xs text-white/85">Show-window total · {data?.showOrders ?? 0} orders</p>
            <p className="text-[10px] text-white/65">booth + online orders to {data?.show?.state ?? "state"}</p>
          </div>
        </div>
      </div>

      {/* Per-brand running totals (booth, with online shown alongside) */}
      <div className="bg-white px-5 py-4">
        {(!data || data.rows.length === 0) ? (
          <p className="text-sm text-gray-400 text-center py-4">
            {loading ? "Pulling live sales…" : "No sales through yet — they’ll appear here the moment the first order lands."}
          </p>
        ) : (
          <div className="space-y-2.5">
            {data.rows.map(r => (
              <div key={r.brand_id} className="flex items-center gap-3">
                <span className="text-xs text-slate-600 w-28 truncate flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: colorOf(r.brand_id) }} />
                  {r.name}
                </span>
                <div className="flex-1 h-5 bg-gray-50 rounded overflow-hidden flex">
                  <div className="h-full transition-all duration-700" style={{ width: `${Math.max(2, (r.boothRevenue / maxRev) * 100)}%`, background: colorOf(r.brand_id) }} title="Booth" />
                  {r.onlineRevenue > 0 && (
                    <div className="h-full transition-all duration-700 opacity-40" style={{ width: `${(r.onlineRevenue / maxRev) * 100}%`, background: colorOf(r.brand_id) }} title="Online (to state)" />
                  )}
                </div>
                <span className="text-xs font-bold text-slate-700 w-16 text-right tabular-nums">{aud(r.boothRevenue)}</span>
                <span className="text-[11px] text-gray-400 w-20 text-right">{r.onlineRevenue > 0 ? `+${aud(r.onlineRevenue)}` : ""}</span>
              </div>
            ))}
          </div>
        )}
        <p className="text-[10px] text-gray-400 mt-3">Solid = booth (POS + till + QR) · faded = online orders shipping to {data?.show?.state ?? "the state"} during the show.</p>
      </div>
    </div>
  );
}
