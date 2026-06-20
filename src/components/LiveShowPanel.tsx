"use client";

import { useEffect, useState, useRef } from "react";
import type { Brand } from "@/lib/db";

type Row = { brand_id: number; name: string; revenue: number; orders: number };
type LiveData = { live: boolean; total: number; totalOrders: number; rows: Row[]; updatedAt: string };

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

  const maxRev = Math.max(1, ...(data?.rows ?? []).map(r => r.revenue));

  return (
    <div className="rounded-xl overflow-hidden border border-emerald-200">
      {/* Live banner */}
      <div className="px-5 py-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-white flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span className="text-[11px] font-bold uppercase tracking-[0.2em]">Live · Show Day</span>
          </div>
          <p className="text-3xl font-bold mt-1 tabular-nums">{loading ? "…" : aud(data?.total ?? 0)}</p>
          <p className="text-xs text-white/80">{data?.totalOrders ?? 0} orders so far · ex-GST</p>
        </div>
        <p className="text-[10px] text-white/70">
          {loading ? "connecting…" : `updated ${ago}s ago · refreshes every ${REFRESH_MS / 1000}s`}
        </p>
      </div>

      {/* Per-brand running totals */}
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
                <div className="flex-1 h-5 bg-gray-50 rounded overflow-hidden">
                  <div className="h-full rounded transition-all duration-700" style={{ width: `${Math.max(4, (r.revenue / maxRev) * 100)}%`, background: colorOf(r.brand_id) }} />
                </div>
                <span className="text-xs font-bold text-slate-700 w-16 text-right tabular-nums">{aud(r.revenue)}</span>
                <span className="text-[11px] text-gray-400 w-10 text-right">{r.orders}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
