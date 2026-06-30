"use client";

import { useEffect, useMemo, useState } from "react";
import { INFLUENCER_FY_MONTHS } from "@/lib/influencerFy";
import {
  Chart as ChartJS, ArcElement, BarElement, CategoryScale, LinearScale,
  LineElement, PointElement, Filler, Tooltip, Legend,
} from "chart.js";
import { Doughnut, Line, Bar } from "react-chartjs-2";

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, LineElement, PointElement, Filler, Tooltip, Legend);
const PALETTE = ["#6366f1", "#14b8a6", "#f97316", "#e11d48", "#8b5cf6", "#0ea5e9", "#f59e0b", "#10b981", "#ec4899", "#64748b"];
const STATUS_COLOR: Record<string, string> = { Planned: "#f59e0b", Sent: "#0ea5e9", Live: "#10b981", Done: "#8b5cf6" };
const k$ = (n: number) => n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n)}`;

// Partnerships & Affiliates tracker (admin). Logs free product given to companies,
// cost derived server-side from the shared product catalogue. Cost is visible here.

type Entry = {
  id: number; month_key: string; company: string | null; brand: string | null; style_code: string | null;
  product_name: string | null; qty: number | null; rrp: number | null; gifting_cost: number | null;
  cash_fee: number | null; total_cost: number | null; affiliate_code: string | null; status: string | null; content_url: string | null;
};
type Product = { style_code: string; product_name: string; brand: string; rrp: number | null };

const aud = (n: number | null) => n == null ? "—" : "$" + Math.round(n).toLocaleString("en-AU");
const mon = (k: string) => new Date(k + "-01T00:00:00").toLocaleDateString("en-AU", { month: "short", year: "2-digit" });
const STATUS = ["Planned", "Sent", "Live", "Done"];
const statusCls = (s: string | null) => ({ Live: "bg-emerald-100 text-emerald-700", Sent: "bg-sky-100 text-sky-700", Planned: "bg-amber-100 text-amber-700", Done: "bg-violet-100 text-violet-700" } as Record<string, string>)[s || ""] || "bg-slate-100 text-slate-500";

export function PartnershipsTracker() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "needsSetup" | "error">("loading");
  const [adding, setAdding] = useState(false);
  const [brandF, setBrandF] = useState("");
  const [editing, setEditing] = useState<number | null>(null);

  async function load() {
    const [e, p] = await Promise.all([
      fetch("/api/partnerships/entries", { cache: "no-store" }).then(r => r.json()).catch(() => ({ ok: false })),
      fetch("/api/influencer/products").then(r => r.json()).catch(() => ({ products: [] })),
    ]);
    if (e.needsSetup) { setState("needsSetup"); return; }
    if (!e.ok) { setState("error"); return; }
    setEntries(e.entries || []); setProducts(p.products || []); setState("ready");
  }
  useEffect(() => { load(); }, []);

  const brands = useMemo(() => Array.from(new Set(entries.map(e => e.brand).filter(Boolean))) as string[], [entries]);
  const rows = entries.filter(e => !brandF || e.brand === brandF);

  // Overview series (all partnerships, ignoring the brand filter)
  const viz = useMemo(() => {
    const byBrand: Record<string, number> = {}, byCompany: Record<string, number> = {}, byStatus: Record<string, number> = {};
    const byMonth: Record<string, number> = {};
    for (const e of entries) {
      const c = Number(e.total_cost) || 0;
      byBrand[e.brand || "—"] = (byBrand[e.brand || "—"] || 0) + c;
      byCompany[e.company || "—"] = (byCompany[e.company || "—"] || 0) + c;
      byStatus[e.status || "Planned"] = (byStatus[e.status || "Planned"] || 0) + 1;
      byMonth[e.month_key] = (byMonth[e.month_key] || 0) + c;
    }
    const sortDesc = (o: Record<string, number>) => Object.entries(o).sort((a, b) => b[1] - a[1]);
    return {
      brand: sortDesc(byBrand),
      company: sortDesc(byCompany).slice(0, 8),
      status: STATUS.map(s => ({ s, n: byStatus[s] || 0 })),
      month: INFLUENCER_FY_MONTHS.map(m => byMonth[m.key] || 0),
    };
  }, [entries]);
  const totalCost = entries.reduce((s, e) => s + (Number(e.total_cost) || 0), 0);
  const monthLabels = INFLUENCER_FY_MONTHS.map(m => m.labelShort);
  const baseScales: any = { x: { grid: { display: false }, ticks: { font: { size: 10 }, color: "#9ca3af" } }, y: { ticks: { callback: (v: any) => k$(v), font: { size: 10 }, color: "#9ca3af" }, grid: { color: "#f3f4f6" } } };

  if (state === "loading") return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">Loading…</div>;
  if (state === "needsSetup") return <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl p-4">Run <code>add_partnerships.sql</code> in Supabase, then reload.</div>;
  if (state === "error") return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">Couldn’t load partnerships.</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={brandF} onChange={e => setBrandF(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
          <option value="">All brands</option>{brands.sort().map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <span className="text-[11px] text-gray-400">{rows.length} partnership{rows.length === 1 ? "" : "s"}</span>
        <button onClick={() => setAdding(a => !a)} className="ml-auto text-xs font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-3 py-2">{adding ? "Close" : "+ Add partnership"}</button>
      </div>

      {adding && <AddForm products={products} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />}

      {/* Visual overview */}
      {entries.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Spend by brand <span className="font-normal text-gray-400">· {k$(totalCost)} total</span></h3>
            <div className="h-52">
              <Bar data={{ labels: viz.brand.map(b => b[0]), datasets: [{ label: "Cost", data: viz.brand.map(b => b[1]), backgroundColor: viz.brand.map((_, i) => PALETTE[i % PALETTE.length]), borderRadius: 3 }] }}
                options={{ indexAxis: "y" as const, responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c: any) => ` ${k$(c.parsed.x ?? 0)}` } } }, scales: { x: { ticks: { callback: (v: any) => k$(v), font: { size: 10 }, color: "#9ca3af" }, grid: { color: "#f3f4f6" } }, y: { grid: { display: false }, ticks: { font: { size: 10 }, color: "#6b7280" } } } }} />
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Monthly spend</h3>
            <div className="h-52">
              <Line data={{ labels: monthLabels, datasets: [{ label: "Cost", data: viz.month, borderColor: "#6366f1", backgroundColor: "#6366f122", borderWidth: 2, pointRadius: 2, fill: true, tension: 0.3 }] }}
                options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c: any) => ` ${k$(c.parsed.y ?? 0)}` } } }, scales: baseScales }} />
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Top partners</h3>
            <div className="h-52">
              <Bar data={{ labels: viz.company.map(c => c[0]), datasets: [{ label: "Cost", data: viz.company.map(c => c[1]), backgroundColor: "#14b8a6", borderRadius: 3 }] }}
                options={{ indexAxis: "y" as const, responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c: any) => ` ${k$(c.parsed.x ?? 0)}` } } }, scales: { x: { ticks: { callback: (v: any) => k$(v), font: { size: 10 }, color: "#9ca3af" }, grid: { color: "#f3f4f6" } }, y: { grid: { display: false }, ticks: { font: { size: 10 }, color: "#6b7280" } } } }} />
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Status breakdown</h3>
            <div className="flex items-center gap-5">
              <div className="shrink-0" style={{ width: 150, height: 150 }}>
                <Doughnut data={{ labels: viz.status.map(s => s.s), datasets: [{ data: viz.status.map(s => s.n), backgroundColor: viz.status.map(s => STATUS_COLOR[s.s]), borderColor: "#fff", borderWidth: 2 }] }}
                  options={{ responsive: true, maintainAspectRatio: false, cutout: "62%", plugins: { legend: { display: false } } }} />
              </div>
              <div className="flex-1 space-y-1.5">
                {viz.status.map(s => (
                  <div key={s.s} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLOR[s.s] }} />{s.s}</span>
                    <span className="text-gray-400 font-medium">{s.n}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[820px]">
          <thead className="bg-slate-50 text-slate-400 text-[10px] uppercase tracking-wide">
            <tr>
              <th className="text-left font-semibold px-3 py-3">Month</th><th className="text-left font-semibold px-3 py-3">Company</th>
              <th className="text-left font-semibold px-3 py-3">Brand</th><th className="text-left font-semibold px-3 py-3">Product</th>
              <th className="text-right font-semibold px-3 py-3">Qty</th><th className="text-right font-semibold px-3 py-3">Cost</th>
              <th className="text-left font-semibold px-3 py-3">Code</th><th className="text-left font-semibold px-3 py-3">Status</th><th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map(e => (
              <Row key={e.id} e={e} open={editing === e.id} onToggle={() => setEditing(editing === e.id ? null : e.id)} onChanged={load} />
            ))}
            {rows.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-300">No partnerships logged yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({ e, open, onToggle, onChanged }: { e: Entry; open: boolean; onToggle: () => void; onChanged: () => void }) {
  const [status, setStatus] = useState(e.status || "Planned");
  const [code, setCode] = useState(e.affiliate_code || "");
  const [url, setUrl] = useState(e.content_url || "");
  const [busy, setBusy] = useState(false);
  async function save() { setBusy(true); await fetch("/api/partnerships/entries", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: e.id, status, affiliate_code: code, content_url: url }) }).catch(() => {}); setBusy(false); onToggle(); onChanged(); }
  async function remove() { if (!window.confirm(`Remove this partnership (${e.company || "—"})?`)) return; setBusy(true); await fetch(`/api/partnerships/entries?id=${e.id}`, { method: "DELETE" }).catch(() => {}); setBusy(false); onChanged(); }
  return (
    <>
      <tr className="hover:bg-slate-50/50">
        <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{mon(e.month_key)}</td>
        <td className="px-3 py-2 font-medium text-slate-700">{e.company || "—"}</td>
        <td className="px-3 py-2 text-slate-600">{e.brand || "—"}</td>
        <td className="px-3 py-2 text-slate-600 max-w-[240px] truncate" title={e.product_name ?? ""}>{e.product_name || "—"}</td>
        <td className="px-3 py-2 text-right text-slate-700">{e.qty ?? 1}</td>
        <td className="px-3 py-2 text-right font-semibold text-slate-800">{aud(e.total_cost)}</td>
        <td className="px-3 py-2 text-violet-700 font-mono text-[11px]">{e.affiliate_code || "—"}</td>
        <td className="px-3 py-2"><span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusCls(e.status)}`}>{e.status || "Planned"}</span></td>
        <td className="px-3 py-2 text-right"><button onClick={onToggle} className="text-xs text-emerald-600 hover:underline">{open ? "Close" : "Edit"}</button></td>
      </tr>
      {open && (
        <tr><td colSpan={9} className="px-3 pb-3 bg-slate-50/60">
          <div className="flex flex-wrap items-end gap-2 pt-2">
            <div><label className="text-[10px] font-semibold text-slate-400 uppercase block">Status</label>
              <select value={status} onChange={ev => setStatus(ev.target.value)} className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white">{STATUS.map(s => <option key={s}>{s}</option>)}</select></div>
            <div><label className="text-[10px] font-semibold text-slate-400 uppercase block">Affiliate code</label>
              <input value={code} onChange={ev => setCode(ev.target.value)} className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 w-36" /></div>
            <div className="flex-1 min-w-[200px]"><label className="text-[10px] font-semibold text-slate-400 uppercase block">Post / content link</label>
              <input value={url} onChange={ev => setUrl(ev.target.value)} placeholder="https://…" className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 w-full" /></div>
            <button onClick={save} disabled={busy} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 rounded-lg px-4 py-1.5">Save</button>
            <button onClick={remove} disabled={busy} className="text-xs text-rose-500 hover:underline px-2">Delete</button>
          </div>
        </td></tr>
      )}
    </>
  );
}

