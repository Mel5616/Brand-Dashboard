"use client";

import React from "react";
import { Chart as ChartJS, CategoryScale, LinearScale, LineElement, PointElement, Filler, Tooltip, Legend } from "chart.js";
import { Line } from "react-chartjs-2";
import { STORE_STATE, NON_STORE_LOCATIONS, resolveState, COLS, classifyBrand, classifyModel, isPram, MODEL_ORDER } from "@/lib/bbMappings";

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Filler, Tooltip, Legend);

const PRAM_GOLD = "#b8954a";
const fmtM = (n: number) => (Math.abs(n) >= 1e6 ? "$" + (n / 1e6).toFixed(2) + "M" : Math.abs(n) >= 1e3 ? "$" + (n / 1e3).toFixed(0) + "K" : "$" + Math.round(n).toLocaleString());
const fmtFull = (n: number) => "$" + Math.round(n).toLocaleString("en-AU");
const fmtU = (n: number) => (Math.abs(n) >= 1000 ? (n / 1000).toFixed(1) + "K" : Math.round(n).toLocaleString());
const num = (v: any) => { if (v == null) return 0; const n = Number(String(v).replace(/[^0-9.-]/g, "")); return isFinite(n) ? n : 0; };
const STATE_ORDER = ["NSW", "VIC", "QLD", "WA", "SA", "ACT", "TAS", "Online"];
const longDate = (d: string | null) => (d ? new Date(d + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "");

// Excel date at M4 → ISO. Handles Date objects, dd/mm/yyyy strings, and serials.
function parseWeekEnding(v: any): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "number") { const d = new Date(Date.UTC(1899, 11, 30) as any); d.setUTCDate(d.getUTCDate() + v); return d.toISOString().slice(0, 10); }
  const s = String(v || "").trim();
  const m = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  return iso ? iso[0] : null;
}

type BBData = {
  ok: boolean; needsSetup?: boolean; weeks: string[]; week: string | null;
  kpi?: any; states?: any[]; brands?: any[]; models?: any[]; stores?: any[];
  trends?: { weekly: any[]; byState: any[] };
};

