"use client";

import { useEffect, useMemo, useState } from "react";

// Admin reporting for influencer gifting: brand × month cost spend vs budget.
// Cost figures are shown here (this is your dashboard); the team form never does.

type Entry = { id: number; month_key: string; handle: string | null; platform: string | null; brand: string | null; product_name: string | null; rrp: number | null; gifting_cost: number | null; influencer_cost: number | null; total_cost: number | null; created_at: string; status?: string | null; content_url?: string | null; reach?: number | null; engagements?: number | null; sales_value?: number | null };
type Budget = { brand: string; month_key: string; budget: number };
type Influencer = { handle: string; name: string | null; platform: string | null; followers: number | null; contact: string | null; notes: string | null };

const FY_MONTHS = Array.from({ length: 12 }, (_, i) => {
  const m = 7 + i; const y = m <= 12 ? 2026 : 2027; const mm = ((m - 1) % 12) + 1;
  const key = `${y}-${String(mm).padStart(2, "0")}`;
  return { key, label: new Date(`${key}-01T00:00:00`).toLocaleDateString("en-AU", { month: "short" }) };
});
const CANON = ["UPPAbaby", "Gaia", "WonderFold", "SmarTrike", "Frida", "Nanit", "Hannie", "Magic", "Mamave", "Matchstick Monkey", "Zazu", "MiaMily"];
const aud = (n: number) => "$" + Math.round(n).toLocaleString("en-AU");
const compact = (n: number) => n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? Math.round(n / 1e3) + "k" : String(Math.round(n));
const STATUS_CHIP: Record<string, string> = {
  pitched: "bg-slate-100 text-slate-600", agreed: "bg-blue-100 text-blue-700",
  shipped: "bg-amber-100 text-amber-700", posted: "bg-indigo-100 text-indigo-700", complete: "bg-emerald-100 text-emerald-700",
};

const SQL = `-- run once in Supabase, then the admin imports products + budgets
create table if not exists influencer_products (
  style_code text primary key, product_name text not null, brand text,
  cost_price numeric, rrp numeric, cost_ratio numeric );
create table if not exists influencer_entries (
  id bigint generated always as identity primary key,
  month_key text not null, handle text, platform text, followers int, campaign text,
  brand text, style_code text, product_name text, rrp numeric,
  gifting_cost numeric, influencer_cost numeric default 0, total_cost numeric,
  created_at timestamptz default now() );
create table if not exists influencer_budgets (
  brand text not null, month_key text not null, budget numeric default 0,
  primary key (brand, month_key) );
create table if not exists influencers (
  handle text primary key, name text, platform text, followers int,
  contact text, notes text, created_at timestamptz default now(), updated_at timestamptz default now() );
alter table influencer_entries add column if not exists status text;
alter table influencer_entries add column if not exists content_url text;
alter table influencer_entries add column if not exists reach int;
alter table influencer_entries add column if not exists engagements int;
alter table influencer_entries add column if not exists sales_value numeric;
alter table influencer_products disable row level security;
alter table influencer_entries disable row level security;
alter table influencer_budgets disable row level security;
alter table influencers disable row level security;`;

