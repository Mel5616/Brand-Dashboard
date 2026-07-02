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

type Item = { style_code: string | null; product_name: string | null; brand: string | null; qty: number; rrp: number | null; unit_cost: number | null; line_cost: number | null; sale_price: number | null; line_revenue: number | null };
type Entry = {
  id: number; month_key: string; company: string | null; brand: string | null; style_code: string | null;
  product_name: string | null; qty: number | null; rrp: number | null; gifting_cost: number | null;
  cash_fee: number | null; total_cost: number | null; affiliate_code: string | null; status: string | null; content_url: string | null;
  kind: string | null; revenue: number | null; contact_name: string | null; email: string | null; address: string | null; items: Item[] | null;
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
  const [editEntry, setEditEntry] = useState<Entry | null>(null);

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
  const totalRevenue = entries.reduce((s, e) => s + (Number(e.revenue) || 0), 0);
  const saleCount = entries.filter(e => e.kind === "sale").length;
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
        <button onClick={() => { setEditEntry(null); setAdding(a => !a); }} className="ml-auto text-xs font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-3 py-2">{adding ? "Close" : "+ Add partnership"}</button>
      </div>

      {(adding || editEntry) && (
        <PartnershipForm
          products={products}
          entry={editEntry}
          onClose={() => { setAdding(false); setEditEntry(null); }}
          onSaved={() => { setAdding(false); setEditEntry(null); load(); }}
        />
      )}

      {/* KPI strip: gifted expense vs sales revenue */}
      {entries.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Gifted (expense)", value: aud(totalCost), sub: `${entries.length - saleCount} free`, accent: "#e11d48" },
            { label: "Sales revenue", value: aud(totalRevenue), sub: `${saleCount} sale${saleCount === 1 ? "" : "s"}`, accent: "#10b981" },
            { label: "Net", value: aud(totalRevenue - totalCost), sub: "revenue − expense", accent: "#6366f1" },
            { label: "Partnerships", value: String(entries.length), sub: "logged", accent: "#0ea5e9" },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: k.accent }} />{k.label}</p>
              <p className="text-xl font-bold text-slate-800 mt-1">{k.value}</p>
              <p className="text-[11px] text-gray-400">{k.sub}</p>
            </div>
          ))}
        </div>
      )}

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
              <th className="text-right font-semibold px-3 py-3">Qty</th><th className="text-left font-semibold px-3 py-3">Type</th>
              <th className="text-right font-semibold px-3 py-3">Cost</th><th className="text-right font-semibold px-3 py-3">Revenue</th>
              <th className="text-left font-semibold px-3 py-3">Code</th><th className="text-left font-semibold px-3 py-3">Status</th><th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map(e => (
              <Row key={e.id} e={e} onEdit={() => { setAdding(false); setEditEntry(e); }} />
            ))}
            {rows.length === 0 && <tr><td colSpan={11} className="px-4 py-8 text-center text-slate-300">No partnerships logged yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({ e, onEdit }: { e: Entry; onEdit: () => void }) {
  const isSale = e.kind === "sale";
  const items = e.items && e.items.length ? e.items : null;
  const productTitle = items ? items.map(i => `${i.product_name ?? "Product"} ×${i.qty}`).join("\n") : (e.product_name ?? "");
  const productLabel = items && items.length > 1 ? `${items[0].product_name ?? "Product"} +${items.length - 1} more` : (e.product_name || "—");
  return (
    <tr className="hover:bg-slate-50/50">
      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{mon(e.month_key)}</td>
      <td className="px-3 py-2 font-medium text-slate-700">{e.company || "—"}{e.contact_name ? <span className="block text-[11px] font-normal text-gray-400">{e.contact_name}</span> : null}</td>
      <td className="px-3 py-2 text-slate-600">{e.brand || "—"}</td>
      <td className="px-3 py-2 text-slate-600 max-w-[240px] truncate" title={productTitle}>{productLabel}</td>
      <td className="px-3 py-2 text-right text-slate-700">{e.qty ?? 1}</td>
      <td className="px-3 py-2"><span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${isSale ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-600"}`}>{isSale ? "Sale" : "Free"}</span></td>
      <td className="px-3 py-2 text-right font-semibold text-slate-800">{isSale ? (Number(e.total_cost) ? aud(e.total_cost) : "—") : aud(e.total_cost)}</td>
      <td className="px-3 py-2 text-right font-semibold text-emerald-700">{isSale ? aud(e.revenue) : "—"}</td>
      <td className="px-3 py-2 text-violet-700 font-mono text-[11px]">{e.affiliate_code || "—"}</td>
      <td className="px-3 py-2"><span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusCls(e.status)}`}>{e.status || "Planned"}</span></td>
      <td className="px-3 py-2 text-right"><button onClick={onEdit} className="text-xs text-emerald-600 hover:underline">Edit</button></td>
    </tr>
  );
}

type Line = { key: number; style_code: string | null; search: string; picked: Product | null; brand: string; rrp: string; qty: string; salePrice: string };
const blankLine = (key: number): Line => ({ key, style_code: null, search: "", picked: null, brand: "", rrp: "", qty: "1", salePrice: "" });
// Reconstruct editable lines from a saved entry's items (or its legacy single product).
function linesFromEntry(e: Entry): Line[] {
  const src: Item[] = e.items && e.items.length ? e.items
    : [{ style_code: e.style_code, product_name: e.product_name, brand: e.brand, qty: e.qty ?? 1, rrp: e.rrp, unit_cost: null, line_cost: null, sale_price: null, line_revenue: null }];
  return src.map((i, k) => ({
    key: k, style_code: i.style_code ?? null, search: i.product_name ?? "", picked: null,
    brand: i.brand ?? "", rrp: i.rrp != null ? String(i.rrp) : "", qty: String(i.qty ?? 1),
    salePrice: i.sale_price != null ? String(i.sale_price) : (i.rrp != null ? String(i.rrp) : ""),
  }));
}

function PartnershipForm({ products, entry, onClose, onSaved, onDeleted }: { products: Product[]; entry?: Entry | null; onClose: () => void; onSaved: () => void; onDeleted?: () => void }) {
  const [company, setCompany] = useState(entry?.company ?? "");
  const [contactName, setContactName] = useState(entry?.contact_name ?? "");
  const [email, setEmail] = useState(entry?.email ?? "");
  const [address, setAddress] = useState(entry?.address ?? "");
  const [kind, setKind] = useState<"gift" | "sale">(entry?.kind === "sale" ? "sale" : "gift");
  const [code, setCode] = useState(entry?.affiliate_code ?? "");
  const [url, setUrl] = useState(entry?.content_url ?? "");
  const [cash, setCash] = useState(entry?.cash_fee != null ? String(entry.cash_fee) : "");
  const [month, setMonth] = useState(entry?.month_key ?? INFLUENCER_FY_MONTHS[0].key);
  const [status, setStatus] = useState(entry?.status ?? "Planned");
  const [busy, setBusy] = useState(false);
  const initLines = entry ? linesFromEntry(entry) : [blankLine(0)];
  const [nextKey, setNextKey] = useState(initLines.length);
  const [lines, setLines] = useState<Line[]>(initLines);

  function setLine(key: number, patch: Partial<Line>) { setLines(ls => ls.map(l => l.key === key ? { ...l, ...patch } : l)); }
  function addLine() { setLines(ls => [...ls, blankLine(nextKey)]); setNextKey(k => k + 1); }
  function removeLine(key: number) { setLines(ls => ls.length > 1 ? ls.filter(l => l.key !== key) : ls); }
  function pick(key: number, p: Product) { setLine(key, { picked: p, style_code: p.style_code, search: p.product_name, brand: p.brand || "", rrp: p.rrp != null ? String(p.rrp) : "", salePrice: p.rrp != null ? String(p.rrp) : "" }); }

  const lineValid = (l: Line) => !!(l.picked || (l.brand && l.rrp));
  const validLines = lines.filter(lineValid);
  const valid = company.trim() && validLines.length > 0;

  async function save() {
    setBusy(true);
    const items = validLines.map(l => ({
      style_code: l.picked?.style_code ?? l.style_code ?? null,
      product_name: l.picked?.product_name || l.search || null,
      brand: l.brand, qty: l.qty, rrp: l.rrp,
      sale_price: kind === "sale" ? (l.salePrice || l.rrp) : null,
    }));
    const payload: any = { month_key: month, company, contact_name: contactName, email, address, kind, items, cash_fee: cash, affiliate_code: code, content_url: url, status };
    if (entry) payload.id = entry.id;
    await fetch("/api/partnerships/entries", { method: entry ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload) }).catch(() => {});
    setBusy(false); onSaved();
  }
  async function remove() {
    if (!entry || !window.confirm(`Remove this partnership (${entry.company || "—"})?`)) return;
    setBusy(true);
    await fetch(`/api/partnerships/entries?id=${entry.id}`, { method: "DELETE" }).catch(() => {});
    setBusy(false); (onDeleted ?? onSaved)();
  }
  const inp = "w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400";
  const lbl = "text-[10px] font-semibold text-slate-400 uppercase";
  return (
    <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-slate-700">{entry ? "Edit partnership" : "Add partnership"}</h3>
        {entry && <span className="text-[11px] text-gray-400">{mon(entry.month_key)} · {entry.company || "—"}</span>}
      </div>
      {/* Sale vs Free */}
      <div className="inline-flex bg-gray-100 rounded-lg p-0.5 mb-3">
        {([["gift", "Free product"], ["sale", "Sale"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setKind(id)} className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all ${kind === id ? "bg-white shadow-sm text-slate-700" : "text-gray-400 hover:text-gray-600"}`}>{label}</button>
        ))}
        <span className="self-center px-2 text-[11px] text-gray-400">{kind === "sale" ? "counts as revenue" : "counts as expense"}</span>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div><label className={lbl}>Company</label><input value={company} onChange={e => setCompany(e.target.value)} placeholder="e.g. Baby Boutique Co" className={inp} /></div>
        <div><label className={lbl}>Month</label>
          <select value={month} onChange={e => setMonth(e.target.value)} className={inp + " bg-white"}>{INFLUENCER_FY_MONTHS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}</select></div>
        <div><label className={lbl}>Contact name</label><input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="optional" className={inp} /></div>
        <div><label className={lbl}>Email</label><input value={email} onChange={e => setEmail(e.target.value)} placeholder="optional" type="email" className={inp} /></div>
        <div className="md:col-span-2"><label className={lbl}>Address</label><input value={address} onChange={e => setAddress(e.target.value)} placeholder="optional — where to ship" className={inp} /></div>
      </div>

      {/* Product line items */}
      <div className="mt-4">
        <label className={lbl}>Products</label>
        <div className="space-y-2 mt-1">
          {lines.map(l => {
            const matches = l.search.trim().length < 2 || l.picked ? [] : products.filter(p => `${p.product_name} ${p.style_code} ${p.brand}`.toLowerCase().includes(l.search.toLowerCase())).slice(0, 8);
            return (
              <div key={l.key} className="flex flex-wrap md:flex-nowrap items-start gap-2 bg-slate-50/60 rounded-lg p-2">
                <div className="relative flex-1 min-w-[200px]">
                  <input value={l.search} onChange={e => setLine(l.key, { search: e.target.value, picked: null })} placeholder="Search product name or SKU…" className={inp} />
                  {matches.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                      {matches.map(p => <button key={p.style_code} onClick={() => pick(l.key, p)} className="block w-full text-left text-sm px-3 py-2 hover:bg-emerald-50"><span className="text-slate-700">{p.product_name}</span><span className="text-gray-400 text-xs"> · {p.brand} · {aud(p.rrp)}</span></button>)}
                    </div>
                  )}
                </div>
                <input value={l.brand} onChange={e => setLine(l.key, { brand: e.target.value })} placeholder="Brand" className={inp + " md:w-28"} title="Brand (auto from product)" />
                <input value={l.qty} onChange={e => setLine(l.key, { qty: e.target.value })} inputMode="numeric" placeholder="Qty" className={inp + " md:w-16"} title="Qty" />
                <input value={l.rrp} onChange={e => setLine(l.key, { rrp: e.target.value })} inputMode="decimal" placeholder="RRP $" className={inp + " md:w-24"} title="RRP incl GST" />
                {kind === "sale" && <input value={l.salePrice} onChange={e => setLine(l.key, { salePrice: e.target.value })} inputMode="decimal" placeholder="Sale $" className={inp + " md:w-24"} title="Sale price incl GST (per unit)" />}
                <button onClick={() => removeLine(l.key)} disabled={lines.length === 1} className="text-rose-400 hover:text-rose-600 disabled:opacity-30 px-2 py-2 text-lg leading-none" title="Remove product">×</button>
              </div>
            );
          })}
        </div>
        <button onClick={addLine} className="mt-2 text-xs font-semibold text-emerald-600 hover:underline">+ Add another product</button>
      </div>

      <div className="grid md:grid-cols-3 gap-3 mt-4">
        <div><label className={lbl}>Cash fee (optional, excl GST)</label><input value={cash} onChange={e => setCash(e.target.value)} inputMode="decimal" placeholder="$0" className={inp} /></div>
        <div><label className={lbl}>Affiliate / discount code</label><input value={code} onChange={e => setCode(e.target.value)} placeholder="optional" className={inp} /></div>
        <div><label className={lbl}>Status</label><select value={status} onChange={e => setStatus(e.target.value)} className={inp + " bg-white"}>{STATUS.map(s => <option key={s}>{s}</option>)}</select></div>
        <div className="md:col-span-3"><label className={lbl}>Post / content link</label><input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://… (optional)" className={inp} /></div>
      </div>

      <div className="flex items-center gap-2 mt-3">
        {entry && <button onClick={remove} disabled={busy} className="text-xs text-rose-500 hover:underline mr-auto">Delete</button>}
        <button onClick={onClose} className="text-sm text-slate-500 px-3 py-1.5 ml-auto">Cancel</button>
        <button onClick={save} disabled={!valid || busy} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 rounded-lg px-4 py-1.5">{busy ? "Saving…" : entry ? "Save changes" : "Add partnership"}</button>
      </div>
      <p className="text-[10px] text-gray-300 mt-2">{kind === "sale" ? "Sale — revenue is the sale price × qty across all products (income)." : "Free — cost is each product's catalogue cost × qty plus any cash fee, tracked against budget (expense)."}</p>
    </div>
  );
}
