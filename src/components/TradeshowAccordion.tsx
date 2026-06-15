"use client";

import { useState } from "react";
import { fmtFull } from "@/lib/format";
import type { Tradeshow, TradeshowSale, Brand } from "@/lib/db";

function showStatus(ts: Tradeshow): "live" | "upcoming" | "past" {
  const now = new Date();
  const start = new Date(ts.date_start + "T00:00:00");
  const end = new Date(ts.date_end + "T23:59:59");
  if (now >= start && now <= end) return "live";
  if (now < start) return "upcoming";
  return "past";
}

const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

export function TradeshowAccordion({
  tradeshows, tradeshowBrands, tradeshowSales, brands,
}: {
  tradeshows: Tradeshow[];
  tradeshowBrands: { tradeshow_id: string; brand_id: number }[];
  tradeshowSales: TradeshowSale[];
  brands: Brand[];
}) {
  const sorted = [...tradeshows].sort((a, b) => a.date_start.localeCompare(b.date_start));

  const upcoming = sorted.filter(t => showStatus(t) !== "past");          // live + upcoming, soonest first
  const past     = sorted.filter(t => showStatus(t) === "past").reverse(); // most recent first

  // Auto-expand live + next upcoming
  const liveIds = new Set(upcoming.filter(t => showStatus(t) === "live").map(t => t.id));
  if (upcoming.find(t => showStatus(t) === "upcoming")) {
    liveIds.add(upcoming.find(t => showStatus(t) === "upcoming")!.id);
  }
  const [open, setOpen] = useState<Set<string>>(liveIds);

  function toggle(id: string) {
    setOpen(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ── Summary ──────────────────────────────────────────────────────────
  const totalRevAll = tradeshowSales.reduce((s, r) => s + (r.revenue ?? 0), 0);
  const liveCount   = sorted.filter(t => showStatus(t) === "live").length;

  function dateRange(ts: Tradeshow) {
    const s = new Date(ts.date_start + "T00:00:00");
    const e = new Date(ts.date_end + "T00:00:00");
    const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
    if (ts.date_start === ts.date_end) return `${s.toLocaleDateString("en-AU", opts)} ${s.getFullYear()}`;
    if (s.getMonth() === e.getMonth())
      return `${s.getDate()}–${e.getDate()} ${MONTHS[s.getMonth()].charAt(0) + MONTHS[s.getMonth()].slice(1).toLowerCase()} ${s.getFullYear()}`;
    return `${s.toLocaleDateString("en-AU", opts)} – ${e.toLocaleDateString("en-AU", opts)} ${e.getFullYear()}`;
  }

  function ShowCard({ ts }: { ts: Tradeshow }) {
    const status = showStatus(ts);
    const isOpen = open.has(ts.id);
    const start  = new Date(ts.date_start + "T00:00:00");

    const participating = tradeshowBrands
      .filter(tb => tb.tradeshow_id === ts.id)
      .map(tb => brands.find(b => b.id === tb.brand_id))
      .filter(Boolean) as Brand[];

    const sales       = tradeshowSales.filter(s => s.tradeshow_id === ts.id);
    const totalRev    = sales.reduce((s, r) => s + (r.revenue ?? 0), 0);
    const totalOrders = sales.reduce((s, r) => s + (r.orders ?? 0), 0);

    const accent = status === "live" ? "#10b981" : status === "upcoming" ? "#6366f1" : "#94a3b8";

    return (
      <div className={`rounded-xl border overflow-hidden transition-shadow ${isOpen ? "border-gray-200 shadow-sm" : "border-gray-100"} ${status === "past" ? "opacity-80" : ""}`}>
        <button onClick={() => toggle(ts.id)} className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-gray-50/70 transition-colors">
          {/* Calendar chip */}
          <div className="flex flex-col items-center justify-center w-12 h-12 rounded-lg flex-shrink-0 border" style={{ borderColor: `${accent}33`, background: `${accent}0d` }}>
            <span className="text-[9px] font-bold tracking-wider" style={{ color: accent }}>{MONTHS[start.getMonth()]}</span>
            <span className="text-lg font-bold leading-none text-slate-700">{start.getDate()}</span>
          </div>

          {/* Name + meta */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-slate-800 truncate">{ts.name}</span>
              {status === "live" && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 flex-shrink-0">● LIVE</span>}
            </div>
            <p className="text-xs text-gray-400 mt-0.5 truncate">{dateRange(ts)}{ts.location ? ` · ${ts.location}` : ""}</p>
            {participating.length > 0 && (
              <div className="flex items-center gap-1 mt-1.5">
                {participating.slice(0, 8).map(b => (
                  <span key={b.id} className="w-2 h-2 rounded-full" style={{ background: b.color }} title={b.name} />
                ))}
                {participating.length > 8 && <span className="text-[10px] text-gray-400 ml-0.5">+{participating.length - 8}</span>}
              </div>
            )}
          </div>

          {/* Revenue */}
          <div className="text-right flex-shrink-0">
            {totalRev > 0 ? (
              <>
                <p className="text-sm font-bold text-slate-800">{fmtFull(totalRev)}</p>
                <p className="text-[11px] text-gray-400">{totalOrders} orders</p>
              </>
            ) : (
              <p className="text-[11px] text-gray-300">{status === "upcoming" ? "Not started" : "No sales"}</p>
            )}
          </div>

          <svg className={`w-4 h-4 text-gray-300 flex-shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isOpen && (
          <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/60">
            {sales.length === 0 ? (
              <p className="text-xs text-gray-400 py-2 text-center">No sales data synced yet.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-400">
                    <th className="text-left font-semibold uppercase tracking-wide text-[10px] pb-2">Brand</th>
                    <th className="text-right font-semibold uppercase tracking-wide text-[10px] pb-2">Revenue (ex-GST)</th>
                    <th className="text-right font-semibold uppercase tracking-wide text-[10px] pb-2">Orders</th>
                  </tr>
                </thead>
                <tbody>
                  {[...sales].sort((a, b) => b.revenue - a.revenue).map(sale => {
                    const brand = brands.find(b => b.id === sale.brand_id);
                    return (
                      <tr key={sale.brand_id} className="border-t border-gray-100">
                        <td className="py-1.5 flex items-center gap-2">
                          {brand && <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: brand.color }} />}
                          <span className="text-slate-600">{brand?.name ?? `Brand ${sale.brand_id}`}</span>
                        </td>
                        <td className="text-right font-semibold text-slate-800">{fmtFull(sale.revenue)}</td>
                        <td className="text-right text-gray-500">{sale.orders}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 font-bold">
                    <td className="pt-2 text-gray-600">Total</td>
                    <td className="pt-2 text-right text-slate-800">{fmtFull(totalRev)}</td>
                    <td className="pt-2 text-right text-gray-600">{totalOrders}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Upcoming", value: upcoming.length.toString(), sub: liveCount > 0 ? `${liveCount} live now` : "shows scheduled" },
          { label: "Completed", value: past.length.toString(), sub: "this FY" },
          { label: "Tradeshow Revenue", value: fmtFull(totalRevAll), sub: "ex-GST, all shows" },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">{s.label}</p>
            <p className="text-xl font-bold text-slate-800 mt-1">{s.value}</p>
            <p className="text-[11px] text-gray-400">{s.sub}</p>
          </div>
        ))}
      </div>

      {upcoming.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 px-1">Upcoming & Live</h3>
          <div className="space-y-2">{upcoming.map(ts => <ShowCard key={ts.id} ts={ts} />)}</div>
        </div>
      )}

      {past.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Past Shows</h3>
          <div className="space-y-2">{past.map(ts => <ShowCard key={ts.id} ts={ts} />)}</div>
        </div>
      )}

      {sorted.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center text-sm text-gray-400">
          No tradeshows configured yet.
        </div>
      )}
    </div>
  );
}
