"use client";

import { useState } from "react";
import { fmtFull } from "@/lib/format";
import type { Tradeshow, TradeshowSale, Brand } from "@/lib/db";

function showStatus(ts: Tradeshow): "live" | "upcoming" | "past" {
  const now = new Date();
  const start = new Date(ts.date_start);
  const end = new Date(ts.date_end);
  if (now >= start && now <= end) return "live";
  if (now < start) return "upcoming";
  return "past";
}

const STATUS_BADGE: Record<string, string> = {
  live:     "bg-green-100 text-green-700",
  upcoming: "bg-blue-100 text-blue-700",
  past:     "bg-gray-100 text-gray-500",
};

export function TradeshowAccordion({
  tradeshows, tradeshowBrands, tradeshowSales, brands,
}: {
  tradeshows: Tradeshow[];
  tradeshowBrands: { tradeshow_id: string; brand_id: number }[];
  tradeshowSales: TradeshowSale[];
  brands: Brand[];
}) {
  const sorted = [...tradeshows].sort((a, b) => a.date_start.localeCompare(b.date_start));

  // Auto-expand live + next upcoming
  const liveIds = new Set(sorted.filter(t => showStatus(t) === "live").map(t => t.id));
  const nextUpcoming = sorted.find(t => showStatus(t) === "upcoming");
  if (nextUpcoming) liveIds.add(nextUpcoming.id);

  const [open, setOpen] = useState<Set<string>>(liveIds);

  function toggle(id: string) {
    setOpen(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }

  function formatDate(d: string) {
    return new Date(d + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
      <h2 className="font-semibold text-gray-800 mb-4">Tradeshows & Expos</h2>
      <div className="space-y-2">
        {sorted.map(ts => {
          const status = showStatus(ts);
          const isOpen = open.has(ts.id);
          const tsId = ts.id;

          const participatingBrands = tradeshowBrands
            .filter(tb => tb.tradeshow_id === tsId)
            .map(tb => brands.find(b => b.id === tb.brand_id))
            .filter(Boolean) as Brand[];

          const sales = tradeshowSales.filter(s => s.tradeshow_id === tsId);
          const totalRev = sales.reduce((s, r) => s + (r.revenue ?? 0), 0);
          const totalOrders = sales.reduce((s, r) => s + (r.orders ?? 0), 0);

          return (
            <div key={tsId} className="border border-gray-100 rounded-lg overflow-hidden">
              <button
                onClick={() => toggle(tsId)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition"
              >
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${STATUS_BADGE[status]}`}>
                  {status === "live" ? "● Live" : status === "upcoming" ? "Upcoming" : "Past"}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-sm text-gray-800">{ts.name}</span>
                  <span className="text-xs text-gray-400 ml-2">{ts.location}</span>
                </div>
                <div className="text-xs text-gray-500 shrink-0 hidden sm:block">
                  {formatDate(ts.date_start)} – {formatDate(ts.date_end)}
                </div>
                {totalRev > 0 && (
                  <div className="text-sm font-semibold text-gray-800 shrink-0">
                    {fmtFull(totalRev)}
                    <span className="text-xs text-gray-400 font-normal ml-1">({totalOrders} orders)</span>
                  </div>
                )}
                <span className={`text-gray-400 transition-transform shrink-0 ${isOpen ? "rotate-90" : ""}`}>▶</span>
              </button>

              {isOpen && (
                <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
                  {sales.length === 0 ? (
                    <p className="text-xs text-gray-400">No sales data synced yet.</p>
                  ) : (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-gray-400">
                          <th className="text-left font-medium pb-1">Brand</th>
                          <th className="text-right font-medium pb-1">Revenue (ex-GST)</th>
                          <th className="text-right font-medium pb-1">Orders</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sales.sort((a, b) => b.revenue - a.revenue).map(sale => {
                          const brand = brands.find(b => b.id === sale.brand_id);
                          return (
                            <tr key={sale.brand_id} className="border-t border-gray-100">
                              <td className="py-1 flex items-center gap-1.5">
                                {brand && (
                                  <div className="w-4 h-4 rounded-full shrink-0" style={{ background: brand.color }} />
                                )}
                                {brand?.name ?? `Brand ${sale.brand_id}`}
                              </td>
                              <td className="text-right font-semibold text-gray-800">{fmtFull(sale.revenue)}</td>
                              <td className="text-right text-gray-600">{sale.orders}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-gray-200 font-semibold">
                          <td className="pt-1 text-gray-700">Total</td>
                          <td className="pt-1 text-right text-gray-800">{fmtFull(totalRev)}</td>
                          <td className="pt-1 text-right text-gray-700">{totalOrders}</td>
                        </tr>
                      </tfoot>
                    </table>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
