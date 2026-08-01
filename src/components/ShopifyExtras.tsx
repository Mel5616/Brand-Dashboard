"use client";

import React from "react";
import { fmtFull, fmt } from "@/lib/format";

// Panels unlocked by the expanded Shopify scopes:
//  AbandonedCheckoutsPanel — Shopify tab: value walking away at checkout
//  LiveStockPanel          — Stock Report tab: live low/OOS active products
//  DiscountCodesPanel      — Influencer tab: native code redemption counts
//  CrossCodeCard           — Promotions tab (admin): create a code on every site

type BrandRef = { id: number; name: string; color: string };
type Extras = {
  abandoned: { brand_id: number; month_key: string; checkouts: number; value: number }[];
  stock: { brand_id: number; product_id: string; title: string; total_qty: number; variants_out: number; variants_total: number }[];
  codes: { brand_id: number; code: string; usage_count: number; value_type: string | null; value: number | null; ends_at: string | null }[];
  needsSetup?: boolean;
};

const cache: { data: Extras | null; promise: Promise<Extras> | null } = { data: null, promise: null };
function useExtras(): Extras | null {
  const [data, setData] = React.useState<Extras | null>(cache.data);
  React.useEffect(() => {
    if (cache.data) return;
    cache.promise ??= fetch("/api/shopify-extras").then(r => r.json()).then(d => (cache.data = d));
    cache.promise.then(setData).catch(() => {});
  }, []);
  return data;
}

