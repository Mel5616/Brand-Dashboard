"use client";

import React from "react";
import { fmtFull } from "@/lib/format";

// Operations > Cost Sheet — live pull from the SharePoint "CK Australia -
// Cost Sheet" workbook (one worksheet per brand) via Microsoft Graph. This
// page is read-only; the sheet itself is the source of truth.

type Item = {
  brand: string; category: string | null; product_name: string; style_code: string | null;
  fob_usd: number | null; fob_aud: number | null; landed_cost_aud: number | null;
  retail_incl_gst: number | null; retail_excl_gst: number | null;
  wholesale_excl_gst: number | null; bunting_excl_gst: number | null;
  margin_independents_pct: number | null; margin_bunting_pct: number | null;
  retail_margin_pct: number | null; bunting_margin_pct: number | null;
  direct_margin_pct: number | null; nz_margin_pct: number | null;
};
type Meta = { brand: string; exchange_rate: number | null; freight_rate: number | null; updated_label: string | null; synced_at: string };

const pct = (v: number | null) => v == null ? "—" : `${Math.round(v * 100)}%`;
const marginCls = (v: number | null) => v == null ? "text-gray-300"
  : v < 0.15 ? "text-rose-600 bg-rose-50" : v < 0.30 ? "text-amber-600 bg-amber-50" : "text-emerald-600 bg-emerald-50";