export function BabyBunting({ canUpload }: { canUpload: boolean }) {
  const [data, setData] = React.useState<BBData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [scope, setScope] = React.useState<string>("ALL");
  const [week, setWeek] = React.useState<string | null>(null);
  const [modal, setModal] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState<string | null>(null);
  const [summary, setSummary] = React.useState<{ weeks: string[]; rows: number; unmapped: string[] } | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const load = React.useCallback((w?: string | null, s?: string) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (w) params.set("week", w);
    if (s && s !== "ALL") params.set("state", s);
    fetch("/api/bb?" + params.toString(), { cache: "no-store" }).then(r => r.json()).then((d: BBData) => {
      setData(d); if (d.week) setWeek(d.week); setLoading(false);
    }).catch(() => setLoading(false));
  }, []);
  React.useEffect(() => { load(week, scope); }, [scope, week, load]);

  // ── Parse one Baby Bunting export into DB rows ──────────────────────────────
  async function parseFile(file: File): Promise<{ week: string; rows: any[]; unmapped: Set<string> }> {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
    const ws = wb.Sheets[wb.SheetNames.find(n => /sell\s*through/i.test(n)) ?? wb.SheetNames[0]];
    const grid = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: true, defval: null });
    const wk = parseWeekEnding(grid?.[3]?.[12]);   // M4
    if (!wk) throw new Error(`${file.name}: couldn't read the week-ending date (cell M4).`);
    const rows: any[] = []; const unmapped = new Set<string>();
    let store: string | null = null;
    const cell = (r: any[], oneIndexed: number) => r[oneIndexed - 1];
    for (let i = 29; i < grid.length; i++) {
      const r = grid[i]; if (!r) continue;
      const c0 = cell(r, COLS.code), sup = cell(r, COLS.supplierCode), desc = cell(r, COLS.description);
      if (desc != null && String(desc).trim() === "SubTotal:") continue;
      const has = (v: any) => v != null && String(v).trim() !== "";
      if (has(c0) && !has(sup) && !has(desc)) { store = String(c0).trim(); continue; }   // group header
      if (!store || !has(sup) || !has(desc)) continue;                                    // not a product row
      const description = String(desc).trim();
      const brand = classifyBrand(description);
      const model = classifyModel(description, brand);
      if (!(store in STORE_STATE) && !NON_STORE_LOCATIONS.includes(store)) unmapped.add(store);
      rows.push({
        week_ending: wk, store, state: resolveState(store), code: String(c0).trim(),
        supplier_code: has(sup) ? String(sup).trim() : null, description, brand, model, is_pram: isPram(model),
        curr_retail: num(cell(r, COLS.currRetail)),
        wk_units: num(cell(r, COLS.wkUnits)), wk_sales: num(cell(r, COLS.wkSales)),
        soh_units: num(cell(r, COLS.sohUnits)), soh_value: num(cell(r, COLS.sohValue)),
        weeks_on_hand: num(cell(r, COLS.weeksOnHand)),
        cum_units: num(cell(r, COLS.cumUnits)), cum_sales: num(cell(r, COLS.cumSales)),
        cum_sellthru: num(cell(r, COLS.cumSellThru)), gp_cum: num(cell(r, COLS.gpCum)),
      });
    }
    return { week: wk, rows, unmapped };
  }

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return;
    setBusy(true); setSummary(null); setProgress("Reading files…");
    const loadedWeeks: string[] = []; let totalRows = 0; const allUnmapped = new Set<string>();
    try {
      const list = Array.from(files);
      for (let f = 0; f < list.length; f++) {
        setProgress(`Parsing ${list[f].name} (${f + 1}/${list.length})…`);
        const { week, rows, unmapped } = await parseFile(list[f]);
        unmapped.forEach(s => allUnmapped.add(s));
        for (let i = 0; i < rows.length; i += 2000) {
          setProgress(`Loading ${week} — ${Math.min(i + 2000, rows.length)}/${rows.length} rows…`);
          const res = await fetch("/api/bb", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows: rows.slice(i, i + 2000) }) }).then(r => r.json());
          if (!res.ok) throw new Error(res.needsSetup ? "Run supabase/add_bb_sell_through.sql first." : (res.error || "Save failed"));
        }
        loadedWeeks.push(week); totalRows += rows.length;
      }
      setSummary({ weeks: [...new Set(loadedWeeks)].sort(), rows: totalRows, unmapped: [...allUnmapped] });
      setProgress(null);
      setWeek(loadedWeeks.sort().at(-1) ?? null);
      load(loadedWeeks.sort().at(-1), scope);
    } catch (e: any) { setProgress("✗ " + (e.message || "Upload failed")); }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  if (loading && !data) return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center text-sm text-gray-400">Loading Baby Bunting…</div>;

  if (data?.needsSetup || (data && !data.weeks.length)) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 max-w-xl">
        <h2 className="font-semibold text-gray-800">Baby Bunting sell-through</h2>
        <p className="text-sm text-gray-500 mt-1">{data?.needsSetup ? <>Run <code className="bg-gray-100 px-1 rounded">supabase/add_bb_sell_through.sql</code> in Supabase, then upload your weekly exports.</> : "No weeks loaded yet — upload your Baby Bunting sell-through exports."}</p>
        {canUpload && <button onClick={() => setModal(true)} className="mt-4 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg px-4 py-2">Upload sell-through</button>}
        {modal && <UploadModal {...{ setModal, handleFiles, fileRef, busy, progress, summary }} />}
      </div>
    );
  }

  const k = data!.kpi ?? {};
  const sellThru = (k.cum_units + k.soh_units) > 0 ? (k.cum_units / (k.cum_units + k.soh_units)) * 100 : 0;
  const statesPresent = STATE_ORDER.filter(s => (data!.states || []).some((r: any) => r.state === s));
  const tabs = ["ALL", ...statesPresent];
  const brandColor = (b: string) => ({ UPPAbaby: "#0e7490", WonderFold: "#0891b2", Zazu: "#0ea5e9", BabyChic: "#2563eb" } as any)[b] || "#94a3b8";

  const kpis = [
    { l: "Week sales", v: fmtM(k.wk_sales), sub: `${fmtU(k.wk_units)} units`, hero: true },
    { l: "Rolling-year sales", v: fmtM(k.cum_sales), sub: `${fmtU(k.cum_units)} units · ex-tax` },
    { l: "Sell-through", v: sellThru.toFixed(0) + "%", sub: "rolling year" },
    { l: "Stock on hand", v: fmtM(k.soh_value), sub: `${fmtU(k.soh_units)} units` },
    { l: "Stores", v: String(k.stores), sub: scope === "ALL" ? "network" : scope },
  ];

  const weekly = data!.trends?.weekly ?? [];
  const trendReady = weekly.length >= 2;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <p className="text-xs text-gray-400">Retail partner analytics · rolling year, ex-tax</p>
          <select value={week ?? ""} onChange={e => setWeek(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer">
            {data!.weeks.map(w => <option key={w} value={w}>Week ending {longDate(w)}</option>)}
          </select>
        </div>
        {canUpload && <button onClick={() => setModal(true)} className="text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg px-4 py-2">↑ Upload weeks</button>}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {kpis.map(it => (
          <div key={it.l} className={`rounded-2xl border shadow-sm px-4 py-3 ${it.hero ? "bg-teal-50/60 border-teal-100" : "bg-white border-gray-100"}`}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{it.l}</p>
            <p className="text-2xl font-extrabold text-slate-900 mt-1 leading-none tabular-nums">{it.v}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">{it.sub}</p>
          </div>
        ))}
      </div>

      {/* State tabs */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mr-1">State</span>
        {tabs.map(t => (
          <button key={t} onClick={() => setScope(t)} className={`text-xs font-semibold rounded-lg px-3 py-1 transition ${scope === t ? "bg-teal-600 text-white" : "bg-gray-100 text-gray-500 hover:text-gray-700"}`}>{t === "ALL" ? "All AU" : t}</button>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* State bars / top stores */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-1">{scope === "ALL" ? "Sales by state" : `Top stores · ${scope}`}</p>
          <p className="text-xs text-gray-400 mb-3">Rolling year · ex-tax</p>
          {(() => {
            const rows = scope === "ALL"
              ? statesPresent.map(s => { const r = (data!.states || []).find((x: any) => x.state === s) || {}; return { name: s, cum: num(r.cum_sales), wk: num(r.wk_sales) }; })
              : [...(data!.stores || [])].slice(0, 10).map((r: any) => ({ name: r.store, cum: num(r.cum_sales), wk: num(r.wk_sales) }));
            const max = Math.max(...rows.map(r => r.cum), 1);
            return <div className="space-y-1.5">{rows.map(r => (
              <div key={r.name} className="flex items-center gap-3">
                <span className="text-xs font-semibold text-slate-600 w-28 truncate">{r.name}</span>
                <span className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden"><span className="block h-full rounded-full bg-teal-500" style={{ width: `${Math.max(r.cum / max * 100, 1)}%` }} /></span>
                <span className="text-xs font-bold text-slate-700 tabular-nums w-24 text-right">{fmtM(r.cum)}<span className="block text-[10px] font-normal text-gray-400">{fmtM(r.wk)} wk</span></span>
              </div>
            ))}</div>;
          })()}
        </div>

        {/* Brand split + stock health */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-1">Sales by brand</p>
          <p className="text-xs text-gray-400 mb-3">Rolling year · ex-tax</p>
          {(() => {
            const bs = [...(data!.brands || [])].filter((b: any) => num(b.cum_sales) > 0).sort((a: any, b: any) => num(b.cum_sales) - num(a.cum_sales));
            const tot = bs.reduce((s: number, b: any) => s + num(b.cum_sales), 0) || 1;
            return <>
              <div className="flex h-7 rounded-lg overflow-hidden">{bs.map((b: any) => { const pc = num(b.cum_sales) / tot * 100; return <span key={b.brand} className="flex items-center justify-center text-[11px] font-bold text-white" style={{ flex: num(b.cum_sales), background: brandColor(b.brand) }}>{pc > 8 ? Math.round(pc) + "%" : ""}</span>; })}</div>
              <div className="mt-3 space-y-1.5">{bs.map((b: any) => (
                <div key={b.brand} className="flex items-center gap-2 text-xs">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: brandColor(b.brand) }} />
                  <span className="text-slate-600 flex-1">{b.brand}</span>
                  <span className="text-gray-400">{fmtU(num(b.cum_units))} u</span>
                  <span className="font-bold text-slate-700 w-20 text-right">{fmtM(num(b.cum_sales))}</span>
                </div>
              ))}</div>
            </>;
          })()}
          <div className="border-t border-gray-100 mt-4 pt-3 flex items-center gap-4">
            <div className="relative w-16 h-16 shrink-0 rounded-full" style={{ background: `conic-gradient(#0891b2 ${sellThru * 3.6}deg, #e5e7eb 0)` }}>
              <span className="absolute inset-[6px] rounded-full bg-white flex items-center justify-center text-xs font-bold text-slate-800">{sellThru.toFixed(0)}%</span>
            </div>
            <div><p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Stock health</p><p className="text-sm text-gray-500 mt-0.5">{fmtM(k.soh_value)} on hand · {fmtU(k.soh_units)} units · {sellThru.toFixed(0)}% sold through</p></div>
          </div>
        </div>
      </div>

      {/* Product matrix */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 overflow-x-auto">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-1">Sales by product <span className="ml-1 text-[10px] font-semibold" style={{ color: PRAM_GOLD }}>● pram lines highlighted</span></p>
        <p className="text-xs text-gray-400 mb-3">Units &amp; value · rolling year</p>
        <table className="w-full text-xs min-w-[560px]">
          <thead><tr className="text-gray-400 border-b border-gray-200">
            <th className="text-left font-semibold uppercase tracking-wide text-[10px] py-2">Model</th>
            <th className="text-right font-semibold uppercase tracking-wide text-[10px]">Wk units</th>
            <th className="text-right font-semibold uppercase tracking-wide text-[10px]">Wk sales</th>
            <th className="text-right font-semibold uppercase tracking-wide text-[10px]">Yr units</th>
            <th className="text-right font-semibold uppercase tracking-wide text-[10px]">Yr sales</th>
            <th className="text-right font-semibold uppercase tracking-wide text-[10px]">Sell-thru</th>
          </tr></thead>
          <tbody>
            {(() => {
              const byModel = new Map((data!.models || []).map((m: any) => [m.model, m]));
              const ordered = [...MODEL_ORDER.filter(m => byModel.has(m)), ...(data!.models || []).map((m: any) => m.model).filter((m: string) => !MODEL_ORDER.includes(m as any))];
              return [...new Set(ordered)].map(name => {
                const m: any = byModel.get(name); if (!m) return null;
                const st = num(m.sell_thru) * 100;
                return (
                  <tr key={name} className="border-b border-gray-50" style={m.is_pram ? { background: PRAM_GOLD + "10" } : undefined}>
                    <td className="py-1.5"><span className="flex items-center gap-2">{m.is_pram && <span className="w-1.5 h-1.5 rounded-full" style={{ background: PRAM_GOLD }} />}<span className={`font-semibold ${m.is_pram ? "text-slate-800" : "text-slate-600"}`}>{name}</span></span></td>
                    <td className="text-right tabular-nums text-slate-600">{fmtU(num(m.wk_units))}</td>
                    <td className="text-right tabular-nums text-slate-600">{fmtM(num(m.wk_sales))}</td>
                    <td className="text-right tabular-nums text-slate-600">{fmtU(num(m.cum_units))}</td>
                    <td className="text-right tabular-nums font-semibold text-slate-800">{fmtM(num(m.cum_sales))}</td>
                    <td className="text-right tabular-nums text-slate-500">{st > 0 ? st.toFixed(0) + "%" : "—"}</td>
                  </tr>
                );
              });
            })()}
          </tbody>
        </table>
      </div>

      {/* Store leaderboard */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 overflow-x-auto">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-3">Store leaderboard <span className="font-normal text-gray-400 normal-case tracking-normal">· ranked by rolling-year sales</span></p>
        <table className="w-full text-xs min-w-[520px]">
          <thead><tr className="text-gray-400 border-b border-gray-200"><th className="text-left font-semibold uppercase tracking-wide text-[10px] py-2 w-8">#</th><th className="text-left font-semibold uppercase tracking-wide text-[10px]">Store</th><th className="text-left font-semibold uppercase tracking-wide text-[10px]">State</th><th className="text-right font-semibold uppercase tracking-wide text-[10px]">Wk sales</th><th className="text-right font-semibold uppercase tracking-wide text-[10px]">Yr sales</th><th className="text-right font-semibold uppercase tracking-wide text-[10px]">SOH</th></tr></thead>
          <tbody>{[...(data!.stores || [])].slice(0, 20).map((r: any, i: number) => (
            <tr key={r.store} className="border-b border-gray-50">
              <td className="py-1.5 text-gray-300 font-bold">{i + 1}</td>
              <td className="font-semibold text-slate-700">{r.store}</td>
              <td className="text-gray-500">{r.state}</td>
              <td className="text-right tabular-nums text-slate-600">{fmtM(num(r.wk_sales))}</td>
              <td className="text-right tabular-nums font-semibold text-slate-800">{fmtM(num(r.cum_sales))}</td>
              <td className="text-right tabular-nums text-gray-500">{fmtM(num(r.soh_value))}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      {/* Trends (unlock at 2+ weeks) */}
      {trendReady ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-3">Weekly trend <span className="font-normal text-gray-400 normal-case tracking-normal">· {weekly.length} weeks</span></p>
          <div className="h-56">
            <Line data={{
              labels: weekly.map((w: any) => longDate(w.week_ending)),
              datasets: [
                { label: "Weekly sales", data: weekly.map((w: any) => num(w.wk_sales)), borderColor: "#0891b2", backgroundColor: "#0891b220", borderWidth: 2.5, pointRadius: 2, tension: 0.3, fill: true, yAxisID: "y" },
                { label: "Rolling year", data: weekly.map((w: any) => num(w.cum_sales)), borderColor: "#94a3b8", borderDash: [5, 4], borderWidth: 2, pointRadius: 0, tension: 0.3, yAxisID: "y1" },
              ],
            }} options={{ responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false }, plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 }, usePointStyle: true } }, tooltip: { callbacks: { label: (c: any) => ` ${c.dataset.label}: ${fmtFull(c.parsed.y ?? 0)}` } } }, scales: { x: { grid: { display: false }, ticks: { font: { size: 10 }, color: "#9ca3af" } }, y: { position: "left", ticks: { callback: (v: any) => fmtM(v), font: { size: 10 }, color: "#9ca3af" }, grid: { color: "#f3f4f6" } }, y1: { position: "right", ticks: { callback: (v: any) => fmtM(v), font: { size: 10 }, color: "#cbd5e1" }, grid: { display: false } } } }} />
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-center text-xs text-gray-400">Weekly-trend and month-on-month charts unlock automatically once a second week is loaded.</div>
      )}

      {modal && <UploadModal {...{ setModal, handleFiles, fileRef, busy, progress, summary }} />}
    </div>
  );
}

function UploadModal({ setModal, handleFiles, fileRef, busy, progress, summary }: any) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => !busy && setModal(false)}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
        <h2 className="font-semibold text-gray-800">Upload weekly sell-through</h2>
        <p className="text-xs text-gray-400 mt-0.5 mb-4">Select one or many Baby Bunting <code className="bg-gray-100 px-1 rounded">Sell_Through.xlsx</code> exports — each is dated from cell M4 and loaded as its own week (re-uploading a week replaces it).</p>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" multiple className="hidden" onChange={e => handleFiles(e.target.files)} />
        <button onClick={() => fileRef.current?.click()} disabled={busy} className="w-full border-2 border-dashed border-gray-200 rounded-xl py-8 text-sm text-gray-500 hover:border-teal-300 hover:text-teal-600 disabled:opacity-60">
          {busy ? "Working…" : <><b>Choose .xlsx files</b> — you can pick many weeks at once</>}
        </button>
        {progress && <p className={`text-xs mt-3 ${progress.startsWith("✗") ? "text-rose-500" : "text-gray-500"}`}>{progress}</p>}
        {summary && (
          <div className="mt-3 text-xs text-slate-600 bg-teal-50/60 border border-teal-100 rounded-lg p-3">
            ✓ Loaded {summary.weeks.length} week{summary.weeks.length === 1 ? "" : "s"} ({summary.weeks.map(longDate).join(", ")}) · {summary.rows.toLocaleString()} rows.
            {summary.unmapped.length > 0 && <p className="text-amber-600 mt-1">⚠ Unmapped stores (bucketed to Online — add to STORE_STATE): {summary.unmapped.join(", ")}</p>}
          </div>
        )}
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={() => !busy && setModal(false)} className="text-sm text-gray-400 hover:text-gray-600 px-3 py-1.5">{summary ? "Close" : "Cancel"}</button>
        </div>
      </div>
    </div>
  );
}
