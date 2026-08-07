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
const marginColor = (v: number | null) => v == null ? "#d1d5db" : v < 0.15 ? "#e11d48" : v < 0.30 ? "#f59e0b" : "#10b981";
const marginCls = (v: number | null) => v == null ? "text-gray-300"
  : v < 0.15 ? "text-rose-600 bg-rose-50" : v < 0.30 ? "text-amber-600 bg-amber-50" : "text-emerald-600 bg-emerald-50";

// Small inline bar — the visual read on a margin %, scaled to a 60% ceiling
// (most retail margins here sit 30-55%, so this uses the space well).
function MarginBar({ v }: { v: number | null }) {
  const w = v == null ? 0 : Math.min(100, Math.max(2, (v / 0.6) * 100));
  return (
    <div className="flex items-center gap-1.5 justify-end">
      <div className="w-12 h-1.5 rounded-full bg-gray-100 overflow-hidden shrink-0">
        <div className="h-full rounded-full" style={{ width: `${w}%`, background: marginColor(v) }} />
      </div>
      <span className={`font-bold text-[11.5px] w-9 text-right ${v == null ? "text-gray-300" : v < 0.15 ? "text-rose-600" : v < 0.30 ? "text-amber-600" : "text-emerald-600"}`}>{pct(v)}</span>
    </div>
  );
}