export function CostSheet() {
  const [items, setItems] = React.useState<Item[]>([]);
  const [meta, setMeta] = React.useState<Meta[]>([]);
  const [needsSetup, setNeedsSetup] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  const [brand, setBrand] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");
  const [sortBy, setSortBy] = React.useState<"name" | "retail_margin_pct" | "bunting_margin_pct" | "landed_cost_aud">("name");

  React.useEffect(() => {
    fetch("/api/cost-sheet").then(r => r.json()).then(d => {
      setItems(d.items ?? []); setMeta(d.meta ?? []); setNeedsSetup(!!d.needsSetup); setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const brands = React.useMemo(() => [...new Set(items.map(i => i.brand))].sort(), [items]);
  React.useEffect(() => { if (!brand && brands.length) setBrand(brands[0]); }, [brands, brand]);

  if (!loaded) return <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">Loading…</div>;
  if (needsSetup) return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-500">
      Run <code className="bg-gray-100 px-1 rounded">supabase/add_cost_sheet.sql</code>, then the cost-sheet sync fills this in.
    </div>
  );
  if (!items.length) return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">
      No cost sheet data yet — run <code className="bg-gray-100 px-1 rounded">scripts/sync_cost_sheet.py</code> (or wait for the next scheduled sync).
    </div>
  );

  const brandItems = items.filter(i => i.brand === brand && (!q || i.product_name.toLowerCase().includes(q.toLowerCase()) || (i.style_code ?? "").toLowerCase().includes(q.toLowerCase())));
  const sorted = [...brandItems].sort((a, b) => {
    if (sortBy === "name") return a.product_name.localeCompare(b.product_name);
    const av = a[sortBy] ?? (sortBy === "landed_cost_aud" ? Infinity : -Infinity);
    const bv = b[sortBy] ?? (sortBy === "landed_cost_aud" ? Infinity : -Infinity);
    return sortBy === "landed_cost_aud" ? (av as number) - (bv as number) : (bv as number) - (av as number);
  });
  const m = meta.find(x => x.brand === brand);
  const withMargin = brandItems.filter(i => i.retail_margin_pct != null);
  const avgRetailMargin = withMargin.length ? withMargin.reduce((s, i) => s + (i.retail_margin_pct ?? 0), 0) / withMargin.length : null;
  const lowest = withMargin.length ? [...withMargin].sort((a, b) => (a.retail_margin_pct ?? 0) - (b.retail_margin_pct ?? 0))[0] : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {brands.map(b => (
            <button key={b} onClick={() => setBrand(b)}
              className={`text-[12.5px] font-semibold rounded-full px-3 py-1.5 transition ${b === brand ? "bg-slate-800 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
              {b} <span className="opacity-60">({items.filter(i => i.brand === b).length})</span>
            </button>
          ))}
        </div>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search product or style code…"
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-300 w-64" />
      </div>

      {brand && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
            <div>
              <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">{brand} · Cost Sheet</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Live from SharePoint{m?.updated_label ? ` · sheet says "${m.updated_label}"` : ""}
                {m?.exchange_rate ? ` · FX ${m.exchange_rate}` : ""}{m?.freight_rate ? ` · freight ${pct(m.freight_rate)}` : ""}
              </p>
            </div>
            <div className="flex gap-4 text-right">
              <div><p className="text-[10.5px] text-gray-400 uppercase tracking-wide">SKUs</p><p className="text-lg font-bold text-gray-900">{brandItems.length}</p></div>
              <div><p className="text-[10.5px] text-gray-400 uppercase tracking-wide">Avg retail margin</p><p className={`text-lg font-bold ${avgRetailMargin != null && avgRetailMargin < 0.2 ? "text-amber-600" : "text-gray-900"}`}>{pct(avgRetailMargin)}</p></div>
              {lowest && <div><p className="text-[10.5px] text-gray-400 uppercase tracking-wide">Lowest margin</p><p className="text-[13px] font-bold text-rose-600 truncate max-w-[160px]" title={lowest.product_name}>{pct(lowest.retail_margin_pct)}</p></div>}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                  <th className="text-left py-1.5 cursor-pointer" onClick={() => setSortBy("name")}>Product</th>
                  <th className="text-left py-1.5">Style</th>
                  <th className="text-right py-1.5 cursor-pointer" onClick={() => setSortBy("landed_cost_aud")}>Landed cost</th>
                  <th className="text-right py-1.5">Retail (ex GST)</th>
                  <th className="text-right py-1.5">Wholesale</th>
                  <th className="text-right py-1.5">Bunting</th>
                  <th className="text-right py-1.5 cursor-pointer" onClick={() => setSortBy("retail_margin_pct")}>Retail margin</th>
                  <th className="text-right py-1.5 cursor-pointer" onClick={() => setSortBy("bunting_margin_pct")}>Bunting margin</th>
                  <th className="text-right py-1.5">Direct margin</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((i, idx) => (
                  <tr key={idx} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-1.5 font-semibold text-slate-700 max-w-[240px] truncate" title={i.product_name}>
                      {i.product_name}
                      {i.category && <span className="block text-[10px] font-normal text-gray-400">{i.category}</span>}
                    </td>
                    <td className="py-1.5 text-gray-400 font-mono text-[11px]">{i.style_code ?? "—"}</td>
                    <td className="py-1.5 text-right text-slate-600">{i.landed_cost_aud != null ? fmtFull(i.landed_cost_aud) : "—"}</td>
                    <td className="py-1.5 text-right text-slate-600">{i.retail_excl_gst != null ? fmtFull(i.retail_excl_gst) : "—"}</td>
                    <td className="py-1.5 text-right text-slate-600">{i.wholesale_excl_gst != null ? fmtFull(i.wholesale_excl_gst) : "—"}</td>
                    <td className="py-1.5 text-right text-slate-600">{i.bunting_excl_gst != null ? fmtFull(i.bunting_excl_gst) : "—"}</td>
                    <td className="py-1.5 text-right"><span className={`font-bold rounded px-1.5 py-0.5 ${marginCls(i.retail_margin_pct)}`}>{pct(i.retail_margin_pct)}</span></td>
                    <td className="py-1.5 text-right"><span className={`font-bold rounded px-1.5 py-0.5 ${marginCls(i.bunting_margin_pct)}`}>{pct(i.bunting_margin_pct)}</span></td>
                    <td className="py-1.5 text-right"><span className={`font-bold rounded px-1.5 py-0.5 ${marginCls(i.direct_margin_pct)}`}>{pct(i.direct_margin_pct)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sorted.length === 0 && <p className="text-sm text-gray-400 text-center py-6">No products match.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
