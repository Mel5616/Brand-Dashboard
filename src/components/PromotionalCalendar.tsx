"use client";

import { useEffect, useMemo, useState } from "react";

type Promo = {
  id: number; brand_id: number | null; brand: string;
  period_start: string; period_end: string;
  channel: string | null; price: string | null; note: string | null; source: string;
};
type Brand = { id: number; name: string };

const PALETTE = ["#4f9d86", "#cc7a57", "#5b86b0", "#8a79ad", "#c97f96", "#73a9a0", "#b8954a", "#6f7a87"];
function channelColor(ch: string | null) {
  const s = (ch || "").toLowerCase();
  if (s.includes("amazon")) return "#cc7a57";
  if (s.includes("baby bunting")) return "#4f9d86";
  if (s.includes("jb hi")) return "#5b86b0";
  let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
const d = (s: string) => new Date(s + "T00:00:00");
const fmt = (s: string) => d(s).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function PromotionalCalendar({ canEdit, brands }: { canEdit: boolean; brands: Brand[] }) {
  const [promos, setPromos] = useState<Promo[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [brandF, setBrandF] = useState("");
  const [channelF, setChannelF] = useState("");
  const [editing, setEditing] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    const r = await fetch("/api/promotions").then(x => x.json()).catch(() => ({ ok: false }));
    setLoading(false);
    if (!r.ok) { setNeedsSetup(true); return; }
    if (r.needsSetup) { setNeedsSetup(true); return; }
    setPromos(r.items);
  }
  useEffect(() => { load(); }, []);

  const channels = useMemo(() => Array.from(new Set(promos.map(p => p.channel).filter(Boolean))) as string[], [promos]);
  const filtered = useMemo(() => promos.filter(p =>
    (!brandF || p.brand === brandF) && (!channelF || p.channel === channelF)), [promos, brandF, channelF]);

  // Timeline span from the data (fallback to a year if empty).
  const { min, max, monthCols } = useMemo(() => {
    if (promos.length === 0) {
      const now = new Date(); const mn = new Date(now.getFullYear(), 0, 1); const mx = new Date(now.getFullYear(), 11, 31);
      return { min: mn, max: mx, monthCols: [] as { label: string; left: number }[] };
    }
    const starts = promos.map(p => +d(p.period_start)); const ends = promos.map(p => +d(p.period_end));
    const mn = new Date(Math.min(...starts)); const mx = new Date(Math.max(...ends));
    mn.setDate(1); mx.setMonth(mx.getMonth() + 1, 0);
    const span = +mx - +mn;
    const cols: { label: string; left: number }[] = [];
    const cur = new Date(mn);
    while (cur <= mx) { cols.push({ label: `${MONTHS[cur.getMonth()]} ${String(cur.getFullYear()).slice(2)}`, left: (+cur - +mn) / span * 100 }); cur.setMonth(cur.getMonth() + 1); }
    return { min: mn, max: mx, monthCols: cols };
  }, [promos]);
  const span = +max - +min || 1;
  const pos = (s: string) => (+d(s) - +min) / span * 100;

  const byBrand = useMemo(() => {
    const m = new Map<string, Promo[]>();
    for (const p of filtered) { (m.get(p.brand) || m.set(p.brand, []).get(p.brand)!).push(p); }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  if (loading) return <div className="text-sm text-slate-400 py-10 text-center">Loading promotions…</div>;
  if (needsSetup) return (
    <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl p-4">
      No promotions yet. Run <code>add_promotions.sql</code> in Supabase, then sync the Promo Tracker.
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <select value={brandF} onChange={e => setBrandF(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white">
          <option value="">All brands</option>
          {Array.from(new Set(promos.map(p => p.brand))).sort().map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <select value={channelF} onChange={e => setChannelF(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white">
          <option value="">All retailers</option>
          {channels.sort().map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="text-xs text-slate-400 ml-auto">{filtered.length} promo periods</span>
      </div>

      {/* Timeline */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 overflow-x-auto">
        <div className="min-w-[760px]">
          {/* month header */}
          <div className="relative h-5 ml-32 mb-2 border-b border-gray-100">
            {monthCols.map((m, i) => (
              <span key={i} className="absolute text-[10px] font-semibold text-slate-400 -translate-x-1/2" style={{ left: `${m.left}%` }}>{m.label}</span>
            ))}
          </div>
          {byBrand.map(([brand, ps]) => (
            <div key={brand} className="flex items-center h-9 border-b border-gray-50 last:border-0">
              <div className="w-32 shrink-0 text-xs font-semibold text-slate-600 truncate pr-2">{brand}</div>
              <div className="relative flex-1 h-6">
                {ps.map(p => {
                  const left = pos(p.period_start); const right = pos(p.period_end);
                  return (
                    <button key={p.id} onClick={() => canEdit && setEditing(editing === p.id ? null : p.id)}
                      title={`${p.channel || "Sale"} · ${fmt(p.period_start)}–${fmt(p.period_end)}${p.price ? " · " + p.price : ""}`}
                      className="absolute top-0.5 h-5 rounded text-[9px] text-white font-medium px-1 truncate flex items-center"
                      style={{ left: `${left}%`, width: `${Math.max(right - left, 1.2)}%`, background: channelColor(p.channel), cursor: canEdit ? "pointer" : "default" }}>
                      {p.price || p.channel || ""}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {byBrand.length === 0 && <div className="text-sm text-slate-400 py-6 text-center">No promotions match.</div>}
        </div>
      </div>

      {/* Editable list — enter pricing per promo */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-400 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left font-semibold px-4 py-3">Brand</th>
              <th className="text-left font-semibold px-4 py-3">Dates</th>
              <th className="text-left font-semibold px-4 py-3">Retailer / channel</th>
              <th className="text-left font-semibold px-4 py-3">Price / offer</th>
              {canEdit && <th className="px-4 py-3"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map(p => (
              <PromoRow key={p.id} p={p} canEdit={canEdit} open={editing === p.id}
                onToggle={() => setEditing(editing === p.id ? null : p.id)} onSaved={load} />
            ))}
            {filtered.length === 0 && <tr><td colSpan={canEdit ? 5 : 4} className="px-4 py-8 text-center text-slate-300">No promotions.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PromoRow({ p, canEdit, open, onToggle, onSaved }: { p: Promo; canEdit: boolean; open: boolean; onToggle: () => void; onSaved: () => void }) {
  const [price, setPrice] = useState(p.price || "");
  const [note, setNote] = useState(p.note || "");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    await fetch("/api/promotions", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id, price, note }) }).catch(() => {});
    setBusy(false); onToggle(); onSaved();
  }
  async function remove() {
    if (!confirm("Delete this promo?")) return;
    setBusy(true);
    await fetch(`/api/promotions?id=${p.id}`, { method: "DELETE" }).catch(() => {});
    setBusy(false); onSaved();
  }
  return (
    <>
      <tr>
        <td className="px-4 py-2.5 font-medium text-slate-700">{p.brand}{p.source === "manual" && <span className="ml-1 text-[9px] uppercase text-slate-300">manual</span>}</td>
        <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{fmt(p.period_start)} – {fmt(p.period_end)}</td>
        <td className="px-4 py-2.5 text-slate-500">{p.channel || "—"}</td>
        <td className="px-4 py-2.5">{p.price ? <span className="font-medium text-slate-700">{p.price}</span> : <span className="text-slate-300">—</span>}</td>
        {canEdit && <td className="px-4 py-2.5 text-right"><button onClick={onToggle} className="text-xs text-emerald-600 hover:underline">{open ? "Close" : "Edit"}</button></td>}
      </tr>
      {open && canEdit && (
        <tr><td colSpan={5} className="px-4 pb-3 bg-slate-50/60">
          <div className="flex flex-wrap items-end gap-2 pt-2">
            <div><label className="text-[10px] font-semibold text-slate-400 uppercase block">Price / offer</label><input value={price} onChange={e => setPrice(e.target.value)} placeholder='e.g. "20% off" or "$199"' className="text-sm border border-gray-200 rounded-lg px-3 py-2 w-44" /></div>
            <div className="flex-1 min-w-[180px]"><label className="text-[10px] font-semibold text-slate-400 uppercase block">Note</label><input value={note} onChange={e => setNote(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-3 py-2 w-full" /></div>
            <button onClick={save} disabled={busy} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 rounded-lg px-4 py-2">Save</button>
            <button onClick={remove} disabled={busy} className="text-xs text-rose-500 hover:underline px-2">Delete</button>
          </div>
        </td></tr>
      )}
    </>
  );
}