// Some brands' live sheets have no category sub-header rows at all (a flat
// product list — SmarTrike, Mamave, MiaMily, Hannie as of Aug 2026), so every
// row comes through with category === null. Rather than dump them all into
// one "Other" bucket, cluster by a shared name prefix (1 word, then 2 words)
// so families like "Wonder ..." / "Xtend ..." still read as groups. Only
// used when the whole brand has no real categories — a per-item category
// from the sheet always wins.
function inferCategories(items: Item[]): Map<string, string> {
  const words1 = new Map<string, number>();
  const words2 = new Map<string, number>();
  for (const i of items) {
    const w = i.product_name.trim().split(/\s+/);
    if (w[0]) words1.set(w[0], (words1.get(w[0]) ?? 0) + 1);
    if (w.length > 1) { const k2 = w.slice(0, 2).join(" "); words2.set(k2, (words2.get(k2) ?? 0) + 1); }
  }
  // A first-word cluster covering almost everything (e.g. every MiaMily
  // product starts with "Multi") isn't a useful group — fall through to the
  // two-word prefix for those instead.
  const dominant1 = [...words1.values()].some(n => items.length > 3 && n >= items.length * 0.8);
  const out = new Map<string, string>();
  for (const i of items) {
    const w = i.product_name.trim().split(/\s+/);
    const w1 = w[0];
    const w2 = w.length > 1 ? w.slice(0, 2).join(" ") : null;
    if (!dominant1 && w1 && (words1.get(w1) ?? 0) >= 2) out.set(i.product_name, w1);
    else if (w2 && (words2.get(w2) ?? 0) >= 2) out.set(i.product_name, w2);
    else out.set(i.product_name, "Other");
  }
  return out;
}

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

  const brandItems = React.useMemo(
    () => items.filter(i => i.brand === brand && (!q || i.product_name.toLowerCase().includes(q.toLowerCase()) || (i.style_code ?? "").toLowerCase().includes(q.toLowerCase()))),
    [items, brand, q]
  );

  // Sorting by a metric shows a flat ranked list; the default "name" view
  // groups by category (as stored in the sheet) so large brands read cleanly.
  const grouped: [string, Item[]][] = React.useMemo(() => {
    if (sortBy !== "name") {
      const flat = [...brandItems].sort((a, b) => {
        const av = a[sortBy] ?? (sortBy === "landed_cost_aud" ? Infinity : -Infinity);
        const bv = b[sortBy] ?? (sortBy === "landed_cost_aud" ? Infinity : -Infinity);
        return sortBy === "landed_cost_aud" ? (av as number) - (bv as number) : (bv as number) - (av as number);
      });
      return [["", flat]];
    }
    const allNull = brandItems.length > 0 && brandItems.every(i => i.category == null);
    const inferred = allNull ? inferCategories(brandItems) : null;
    const byCat = new Map<string, Item[]>();
    for (const i of [...brandItems].sort((a, b) => a.product_name.localeCompare(b.product_name))) {
      const k = i.category ?? inferred?.get(i.product_name) ?? "Other";
      byCat.set(k, [...(byCat.get(k) ?? []), i]);
    }
    return [...byCat.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [brandItems, sortBy]);

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

  const m = meta.find(x => x.brand === brand);
  const withMargin = brandItems.filter(i => i.retail_margin_pct != null);
  const avgRetailMargin = withMargin.length ? withMargin.reduce((s, i) => s + (i.retail_margin_pct ?? 0), 0) / withMargin.length : null;
  const lowest = withMargin.length ? [...withMargin].sort((a, b) => (a.retail_margin_pct ?? 0) - (b.retail_margin_pct ?? 0))[0] : null;
  // Margin distribution — a tiny at-a-glance histogram in the header strip.
  const dist = { red: withMargin.filter(i => (i.retail_margin_pct ?? 0) < 0.15).length, amber: withMargin.filter(i => (i.retail_margin_pct ?? 0) >= 0.15 && (i.retail_margin_pct ?? 0) < 0.30).length, green: withMargin.filter(i => (i.retail_margin_pct ?? 0) >= 0.30).length };
  const distTotal = Math.max(1, dist.red + dist.amber + dist.green);

  const th = (label: string, key: typeof sortBy, extra = "") =>
    <th onClick={() => setSortBy(key)} className={`text-right py-2 cursor-pointer select-none hover:text-slate-600 ${sortBy === key ? "text-slate-700" : ""} ${extra}`}>{label}{sortBy === key && " ▾"}</th>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {brands.map(b => (
            <button key={b} onClick={() => setBrand(b)}
              className={`text-[12.5px] font-semibold rounded-full px-3 py-1.5 transition ${b === brand ? "bg-slate-800 text-white shadow-sm" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
              {b} <span className="opacity-60">({items.filter(i => i.brand === b).length})</span>
            </button>
          ))}
        </div>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search product or style code…"
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-300 w-64" />
      </div>

      {brand && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-5 bg-gradient-to-br from-slate-50 to-white border-b border-gray-100">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-lg font-bold text-slate-800">{brand}</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Live from SharePoint{m?.updated_label ? ` · sheet says "${m.updated_label}"` : ""}
                  {m?.exchange_rate ? ` · FX ${m.exchange_rate}` : ""}{m?.freight_rate ? ` · freight ${pct(m.freight_rate)}` : ""}
                </p>
              </div>
              <div className="flex gap-6 text-right">
                <div><p className="text-[10.5px] text-gray-400 uppercase tracking-wide">SKUs</p><p className="text-2xl font-bold text-gray-900">{brandItems.length}</p></div>
                <div><p className="text-[10.5px] text-gray-400 uppercase tracking-wide">Avg retail margin</p><p className={`text-2xl font-bold ${avgRetailMargin != null && avgRetailMargin < 0.2 ? "text-amber-600" : "text-emerald-600"}`}>{pct(avgRetailMargin)}</p></div>
                {lowest && <div><p className="text-[10.5px] text-gray-400 uppercase tracking-wide">Lowest margin</p><p className="text-[13px] font-bold text-rose-600 truncate max-w-[160px] mt-1.5" title={lowest.product_name}>{pct(lowest.retail_margin_pct)} · {lowest.product_name}</p></div>}
              </div>
            </div>
            {withMargin.length > 0 && (
              <div className="mt-4 flex items-center gap-3">
                <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400 shrink-0">Margin mix</span>
                <div className="flex-1 h-2.5 rounded-full overflow-hidden flex bg-gray-100 max-w-md">
                  {dist.red > 0 && <div style={{ width: `${(dist.red / distTotal) * 100}%`, background: "#e11d48" }} title={`${dist.red} products under 15% margin`} />}
                  {dist.amber > 0 && <div style={{ width: `${(dist.amber / distTotal) * 100}%`, background: "#f59e0b" }} title={`${dist.amber} products 15-30% margin`} />}
                  {dist.green > 0 && <div style={{ width: `${(dist.green / distTotal) * 100}%`, background: "#10b981" }} title={`${dist.green} products 30%+ margin`} />}
                </div>
                <span className="text-[11px] text-gray-400 shrink-0">{dist.red} thin · {dist.amber} ok · {dist.green} healthy</span>
              </div>
            )}
          </div>

          <div className="overflow-x-auto px-2">
            <table className="w-full text-[12.5px] border-separate border-spacing-0">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-gray-400 sticky top-0 bg-white z-10">
                  <th onClick={() => setSortBy("name")} className="text-left py-2 pl-4 cursor-pointer select-none hover:text-slate-600">Product</th>
                  <th className="text-left py-2">Style</th>
                  <th className="text-right py-2">FOB $US</th>
                  {th("Landed cost", "landed_cost_aud")}
                  <th className="text-right py-2 text-amber-600">RRP ex GST</th>
                  <th className="text-right py-2 text-sky-600">Wholesale</th>
                  <th className="text-right py-2">Bunting</th>
                  {th("Retail margin", "retail_margin_pct", "pr-2")}
                  {th("Bunting margin", "bunting_margin_pct", "pr-2")}
                  <th className="text-right py-2 pr-4">Direct margin</th>
                </tr>
              </thead>
              <tbody>
                {grouped.map(([cat, catItems]) => (
                  <React.Fragment key={cat || "__flat"}>
                    {cat && (
                      <tr>
                        <td colSpan={10} className="pt-4 pb-1.5 pl-4">
                          <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-400 bg-slate-50 rounded-full px-2.5 py-1">{cat} <span className="font-normal normal-case text-gray-300">· {catItems.length}</span></span>
                        </td>
                      </tr>
                    )}
                    {catItems.map((i, idx) => (
                      <tr key={idx} className="group even:bg-gray-50/40 hover:bg-emerald-50/40 transition-colors">
                        <td className="py-2 pl-4 font-semibold text-slate-700 max-w-[220px] truncate rounded-l-lg" title={i.product_name}>{i.product_name}</td>
                        <td className="py-2 text-gray-400 font-mono text-[11px]">{i.style_code ?? "—"}</td>
                        <td className="py-2 text-right text-gray-400">{i.fob_usd != null ? `US$${i.fob_usd.toFixed(2)}` : "—"}</td>
                        <td className="py-2 text-right text-slate-600">{i.landed_cost_aud != null ? fmtFull(i.landed_cost_aud) : "—"}</td>
                        <td className="py-2 text-right font-bold text-amber-700">{i.retail_excl_gst != null ? fmtFull(i.retail_excl_gst) : "—"}</td>
                        <td className="py-2 text-right font-bold text-sky-700">{i.wholesale_excl_gst != null ? fmtFull(i.wholesale_excl_gst) : "—"}</td>
                        <td className="py-2 text-right text-slate-500">{i.bunting_excl_gst != null ? fmtFull(i.bunting_excl_gst) : "—"}</td>
                        <td className="py-2 pr-2"><MarginBar v={i.retail_margin_pct} /></td>
                        <td className="py-2 pr-2"><MarginBar v={i.bunting_margin_pct} /></td>
                        <td className="py-2 pr-4 text-right rounded-r-lg"><span className={`font-bold rounded px-1.5 py-0.5 ${marginCls(i.direct_margin_pct)}`}>{pct(i.direct_margin_pct)}</span></td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
            {brandItems.length === 0 && <p className="text-sm text-gray-400 text-center py-6">No products match.</p>}
          </div>
          <div className="h-3" />
        </div>
      )}
    </div>
  );
}