const mLabel = (mk: string) => { const [y, m] = mk.split("-"); return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-AU", { month: "short" }); };

const SetupNote = ({ title }: { title: string }) => (
  <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
    <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-2">{title}</h2>
    <p className="text-sm text-gray-400">Run <code className="bg-gray-100 px-1 rounded">supabase/add_shopify_extras.sql</code>, then the next sync fills this in.</p>
  </div>
);

export function AbandonedCheckoutsPanel({ brands }: { brands: BrandRef[] }) {
  const d = useExtras();
  if (!d) return null;
  if (d.needsSetup) return <SetupNote title="Abandoned checkouts" />;
  const rows = d.abandoned;
  if (!rows.length) return null;
  const months = [...new Set(rows.map(r => r.month_key))].sort().slice(-3);
  const latest = months[months.length - 1];
  const byBrand = brands
    .map(b => ({ b, list: rows.filter(r => r.brand_id === b.id && months.includes(r.month_key)) }))
    .filter(x => x.list.length)
    .map(x => ({ ...x, latestVal: x.list.find(r => r.month_key === latest)?.value ?? 0, latestN: x.list.find(r => r.month_key === latest)?.checkouts ?? 0 }))
    .sort((a, b) => b.latestVal - a.latestVal);
  const totVal = byBrand.reduce((s, x) => s + x.latestVal, 0);
  const totN = byBrand.reduce((s, x) => s + x.latestN, 0);
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Abandoned checkouts</h2>
          <p className="text-xs text-gray-400 mt-0.5">Started checkout, never paid — the money left on the table (ex-GST)</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold text-slate-900">{fmtFull(Math.round(totVal))}</p>
          <p className="text-[11px] text-gray-400">{totN.toLocaleString()} checkouts · {mLabel(latest)}</p>
        </div>
      </div>
      <table className="w-full text-sm">
        <thead><tr className="text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
          <th className="text-left py-1.5">Brand</th>
          {months.map(m => <th key={m} className="text-right py-1.5">{mLabel(m)}</th>)}
        </tr></thead>
        <tbody>
          {byBrand.map(({ b, list }) => (
            <tr key={b.id} className="border-b border-gray-50">
              <td className="py-1.5"><span className="inline-flex items-center gap-1.5 font-semibold text-slate-700"><span className="w-2.5 h-2.5 rounded-full" style={{ background: b.color }} />{b.name}</span></td>
              {months.map(m => {
                const r = list.find(x => x.month_key === m);
                return <td key={m} className="py-1.5 text-right text-slate-600">{r ? <>{fmt(r.value)} <span className="text-[10.5px] text-gray-300">({r.checkouts})</span></> : "—"}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10.5px] text-gray-300 mt-2">Klaviyo abandonment flows work this list — compare its size against email flow revenue on the Email tab</p>
    </div>
  );
}

export function LiveStockPanel({ brands }: { brands: BrandRef[] }) {
  const d = useExtras();
  const [open, setOpen] = React.useState<number | null>(null);
  if (!d) return null;
  if (d.needsSetup) return <SetupNote title="Live Shopify stock" />;
  const rows = d.stock;
  const byBrand = brands
    .map(b => ({ b, list: rows.filter(r => r.brand_id === b.id).sort((x, y) => x.total_qty - y.total_qty) }))
    .filter(x => x.list.length)
    .sort((a, b) => b.list.length - a.list.length);
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-4">
      <div className="mb-3">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Live Shopify stock</h2>
        <p className="text-xs text-gray-400 mt-0.5">Active (published) products that are out of stock or low — straight from Shopify, refreshed with the sync. If it's here and being advertised, that spend is at risk.</p>
      </div>
      {byBrand.length === 0 ? (
        <p className="text-sm text-emerald-600 font-medium">✓ No active products low or out of stock anywhere — all clear.</p>
      ) : (
        <div className="space-y-2">
          {byBrand.map(({ b, list }) => {
            const oos = list.filter(r => r.total_qty <= 0).length;
            const isOpen = open === b.id;
            return (
              <div key={b.id} className="border border-gray-100 rounded-lg">
                <button onClick={() => setOpen(isOpen ? null : b.id)} className="w-full flex items-center gap-2.5 px-3 py-2 text-left">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: b.color }} />
                  <span className="font-semibold text-sm text-slate-700 flex-1">{b.name}</span>
                  {oos > 0 && <span className="text-[11px] font-bold text-rose-600 bg-rose-50 rounded-full px-2 py-0.5">{oos} out</span>}
                  {list.length - oos > 0 && <span className="text-[11px] font-bold text-amber-600 bg-amber-50 rounded-full px-2 py-0.5">{list.length - oos} low</span>}
                  <span className="text-gray-300 text-xs">{isOpen ? "▴" : "▾"}</span>
                </button>
                {isOpen && (
                  <div className="px-3 pb-2">
                    {list.slice(0, 30).map(r => (
                      <div key={r.product_id} className="flex items-center gap-2 py-1 border-t border-gray-50 text-[13px]">
                        <span className="flex-1 text-slate-600 truncate" title={r.title}>{r.title}</span>
                        {r.variants_out > 0 && <span className="text-[10.5px] text-gray-400 shrink-0">{r.variants_out}/{r.variants_total} variants out</span>}
                        <span className={`font-bold shrink-0 ${r.total_qty <= 0 ? "text-rose-600" : "text-amber-600"}`}>{r.total_qty <= 0 ? "0" : r.total_qty} left</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function DiscountCodesPanel({ brands }: { brands: BrandRef[] }) {
  const d = useExtras();
  const [q, setQ] = React.useState("");
  if (!d) return null;
  if (d.needsSetup) return <SetupNote title="Code redemptions" />;
  const rows = d.codes;
  if (!rows.length) return null;
  const filtered = rows.filter(r => !q || r.code.toLowerCase().includes(q.toLowerCase())).slice(0, 40);
  const name = (id: number) => brands.find(b => b.id === id)?.name ?? "";
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Code redemptions</h2>
          <p className="text-xs text-gray-400 mt-0.5">Native Shopify usage counts for every discount code — influencer &amp; affiliate codes included</p>
        </div>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search a code…" className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-300" />
      </div>
      <table className="w-full text-sm">
        <thead><tr className="text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
          <th className="text-left py-1.5">Code</th><th className="text-left py-1.5">Brand</th>
          <th className="text-right py-1.5">Deal</th><th className="text-right py-1.5">Redemptions</th>
        </tr></thead>
        <tbody>
          {filtered.map(r => (
            <tr key={`${r.brand_id}-${r.code}`} className="border-b border-gray-50">
              <td className="py-1.5 font-mono text-[12.5px] font-semibold text-slate-700">{r.code}</td>
              <td className="py-1.5 text-slate-500 text-[12.5px]">{name(r.brand_id)}</td>
              <td className="py-1.5 text-right text-slate-500 text-[12.5px]">{r.value ? (r.value_type === "percentage" ? `${Math.round(r.value)}%` : fmtFull(r.value)) : "—"}</td>
              <td className="py-1.5 text-right font-bold text-slate-800">{r.usage_count.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CrossCodeCard() {
  const [stores, setStores] = React.useState<{ id: number; name: string }[]>([]);
  const [history, setHistory] = React.useState<any[]>([]);
  const [sel, setSel] = React.useState<Set<number>>(new Set());
  const [f, setF] = React.useState({ code: "", percent: "", starts_at: "", ends_at: "" });
  const [busy, setBusy] = React.useState(false);
  const [results, setResults] = React.useState<{ brand: string; ok: boolean; error?: string }[] | null>(null);

  const load = React.useCallback(() => {
    fetch("/api/cross-code").then(r => r.json()).then(d => {
      if (d.ok) { setStores(d.stores ?? []); setHistory(d.items ?? []); setSel(new Set((d.stores ?? []).map((s: any) => s.id))); }
    }).catch(() => {});
  }, []);
  React.useEffect(load, [load]);
  if (!stores.length) return null;

  async function create() {
    if (!f.code.trim() || !Number(f.percent) || sel.size === 0) return;
    if (!confirm(`Create ${f.code.toUpperCase()} (${f.percent}% off) on ${sel.size} store(s)? This makes a LIVE discount code.`)) return;
    setBusy(true); setResults(null);
    const d = await fetch("/api/cross-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, percent: Number(f.percent), store_ids: [...sel] }) }).then(r => r.json()).catch(() => null);
    setBusy(false);
    setResults(d?.results ?? [{ brand: "request", ok: false, error: d?.error || "failed" }]);
    load();
  }
  const inp = "text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-300";

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mt-4">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Cross-site discount code</h2>
      <p className="text-xs text-gray-400 mt-0.5 mb-3">Create one code across every selected website in a single click (e.g. an event code). Admin only — the code goes live immediately.</p>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <input value={f.code} onChange={e => setF(p => ({ ...p, code: e.target.value.toUpperCase() }))} placeholder="CODE e.g. NTM40" className={`${inp} font-mono w-36`} />
        <input value={f.percent} onChange={e => setF(p => ({ ...p, percent: e.target.value }))} placeholder="% off" type="number" className={`${inp} w-20`} />
        <input value={f.starts_at} onChange={e => setF(p => ({ ...p, starts_at: e.target.value }))} type="date" className={inp} title="Starts" />
        <input value={f.ends_at} onChange={e => setF(p => ({ ...p, ends_at: e.target.value }))} type="date" className={inp} title="Ends" />
        <button onClick={create} disabled={busy || !f.code.trim() || !Number(f.percent) || sel.size === 0}
          className="text-[12.5px] font-semibold text-white bg-slate-800 hover:bg-slate-900 rounded-lg px-4 py-2 disabled:opacity-40">
          {busy ? "Creating…" : `Create on ${sel.size} store${sel.size === 1 ? "" : "s"}`}
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {stores.map(s => (
          <button key={s.id} onClick={() => setSel(p => { const n = new Set(p); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; })}
            className={`text-[11.5px] font-semibold rounded-full px-2.5 py-1 border ${sel.has(s.id) ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "bg-white border-gray-200 text-gray-400"}`}>
            {sel.has(s.id) ? "✓ " : ""}{s.name}
          </button>
        ))}
      </div>
      {results && (
        <div className="text-[12.5px] space-y-0.5 mb-2">
          {results.map(r => <p key={r.brand} className={r.ok ? "text-emerald-600" : "text-rose-600"}>{r.ok ? "✓" : "✗"} {r.brand}{r.error ? ` — ${r.error}` : ""}</p>)}
        </div>
      )}
      {history.length > 0 && (
        <p className="text-[11px] text-gray-300">Previously created: {history.slice(0, 5).map((x: any) => `${x.code} (${Math.round(x.percent)}%)`).join(" · ")}</p>
      )}
    </div>
  );
}