export function InfluencerTracker() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [view, setView] = useState<"spend" | "budget" | "variance">("spend");
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<"report" | "roster">("report");
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [editInf, setEditInf] = useState<Partial<Influencer> | null>(null);

  function load() {
    Promise.all([
      fetch("/api/influencer/entries").then(r => r.json()),
      fetch("/api/influencer/budgets").then(r => r.json()),
      fetch("/api/influencer/roster").then(r => r.json()),
    ]).then(([e, b, r]) => {
      setNeedsSetup(!!e.needsSetup || !!b.needsSetup);
      setEntries(e.entries ?? []); setBudgets(b.budgets ?? []); setInfluencers(r.influencers ?? []); setLoading(false);
    }).catch(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  // Roster: aggregate gifts per handle, merged with the influencer master list
  const roster = useMemo(() => {
    const agg = new Map<string, { handle: string; gifts: number; value: number; reach: number; sales: number; brands: Set<string>; last: string }>();
    for (const e of entries) {
      const h = e.handle || "—";
      const cur = agg.get(h) ?? { handle: h, gifts: 0, value: 0, reach: 0, sales: 0, brands: new Set<string>(), last: "" };
      cur.gifts++; cur.value += e.total_cost ?? 0; cur.reach += e.reach ?? 0; cur.sales += e.sales_value ?? 0;
      if (e.brand) cur.brands.add(e.brand); if (e.month_key > cur.last) cur.last = e.month_key;
      agg.set(h, cur);
    }
    for (const i of influencers) if (!agg.has(i.handle)) agg.set(i.handle, { handle: i.handle, gifts: 0, value: 0, reach: 0, sales: 0, brands: new Set(), last: "" });
    const byHandle = new Map(influencers.map(i => [i.handle, i]));
    return [...agg.values()].map(a => ({ ...a, brands: [...a.brands], m: byHandle.get(a.handle) })).sort((x, y) => y.value - x.value);
  }, [entries, influencers]);

  async function saveInfluencer(i: Partial<Influencer>) {
    await fetch("/api/influencer/roster", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(i) });
    setEditInf(null); load();
  }
  async function delInfluencer(handle: string) {
    await fetch(`/api/influencer/roster?handle=${encodeURIComponent(handle)}`, { method: "DELETE" });
    setEditInf(null); load();
  }

  const [editResult, setEditResult] = useState<Entry | null>(null);
  async function saveResult(e: Partial<Entry>) {
    await fetch("/api/influencer/entries", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(e) });
    setEditResult(null); load();
  }

  // Blended results / ROI
  const results = useMemo(() => {
    let reach = 0, sales = 0, costReach = 0, costSales = 0;
    for (const e of entries) {
      reach += e.reach ?? 0; sales += e.sales_value ?? 0;
      if (e.reach) costReach += e.total_cost ?? 0;
      if (e.sales_value) costSales += e.total_cost ?? 0;
    }
    return { reach, sales, cpm: reach > 0 ? (costReach / reach) * 1000 : 0, roi: costSales > 0 ? sales / costSales : 0,
      hasAny: entries.some(e => e.reach || e.sales_value) };
  }, [entries]);
  const cpmOf = (e: Entry) => (e.reach && e.total_cost ? (e.total_cost / e.reach) * 1000 : null);
  const roiOf = (e: Entry) => (e.sales_value && e.total_cost ? e.sales_value / e.total_cost : null);

  // actual[brand][month] and budget[brand][month]
  const { brands, actual, budget } = useMemo(() => {
    const actual: Record<string, Record<string, number>> = {};
    const budget: Record<string, Record<string, number>> = {};
    const seen = new Set<string>();
    for (const e of entries) {
      const b = e.brand || "—"; seen.add(b);
      (actual[b] ??= {})[e.month_key] = (actual[b]?.[e.month_key] ?? 0) + (e.total_cost ?? 0);
    }
    for (const x of budgets) {
      seen.add(x.brand);
      (budget[x.brand] ??= {})[x.month_key] = (budget[x.brand]?.[x.month_key] ?? 0) + (x.budget ?? 0);
    }
    const brands = [...CANON.filter(b => seen.has(b)), ...[...seen].filter(b => !CANON.includes(b)).sort()];
    return { brands, actual, budget };
  }, [entries, budgets]);

  const cell = (b: string, m: string) => {
    const a = actual[b]?.[m] ?? 0, bg = budget[b]?.[m] ?? 0;
    return view === "spend" ? a : view === "budget" ? bg : bg - a; // variance = budget - actual
  };
  const rowTotal = (b: string) => FY_MONTHS.reduce((s, m) => s + cell(b, m.key), 0);
  const colTotal = (m: string) => brands.reduce((s, b) => s + cell(b, m), 0);
  const totalSpend = brands.reduce((s, b) => s + FY_MONTHS.reduce((t, m) => t + (actual[b]?.[m.key] ?? 0), 0), 0);
  const totalBudget = brands.reduce((s, b) => s + FY_MONTHS.reduce((t, m) => t + (budget[b]?.[m.key] ?? 0), 0), 0);

  async function saveBudget(brand: string, month_key: string, value: number) {
    setBudgets(prev => { const o = prev.filter(x => !(x.brand === brand && x.month_key === month_key)); return [...o, { brand, month_key, budget: value }]; });
    await fetch("/api/influencer/budgets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand, month_key, budget: value }) });
  }
  async function del(id: number) { await fetch(`/api/influencer/entries?id=${id}`, { method: "DELETE" }); load(); }

  if (needsSetup) return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 max-w-2xl">
      <h2 className="font-semibold text-gray-800">One-time setup</h2>
      <p className="text-sm text-gray-500 mt-1">Run this in the Supabase SQL editor, then I’ll import your products + budgets.</p>
      <pre className="mt-4 text-[10px] bg-slate-900 text-slate-100 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap">{SQL}</pre>
      <div className="flex gap-2 mt-4">
        <button onClick={() => { navigator.clipboard?.writeText(SQL); setCopied(true); }} className="text-xs font-semibold text-slate-600 bg-gray-100 hover:bg-gray-200 rounded-lg px-3 py-2">{copied ? "Copied ✓" : "Copy SQL"}</button>
        <button onClick={() => { setLoading(true); setNeedsSetup(false); load(); }} className="text-xs font-semibold text-white bg-indigo-500 hover:bg-indigo-600 rounded-lg px-3 py-2">I’ve run it — reload</button>
      </div>
    </div>
  );

  const pctUsed = totalBudget > 0 ? (totalSpend / totalBudget) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-semibold text-gray-800">Influencer Gifting</h2>
          <p className="text-xs text-gray-400 mt-0.5">FY 2026–27 · cost terms · ex-GST</p>
        </div>
        <a href="/log-gift" target="_blank" className="text-xs font-semibold text-white bg-indigo-500 hover:bg-indigo-600 rounded-lg px-3 py-2">Open team gift form ↗</a>
      </div>

      {/* View toggle: spend report vs influencer roster */}
      <div className="inline-flex bg-gray-100 rounded-lg p-0.5">
        <button onClick={() => setTab("report")} className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${tab === "report" ? "bg-white shadow-sm text-slate-700" : "text-gray-400 hover:text-gray-600"}`}>Spend &amp; Budget</button>
        <button onClick={() => setTab("roster")} className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${tab === "roster" ? "bg-white shadow-sm text-slate-700" : "text-gray-400 hover:text-gray-600"}`}>Influencers</button>
      </div>

      {tab === "report" && (<>
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Spend to date", value: aud(totalSpend), sub: `${entries.length} gifts logged` },
          { label: "FY Budget", value: aud(totalBudget), sub: "all brands" },
          { label: "% of Budget Used", value: `${pctUsed.toFixed(0)}%`, sub: pctUsed > 100 ? "over budget" : "on track" },
          { label: "Remaining", value: aud(Math.max(0, totalBudget - totalSpend)), sub: "budget left" },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">{k.label}</p>
            <p className="text-xl font-bold text-slate-800 mt-1">{k.value}</p>
            <p className="text-[11px] text-gray-400">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Brand × month matrix */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700">Brand × Month</h3>
          <div className="inline-flex bg-gray-100 rounded-lg p-0.5">
            {(["spend", "budget", "variance"] as const).map(v => (
              <button key={v} onClick={() => setView(v)} className={`px-3 py-1 rounded-md text-xs font-semibold capitalize transition-all ${view === v ? "bg-white shadow-sm text-slate-700" : "text-gray-400 hover:text-gray-600"}`}>
                {v === "variance" ? "vs Budget" : v}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-gray-400">
                <th className="text-left font-semibold uppercase tracking-wide text-[10px] py-2 px-2 sticky left-0 bg-white">Brand</th>
                {FY_MONTHS.map(m => <th key={m.key} className="text-right font-semibold uppercase tracking-wide text-[10px] py-2 px-2">{m.label}</th>)}
                <th className="text-right font-semibold uppercase tracking-wide text-[10px] py-2 px-2 border-l border-gray-100">Total</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={14} className="text-center text-gray-400 py-6">Loading…</td></tr>
              ) : brands.length === 0 ? (
                <tr><td colSpan={14} className="text-center text-gray-400 py-6">No data yet — log a gift or import budgets.</td></tr>
              ) : brands.map(b => (
                <tr key={b} className="border-t border-gray-50">
                  <td className="py-1.5 px-2 text-slate-700 font-medium sticky left-0 bg-white">{b}</td>
                  {FY_MONTHS.map(m => {
                    const v = cell(b, m.key);
                    if (view === "budget") return (
                      <td key={m.key} className="py-1 px-1 text-right">
                        <input defaultValue={budget[b]?.[m.key] ?? 0} onBlur={e => { const n = Number(e.target.value) || 0; if (n !== (budget[b]?.[m.key] ?? 0)) saveBudget(b, m.key, n); }}
                          className="w-14 text-right text-[11px] text-slate-600 bg-gray-50/60 border border-gray-100 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                      </td>
                    );
                    const over = view === "variance" && v < 0;
                    return <td key={m.key} className={`py-1.5 px-2 text-right tabular-nums ${v === 0 ? "text-gray-300" : view === "variance" ? (v < 0 ? "text-rose-500" : "text-emerald-600") : "text-slate-600"}`}>{v === 0 ? "—" : (view === "variance" && v > 0 ? "+" : "") + aud(v)}</td>;
                  })}
                  <td className="py-1.5 px-2 text-right font-bold text-slate-800 border-l border-gray-100 tabular-nums">{aud(rowTotal(b))}</td>
                </tr>
              ))}
            </tbody>
            {brands.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-gray-200 font-bold text-slate-800">
                  <td className="py-2 px-2 sticky left-0 bg-white">Total</td>
                  {FY_MONTHS.map(m => <td key={m.key} className="py-2 px-2 text-right tabular-nums">{aud(colTotal(m.key))}</td>)}
                  <td className="py-2 px-2 text-right border-l border-gray-100 tabular-nums">{aud(brands.reduce((s, b) => s + rowTotal(b), 0))}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {view === "budget" && <p className="text-[10px] text-gray-400 mt-2">Click a cell to edit a brand’s monthly budget.</p>}
      </div>

      {/* Results & ROI KPIs (once any results are entered) */}
      {results.hasAny && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Total Reach", value: compact(results.reach), sub: "views / impressions" },
            { label: "Blended CPM", value: results.cpm > 0 ? aud(results.cpm) : "—", sub: "cost per 1,000 reach" },
            { label: "Attributed Sales", value: aud(results.sales), sub: "from tracked gifts" },
            { label: "Return on Gifting", value: results.roi > 0 ? results.roi.toFixed(1) + "×" : "—", sub: "sales ÷ cost (tracked)" },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">{k.label}</p>
              <p className="text-xl font-bold text-slate-800 mt-1">{k.value}</p>
              <p className="text-[11px] text-gray-400">{k.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Recent gifts */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700">Recent gifts</h3>
          <span className="text-[11px] text-gray-400">click a row to add results</span>
        </div>
        {entries.length === 0 ? (
          <p className="text-sm text-gray-400 py-3 text-center">No gifts logged yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400">
                  {["Month", "Influencer", "Brand", "Product", "Cost", "Status", "Reach", "CPM", "ROI", ""].map(h => (
                    <th key={h} className={`${["Cost", "Reach", "CPM", "ROI"].includes(h) ? "text-right" : "text-left"} font-semibold uppercase tracking-wide text-[10px] py-2 px-2`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.slice(0, 40).map(e => {
                  const cpm = cpmOf(e), roi = roiOf(e);
                  return (
                    <tr key={e.id} className="border-t border-gray-50 hover:bg-indigo-50/40 cursor-pointer" onClick={() => setEditResult(e)}>
                      <td className="py-1.5 px-2 text-gray-500">{new Date(e.month_key + "-01T00:00:00").toLocaleDateString("en-AU", { month: "short", year: "2-digit" })}</td>
                      <td className="py-1.5 px-2 text-slate-700">{e.handle}<span className="text-gray-400"> · {e.platform}</span></td>
                      <td className="py-1.5 px-2 text-slate-600">{e.brand}</td>
                      <td className="py-1.5 px-2 text-slate-600 max-w-[200px] truncate" title={e.product_name ?? ""}>{e.product_name ?? "—"}</td>
                      <td className="py-1.5 px-2 text-right font-bold text-slate-800">{aud(e.total_cost ?? 0)}</td>
                      <td className="py-1.5 px-2">{e.status ? <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${STATUS_CHIP[e.status] ?? "bg-slate-100 text-slate-600"}`}>{e.status}</span> : <span className="text-gray-300">—</span>}</td>
                      <td className="py-1.5 px-2 text-right text-gray-500">{e.reach ? compact(e.reach) : "—"}</td>
                      <td className="py-1.5 px-2 text-right text-gray-500">{cpm != null ? aud(cpm) : "—"}</td>
                      <td className={`py-1.5 px-2 text-right font-semibold ${roi != null ? (roi >= 1 ? "text-emerald-600" : "text-amber-600") : "text-gray-300"}`}>{roi != null ? roi.toFixed(1) + "×" : "—"}</td>
                      <td className="py-1.5 px-2 text-right"><button onClick={ev => { ev.stopPropagation(); del(e.id); }} className="text-gray-300 hover:text-rose-500" title="Delete">✕</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </>)}

      {/* Results editor */}
      {editResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setEditResult(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5" onClick={ev => ev.stopPropagation()}>
            <h3 className="font-semibold text-gray-800">Gift results</h3>
            <p className="text-xs text-gray-400 mt-0.5 mb-4">{editResult.handle} · {editResult.brand} · {editResult.product_name ?? "—"} · cost {aud(editResult.total_cost ?? 0)}</p>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Status</label>
                <select defaultValue={editResult.status ?? ""} onChange={ev => setEditResult(p => p && { ...p, status: ev.target.value })} className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-400">
                  <option value="">—</option>
                  {["pitched", "agreed", "shipped", "posted", "complete"].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Content URL</label>
                <input defaultValue={editResult.content_url ?? ""} onChange={ev => setEditResult(p => p && { ...p, content_url: ev.target.value })} placeholder="https://…" className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                {([["reach", "Reach / views"], ["engagements", "Engagements"], ["sales_value", "Sales ($)"]] as const).map(([k, lbl]) => (
                  <div key={k}>
                    <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{lbl}</label>
                    <input type="number" defaultValue={(editResult as any)[k] ?? ""} onChange={ev => setEditResult(p => p && { ...p, [k]: ev.target.value === "" ? null : Number(ev.target.value) })} className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                  </div>
                ))}
              </div>
              {(editResult.reach || editResult.sales_value) ? (
                <p className="text-[11px] text-gray-500">{cpmOf(editResult) != null ? `CPM ${aud(cpmOf(editResult)!)}` : ""}{cpmOf(editResult) != null && roiOf(editResult) != null ? " · " : ""}{roiOf(editResult) != null ? `ROI ${roiOf(editResult)!.toFixed(1)}×` : ""}</p>
              ) : null}
            </div>
            <div className="flex items-center gap-2 mt-5">
              <button onClick={() => saveResult({ id: editResult.id, status: editResult.status, content_url: editResult.content_url, reach: editResult.reach, engagements: editResult.engagements, sales_value: editResult.sales_value })} className="text-sm font-semibold text-white bg-indigo-500 hover:bg-indigo-600 rounded-lg px-4 py-2">Save</button>
              <button onClick={() => setEditResult(null)} className="text-sm text-gray-400 hover:text-gray-600 px-2">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Influencer roster ── */}
      {tab === "roster" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-700">Influencer Roster</h3>
              <p className="text-[11px] text-gray-400">{roster.length} influencers · gifting value is ex-GST cost</p>
            </div>
            <button onClick={() => setEditInf({})} className="text-xs font-semibold text-white bg-indigo-500 hover:bg-indigo-600 rounded-lg px-3 py-2">+ Add influencer</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400">
                  {["Name", "Handle", "Platform", "Followers", "Gifts", "Total value", "Reach", "ROI", "Brands", "Last", ""].map(h => (
                    <th key={h} className={`${["Followers", "Gifts", "Total value", "Reach", "ROI"].includes(h) ? "text-right" : "text-left"} font-semibold uppercase tracking-wide text-[10px] py-2 px-2`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={11} className="text-center text-gray-400 py-6">Loading…</td></tr>
                ) : roster.length === 0 ? (
                  <tr><td colSpan={11} className="text-center text-gray-400 py-6">No influencers yet — add one or log a gift.</td></tr>
                ) : roster.map(r => (
                  <tr key={r.handle} className="border-t border-gray-50 hover:bg-gray-50/50">
                    <td className="py-1.5 px-2 text-slate-700 font-medium">{r.m?.name ?? <span className="text-gray-300">—</span>}</td>
                    <td className="py-1.5 px-2 text-slate-600">{r.handle}</td>
                    <td className="py-1.5 px-2 text-gray-500">{r.m?.platform ?? "—"}</td>
                    <td className="py-1.5 px-2 text-right text-gray-500">{r.m?.followers != null ? Number(r.m.followers).toLocaleString("en-AU") : "—"}</td>
                    <td className="py-1.5 px-2 text-right text-gray-600">{r.gifts}</td>
                    <td className="py-1.5 px-2 text-right font-bold text-slate-800">{aud(r.value)}</td>
                    <td className="py-1.5 px-2 text-right text-gray-500">{r.reach ? compact(r.reach) : "—"}</td>
                    <td className="py-1.5 px-2 text-right font-semibold text-emerald-600">{r.sales > 0 && r.value > 0 ? (r.sales / r.value).toFixed(1) + "×" : "—"}</td>
                    <td className="py-1.5 px-2 text-gray-500 max-w-[200px] truncate" title={r.brands.join(", ")}>{r.brands.join(", ") || "—"}</td>
                    <td className="py-1.5 px-2 text-gray-500">{r.last ? new Date(r.last + "-01T00:00:00").toLocaleDateString("en-AU", { month: "short", year: "2-digit" }) : "—"}</td>
                    <td className="py-1.5 px-2 text-right"><button onClick={() => setEditInf(r.m ?? { handle: r.handle })} className="text-indigo-500 hover:text-indigo-700 text-[11px]">edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editInf && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setEditInf(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-800 mb-4">{editInf.handle ? "Edit influencer" : "Add influencer"}</h3>
            <div className="space-y-3">
              {(["name", "handle", "platform", "contact"] as const).map(k => (
                <div key={k}>
                  <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{k === "contact" ? "Contact (email / agency)" : k}</label>
                  <input
                    defaultValue={(editInf as any)[k] ?? ""} disabled={k === "handle" && !!editInf.handle && roster.some(r => r.handle === editInf.handle)}
                    onChange={e => setEditInf(p => ({ ...p, [k]: e.target.value }))}
                    placeholder={k === "handle" ? "@handle" : k === "platform" ? "Instagram / TikTok…" : ""}
                    className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:bg-gray-50 disabled:text-gray-400" />
                </div>
              ))}
              <div>
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Followers</label>
                <input type="number" defaultValue={editInf.followers ?? ""} onChange={e => setEditInf(p => ({ ...p, followers: Number(e.target.value) }))} className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Notes</label>
                <textarea defaultValue={editInf.notes ?? ""} onChange={e => setEditInf(p => ({ ...p, notes: e.target.value }))} rows={2} className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-400 resize-none" />
              </div>
            </div>
            <div className="flex items-center gap-2 mt-5">
              <button disabled={!editInf.handle} onClick={() => saveInfluencer(editInf)} className="text-sm font-semibold text-white bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 rounded-lg px-4 py-2">Save</button>
              <button onClick={() => setEditInf(null)} className="text-sm text-gray-400 hover:text-gray-600 px-2">Cancel</button>
              {editInf.handle && roster.some(r => r.handle === editInf.handle) && <button onClick={() => delInfluencer(editInf.handle!)} className="ml-auto text-sm text-rose-500 hover:text-rose-600">Delete</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