function AddForm({ products, onClose, onSaved }: { products: Product[]; onClose: () => void; onSaved: () => void }) {
  const [company, setCompany] = useState("");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Product | null>(null);
  const [qty, setQty] = useState("1");
  const [rrp, setRrp] = useState("");
  const [brand, setBrand] = useState("");
  const [code, setCode] = useState("");
  const [cash, setCash] = useState("");
  const [month, setMonth] = useState(INFLUENCER_FY_MONTHS[0].key);
  const [status, setStatus] = useState("Planned");
  const [busy, setBusy] = useState(false);
  const matches = search.trim().length < 2 ? [] : products.filter(p => `${p.product_name} ${p.style_code} ${p.brand}`.toLowerCase().includes(search.toLowerCase())).slice(0, 8);
  function pick(p: Product) { setPicked(p); setSearch(p.product_name); setBrand(p.brand || ""); setRrp(p.rrp != null ? String(p.rrp) : ""); }
  const valid = company.trim() && (picked || (brand && rrp));
  async function save() {
    setBusy(true);
    await fetch("/api/partnerships/entries", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month_key: month, company, brand, style_code: picked?.style_code || null, product_name: picked?.product_name || search || null, qty, rrp, cash_fee: cash, affiliate_code: code, status }) }).catch(() => {});
    setBusy(false); onSaved();
  }
  const inp = "w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400";
  return (
    <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm p-4">
      <div className="grid md:grid-cols-2 gap-3">
        <div><label className="text-[10px] font-semibold text-slate-400 uppercase">Company</label><input value={company} onChange={e => setCompany(e.target.value)} placeholder="e.g. Baby Boutique Co" className={inp} /></div>
        <div><label className="text-[10px] font-semibold text-slate-400 uppercase">Month</label>
          <select value={month} onChange={e => setMonth(e.target.value)} className={inp + " bg-white"}>{INFLUENCER_FY_MONTHS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}</select></div>
        <div className="md:col-span-2 relative">
          <label className="text-[10px] font-semibold text-slate-400 uppercase">Product</label>
          <input value={search} onChange={e => { setSearch(e.target.value); setPicked(null); }} placeholder="Search name or SKU…" className={inp} />
          {matches.length > 0 && !picked && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
              {matches.map(p => <button key={p.style_code} onClick={() => pick(p)} className="block w-full text-left text-sm px-3 py-2 hover:bg-emerald-50"><span className="text-slate-700">{p.product_name}</span><span className="text-gray-400 text-xs"> · {p.brand} · {aud(p.rrp)}</span></button>)}
            </div>
          )}
        </div>
        <div><label className="text-[10px] font-semibold text-slate-400 uppercase">Qty</label><input value={qty} onChange={e => setQty(e.target.value)} inputMode="numeric" className={inp} /></div>
        <div><label className="text-[10px] font-semibold text-slate-400 uppercase">Brand</label><input value={brand} onChange={e => setBrand(e.target.value)} placeholder="auto from product" className={inp} /></div>
        <div><label className="text-[10px] font-semibold text-slate-400 uppercase">RRP (incl GST)</label><input value={rrp} onChange={e => setRrp(e.target.value)} inputMode="decimal" placeholder="$" className={inp} /></div>
        <div><label className="text-[10px] font-semibold text-slate-400 uppercase">Cash fee (optional, excl GST)</label><input value={cash} onChange={e => setCash(e.target.value)} inputMode="decimal" placeholder="$0" className={inp} /></div>
        <div><label className="text-[10px] font-semibold text-slate-400 uppercase">Affiliate / discount code</label><input value={code} onChange={e => setCode(e.target.value)} placeholder="optional" className={inp} /></div>
        <div><label className="text-[10px] font-semibold text-slate-400 uppercase">Status</label><select value={status} onChange={e => setStatus(e.target.value)} className={inp + " bg-white"}>{STATUS.map(s => <option key={s}>{s}</option>)}</select></div>
      </div>
      <div className="flex justify-end gap-2 mt-3">
        <button onClick={onClose} className="text-sm text-slate-500 px-3 py-1.5">Cancel</button>
        <button onClick={save} disabled={!valid || busy} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 rounded-lg px-4 py-1.5">{busy ? "Saving…" : "Add partnership"}</button>
      </div>
      <p className="text-[10px] text-gray-300 mt-2">Cost is the product cost × qty (from the shared catalogue) plus any cash fee, tracked against budget.</p>
    </div>
  );
}
