"use client";

import React from "react";
import { Chart as ChartJS, CategoryScale, LinearScale, LineElement, BarElement, PointElement, Filler, Tooltip, Legend } from "chart.js";
import { Line, Bar } from "react-chartjs-2";
import { STORE_STATE, NON_STORE_LOCATIONS, resolveState, COLS, classifyBrand, classifyModel, isPram, MODEL_ORDER } from "@/lib/bbMappings";
import { AustraliaMap } from "./AustraliaMap";

ChartJS.register(CategoryScale, LinearScale, LineElement, BarElement, PointElement, Filler, Tooltip, Legend);

const PRAM_GOLD = "#b8954a";
const fmtM = (n: number) => (Math.abs(n) >= 1e6 ? "$" + (n / 1e6).toFixed(2) + "M" : Math.abs(n) >= 1e3 ? "$" + (n / 1e3).toFixed(0) + "K" : "$" + Math.round(n).toLocaleString());
const fmtFull = (n: number) => "$" + Math.round(n).toLocaleString("en-AU");
const fmtU = (n: number) => (Math.abs(n) >= 1000 ? (n / 1000).toFixed(1) + "K" : Math.round(n).toLocaleString());
const num = (v: any) => { if (v == null) return 0; const n = Number(String(v).replace(/[^0-9.-]/g, "")); return isFinite(n) ? n : 0; };
const STATE_ORDER = ["NSW", "VIC", "QLD", "WA", "SA", "ACT", "TAS", "Online"];
// BB uses short state codes; AustraliaMap keys on the full province name.
const STATE_FULLNAME: Record<string, string> = {
  NSW: "New South Wales", VIC: "Victoria", QLD: "Queensland", WA: "Western Australia",
  SA: "South Australia", ACT: "Australian Capital Territory", TAS: "Tasmania", NT: "Northern Territory",
};
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
  ok: boolean; needsSetup?: boolean; transient?: boolean; weeks: string[]; week: string | null;
  mode?: "week" | "month"; period?: string | null; periods?: string[]; weekCount?: number;
  kpi?: any; states?: any[]; brands?: any[]; models?: any[]; stores?: any[]; pramByState?: any[]; colours?: Record<string, any[]>;
  trends?: { weekly: any[]; byState: any[]; byBrand: any[]; byModel: any[] };
  movers?: { gainers: any[]; decliners: any[]; prevWeek: string | null };
};

const monthLabel = (mk: string) => new Date(mk + "-01T00:00:00").toLocaleDateString("en-AU", { month: "short", year: "2-digit" });

// UPPAbaby colourways are named after people — show just the name.
const UPPA_NAMES = ["Jake", "Liam", "Greyson", "Evelyn", "Owen", "Nori", "Savannah", "Ada", "James", "Dillan", "Dylan", "Stella", "Gwen", "Anthony", "Emmett", "Taylor", "Jordan", "Noa", "Bryce", "Declan", "Reed", "Alice", "Hazel", "William", "Theo", "Kate", "Sasha", "Gregory", "Lucy", "Finn", "Aria", "Gemma", "Ridley", "Robby", "Maxwell", "Beckett", "Sierra", "Kendall", "Rylie", "Hazlen"];
function colourLabel(desc: string): string {
  const U = (desc || "").toUpperCase();
  for (const n of UPPA_NAMES) if (new RegExp(`\\b${n.toUpperCase()}\\b`).test(U)) return n;
  // fallback: last real word (parenthetical names, unknowns)
  const w = (desc || "").replace(/-?\s*ONLINE ONLY.*/i, "").replace(/[()]/g, " ").trim().split(/\s+/).filter(x => /^[A-Za-z]{3,}$/.test(x));
  const last = w[w.length - 1];
  return last ? last[0].toUpperCase() + last.slice(1).toLowerCase() : (desc || "").slice(0, 20);
}

export function BabyBunting({ canUpload }: { canUpload: boolean }) {
  const [data, setData] = React.useState<BBData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [scope, setScope] = React.useState<string>("ALL");
  const [coverModel, setCoverModel] = React.useState<string>("");   // weeks-of-cover colour drill-down
  const [mode, setMode] = React.useState<"week" | "month" | "year">("week");
  const [period, setPeriod] = React.useState<string | null>(null);
  const [modal, setModal] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState<string | null>(null);
  const [summary, setSummary] = React.useState<{ weeks: string[]; rows: number; unmapped: string[] } | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  // Trend series are fetched once and cached; period/state switches request "light"
  // (period-specific data only) and reuse the cached trends.
  const dataRef = React.useRef<BBData | null>(null);
  const load = React.useCallback((p: string | null, s: string, m: string) => {
    setLoading(true);
    const haveTrends = !!dataRef.current?.trends?.weekly?.length;
    const params = new URLSearchParams();
    params.set("mode", m);
    if (p) params.set("period", p);
    if (s && s !== "ALL") params.set("state", s);
    if (haveTrends) params.set("light", "1");
    fetch("/api/bb?" + params.toString(), { cache: "no-store" }).then(r => r.json()).then((d: BBData) => {
      const merged = d.trends?.weekly?.length ? d : { ...d, trends: dataRef.current?.trends };
      dataRef.current = merged; setData(merged); if (d.period) setPeriod(d.period); setLoading(false);
    }).catch(() => setLoading(false));
  }, []);
  React.useEffect(() => { load(period, scope, mode); }, [scope, period, mode, load]);

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
      const model = classifyModel(description, brand, has(sup) ? String(sup).trim() : "");
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
      const latest = mode === "month" ? (loadedWeeks.sort().at(-1) ?? "").slice(0, 7) : loadedWeeks.sort().at(-1) ?? null;
      dataRef.current = null;   // new weeks → refetch full trends
      setPeriod(latest || null);
      load(latest || null, scope, mode);
    } catch (e: any) { setProgress("✗ " + (e.message || "Upload failed")); }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  if (loading && !data) return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center text-sm text-gray-400">Loading Baby Bunting…</div>;

  // Transient error (timeout / 5xx) — the data is there, the fetch just hiccuped.
  // Offer a retry instead of the (misleading) "needs setup" message.
  if (data?.transient) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 max-w-xl text-center">
        <h2 className="font-semibold text-gray-800">Couldn’t load Baby Bunting data</h2>
        <p className="text-sm text-gray-500 mt-1">A momentary hiccup reading the data — your sell-through is still there. Try again.</p>
        <button onClick={() => load(period, scope, mode)} disabled={loading} className="mt-4 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 rounded-lg px-4 py-2">{loading ? "Retrying…" : "Retry"}</button>
      </div>
    );
  }

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
    { l: mode === "year" ? "Full year sales" : mode === "month" ? "Month sales" : "Week sales", v: fmtM(mode === "year" ? k.cum_sales : k.wk_sales), sub: `${fmtU(mode === "year" ? k.cum_units : k.wk_units)} units${mode === "year" ? " · rolling" : ""}`, hero: true },
    { l: "Rolling-year sales", v: fmtM(k.cum_sales), sub: `${fmtU(k.cum_units)} units · ex-tax` },
    { l: "Sell-through", v: sellThru.toFixed(0) + "%", sub: "rolling year" },
    { l: "Stock on hand", v: fmtM(k.soh_value), sub: `${fmtU(k.soh_units)} units` },
    { l: "Stores", v: String(k.stores), sub: scope === "ALL" ? "network" : scope },
  ];

  const weekly = data!.trends?.weekly ?? [];
  const trendReady = weekly.length >= 2;

  // Monthly sales (sum this-week figures within each calendar month).
  const monthly = (() => {
    const m = new Map<string, number>();
    for (const w of weekly) { const mk = String(w.week_ending).slice(0, 7); m.set(mk, (m.get(mk) ?? 0) + num(w.wk_sales)); }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  })();
  const momPct = monthly.length >= 2 && monthly.at(-2)![1] > 0 ? ((monthly.at(-1)![1] - monthly.at(-2)![1]) / monthly.at(-2)![1]) * 100 : null;

  // Pram lines over time (network) from the model trend view.
  const modelTrend = data!.trends?.byModel ?? [];
  const pramWeekly = (() => {
    const m = new Map<string, { wk: number; cum: number; soh: number }>();
    for (const r of modelTrend) if (r.is_pram) { const c = m.get(r.week_ending) ?? { wk: 0, cum: 0, soh: 0 }; c.wk += num(r.wk_sales); c.cum += num(r.cum_units); c.soh += num(r.soh_units); m.set(r.week_ending, c); }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  })();
  const pramModelsNow = [...(data!.models || [])].filter((m: any) => m.is_pram && num(m.cum_sales) > 0).sort((a: any, b: any) => num(b.cum_sales) - num(a.cum_sales));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-lg bg-gray-100 p-0.5 text-[11px] font-semibold">
            {(["week", "month", "year"] as const).map(m => (
              <button key={m} onClick={() => { setMode(m); setPeriod(null); }} className={`px-3 py-1 rounded-md transition ${mode === m ? "bg-white text-gray-800 shadow-sm" : "text-gray-400"}`}>{m === "week" ? "Weekly" : m === "month" ? "Monthly" : "Full year"}</button>
            ))}
          </div>
          {mode === "year" ? (
            <span className="text-sm text-gray-600 font-medium">Rolling year <span className="text-gray-400 font-normal">· as at {longDate(data!.week)}</span></span>
          ) : (
          <select value={period ?? ""} onChange={e => setPeriod(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer">
            {mode === "month"
              ? (data!.periods || []).map(mk => <option key={mk} value={mk}>{new Date(mk + "-01T00:00:00").toLocaleDateString("en-AU", { month: "long", year: "numeric" })}</option>)
              : (() => {
                // Only the last ~6 weeks are selectable weekly — older history lives in Monthly.
                const cutoff = new Date(data!.weeks[0]); cutoff.setDate(cutoff.getDate() - 44);
                const recent = data!.weeks.filter(w => new Date(w) >= cutoff);
                return recent.map(w => <option key={w} value={w}>Week ending {longDate(w)}</option>);
              })()}
          </select>
          )}
          {mode === "month" && data!.weekCount ? <span className="text-[11px] text-gray-400">{data!.weekCount} weeks</span> : null}
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

      {/* Sales heat map (All AU only) */}
      {scope === "ALL" && (() => {
        const valueByState: Record<string, number> = {};
        let online = 0;
        (data!.states || []).forEach((r: any) => {
          const v = num(r.cum_sales);
          if (r.state === "Online") { online += v; return; }
          const full = STATE_FULLNAME[r.state];
          if (full) valueByState[full] = (valueByState[full] ?? 0) + v;
        });
        const maxState = Math.max(1, ...Object.values(valueByState));
        return (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-1">Sales heat map</p>
                <p className="text-xs text-gray-400 mb-3">Baby Bunting sell-through by state · rolling year · ex-tax</p>
              </div>
              {online > 0 && (
                <div className="text-right shrink-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Online / DC</p>
                  <p className="text-sm font-bold text-slate-700">{fmtM(online)}</p>
                </div>
              )}
            </div>
            <AustraliaMap valueByState={valueByState} max={maxState} fmt={fmtM} />
          </div>
        );
      })()}

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
                if (num(m.cum_sales) <= 0 && num(m.wk_units) <= 0 && num(m.cum_units) <= 0) return null;   // hide dead lines
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

      {/* Monthly trend */}
      {monthly.length >= 2 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-baseline justify-between mb-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Month-on-month sales <span className="font-normal text-gray-400 normal-case tracking-normal">· network, ex-tax</span></p>
            {momPct != null && <p className={`text-[11px] font-bold ${momPct >= 0 ? "text-emerald-600" : "text-rose-500"}`}>{momPct >= 0 ? "▲" : "▼"} {Math.abs(momPct).toFixed(0)}% vs prior month</p>}
          </div>
          <div className="h-52">
            <Bar data={{ labels: monthly.map(([mk]) => monthLabel(mk)), datasets: [{ label: "Monthly sales", data: monthly.map(([, v]) => v), backgroundColor: "#0891b2", borderRadius: 4, maxBarThickness: 46 }] }}
              options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c: any) => " " + fmtFull(c.parsed.y ?? 0) } } }, scales: { x: { grid: { display: false }, ticks: { font: { size: 10 }, color: "#9ca3af" } }, y: { ticks: { callback: (v: any) => fmtM(v), font: { size: 10 }, color: "#9ca3af" }, grid: { color: "#f3f4f6" } } } }} />
          </div>
        </div>
      )}

      {/* Weeks of stock cover — SOH ÷ average weekly run-rate (rolling year ÷ 52) */}
      {(() => {
        const weeksOf = (soh: number, cum: number) => { const avg = cum / 52; return avg > 0 ? soh / avg : null; };
        const band = (w: number) => w < 4
          ? { label: "Low — reorder", cls: "bg-rose-100 text-rose-700", bar: "#e11d48" }
          : w < 8 ? { label: "Watch", cls: "bg-amber-100 text-amber-700", bar: "#f59e0b" }
          : w > 26 ? { label: "Overstock", cls: "bg-sky-100 text-sky-700", bar: "#0ea5e9" }
          : { label: "Healthy", cls: "bg-emerald-100 text-emerald-700", bar: "#10b981" };
        // Model-level (current pram lines only — reorder doesn't apply to legacy).
        const models = [...(data!.models || [])]
          .filter((m: any) => m.is_pram && num(m.cum_units) > 0 && !/\(legacy\)/i.test(m.model))
          .map((m: any) => ({ name: m.model, weeks: weeksOf(num(m.soh_units), num(m.cum_units)) }))
          .filter(r => r.weeks != null).sort((a, b) => a.weeks! - b.weeks!);
        if (!models.length) return null;
        const modelOptions = models.map(m => m.name);
        const drill = coverModel && modelOptions.includes(coverModel) && data!.colours?.[coverModel];
        // Colour-level rows for the selected model.
        const rows = drill
          ? (data!.colours![coverModel] || [])
              .map((v: any) => ({ name: colourLabel(v.description), weeks: weeksOf(num(v.soh_units), num(v.cum_units)) }))
              .filter((r: any) => r.weeks != null).sort((a: any, b: any) => a.weeks! - b.weeks!)
          : models;
        const maxW = Math.max(12, ...rows.map((r: any) => Math.min(52, r.weeks!)));
        return (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-start justify-between gap-3 mb-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Weeks of stock cover · {drill ? `${coverModel} colours` : "prams"}</p>
              <select value={coverModel} onChange={e => setCoverModel(e.target.value)} className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white">
                <option value="">All models</option>
                {modelOptions.map(m => <option key={m} value={m}>{m} — by colour</option>)}
              </select>
            </div>
            <p className="text-xs text-gray-400 mb-3">Stock on hand ÷ average weekly sales (rolling year). Under 4 weeks = reorder risk.{drill ? " Colours are network-wide." : ""}</p>
            <div className="space-y-1.5">
              {rows.map((c: any, i: number) => {
                const b = band(c.weeks!);
                return (
                  <div key={c.name + i} className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-slate-600 w-28 truncate">{c.name}</span>
                    <span className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${Math.min(100, (Math.min(52, c.weeks!) / maxW) * 100)}%`, background: b.bar }} /></span>
                    <span className="text-xs font-bold text-slate-700 tabular-nums w-14 text-right">{c.weeks! >= 52 ? "52+" : c.weeks!.toFixed(1)} wk</span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full w-24 text-center ${b.cls}`}>{b.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Pram tracking */}
      {(pramWeekly.length >= 2 || pramModelsNow.length > 0) && (
        <div className="grid lg:grid-cols-2 gap-4">
          {pramWeekly.length >= 2 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] mb-1" style={{ color: PRAM_GOLD }}>● Pram sales &amp; sell-through</p>
              <p className="text-xs text-gray-400 mb-3">Weekly pram sales vs rolling sell-through</p>
              <div className="h-52">
                <Line data={{
                  labels: pramWeekly.map(([w]) => longDate(w)),
                  datasets: [
                    { label: "Pram weekly sales", data: pramWeekly.map(([, v]) => v.wk), borderColor: PRAM_GOLD, backgroundColor: PRAM_GOLD + "22", borderWidth: 2.5, pointRadius: 1, tension: 0.3, fill: true, yAxisID: "y" },
                    { label: "Sell-through %", data: pramWeekly.map(([, v]) => (v.cum + v.soh > 0 ? (v.cum / (v.cum + v.soh)) * 100 : null)), borderColor: "#0891b2", borderDash: [5, 4], borderWidth: 2, pointRadius: 0, tension: 0.3, yAxisID: "y1" },
                  ],
                }} options={{ responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false }, plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 }, usePointStyle: true } }, tooltip: { callbacks: { label: (c: any) => ` ${c.dataset.label}: ${c.dataset.yAxisID === "y1" ? (c.parsed.y ?? 0).toFixed(0) + "%" : fmtFull(c.parsed.y ?? 0)}` } } }, scales: { x: { grid: { display: false }, ticks: { font: { size: 9 }, color: "#9ca3af", maxTicksLimit: 12 } }, y: { position: "left", ticks: { callback: (v: any) => fmtM(v), font: { size: 10 }, color: "#9ca3af" }, grid: { color: "#f3f4f6" } }, y1: { position: "right", min: 0, ticks: { callback: (v: any) => v + "%", font: { size: 10 }, color: "#cbd5e1" }, grid: { display: false } } } }} />
              </div>
            </div>
          )}
          {pramModelsNow.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] mb-1" style={{ color: PRAM_GOLD }}>● Pram model mix</p>
              <p className="text-xs text-gray-400 mb-3">Rolling year · {scope === "ALL" ? "network" : scope}</p>
              {(() => {
                const tot = pramModelsNow.reduce((s: number, m: any) => s + num(m.cum_sales), 0) || 1;
                const max = Math.max(...pramModelsNow.map((m: any) => num(m.cum_sales)), 1);
                return <div className="space-y-2">{pramModelsNow.map((m: any) => (
                  <div key={m.model} className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-slate-600 w-24 truncate">{m.model}</span>
                    <span className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${Math.max(num(m.cum_sales) / max * 100, 1)}%`, background: PRAM_GOLD }} /></span>
                    <span className="text-xs font-bold text-slate-700 tabular-nums w-16 text-right">{fmtM(num(m.cum_sales))}</span>
                    <span className="text-[11px] text-gray-400 w-9 text-right">{Math.round(num(m.cum_sales) / tot * 100)}%</span>
                  </div>
                ))}</div>;
              })()}
            </div>
          )}
        </div>
      )}

      {/* Store movers — week on week */}
      {data!.movers && (data!.movers.gainers.length > 0 || data!.movers.decliners.length > 0) && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-1">Store movers <span className="font-normal text-gray-400 normal-case tracking-normal">· {mode === "month" ? "month-on-month" : "week-on-week"}{data!.movers.prevWeek ? ` vs prev ${mode}` : ""}</span></p>
          <p className="text-xs text-gray-400 mb-3">Biggest swings in {mode === "month" ? "monthly" : "weekly"} sales</p>
          <div className="grid sm:grid-cols-2 gap-5">
            {([["Gaining", data!.movers.gainers], ["Slowing", data!.movers.decliners]] as const).map(([title, list]) => (
              <div key={title}>
                <p className={`text-[11px] font-bold uppercase tracking-wider mb-2 ${title === "Gaining" ? "text-emerald-600" : "text-rose-500"}`}>{title === "Gaining" ? "▲" : "▼"} {title}</p>
                <div className="space-y-1.5">
                  {list.filter((m: any) => title === "Gaining" ? m.delta > 0 : m.delta < 0).map((m: any) => (
                    <div key={m.store} className="flex items-center gap-2 text-xs">
                      <span className="font-semibold text-slate-700 flex-1 truncate">{m.store} <span className="text-gray-400 font-normal">· {m.state}</span></span>
                      <span className="text-gray-500 tabular-nums">{fmtM(m.now)}</span>
                      <span className={`font-bold tabular-nums w-20 text-right ${m.delta >= 0 ? "text-emerald-600" : "text-rose-500"}`}>{m.delta >= 0 ? "+" : "−"}{fmtM(Math.abs(m.delta))}{m.pct != null ? ` (${m.pct >= 0 ? "+" : ""}${Math.round(m.pct)}%)` : ""}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pram sell-through by state + stores to watch */}
      <div className="grid lg:grid-cols-2 gap-4">
        {(data!.pramByState || []).length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] mb-1" style={{ color: PRAM_GOLD }}>● Pram sell-through by state</p>
            <p className="text-xs text-gray-400 mb-3">Rolling year · where prams convert best</p>
            {(() => {
              const rows = (data!.pramByState || []).filter((r: any) => r.state !== "Online");
              const max = Math.max(...rows.map((r: any) => num(r.sell_thru)), 0.01);
              return <div className="space-y-2">{rows.map((r: any) => { const st = num(r.sell_thru) * 100; return (
                <div key={r.state} className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-slate-600 w-12">{r.state}</span>
                  <span className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${Math.max(num(r.sell_thru) / max * 100, 2)}%`, background: PRAM_GOLD }} /></span>
                  <span className="text-xs font-bold text-slate-700 tabular-nums w-10 text-right">{st.toFixed(0)}%</span>
                  <span className="text-[11px] text-gray-400 w-16 text-right">{fmtM(num(r.cum_sales))}</span>
                </div>
              ); })}</div>;
            })()}
          </div>
        )}
        {(() => {
          const wc = data!.weekCount || 1;
          const watch = [...(data!.stores || [])]
            .map((r: any) => { const rate = num(r.wk_sales) / wc; return { store: r.store, state: r.state, soh: num(r.soh_value), rate, cover: rate > 0 ? num(r.soh_value) / rate : (num(r.soh_value) > 0 ? 999 : 0) }; })
            .filter((r: any) => r.soh > 8000 && r.cover >= 8)
            .sort((a: any, b: any) => b.cover - a.cover).slice(0, 8);
          if (!watch.length) return null;
          return (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 mb-1">Stores to watch <span className="font-normal text-gray-400 normal-case tracking-normal">· overstocked / slow</span></p>
              <p className="text-xs text-gray-400 mb-3">High stock on hand vs recent sales rate (weeks of cover)</p>
              <div className="space-y-1.5">{watch.map((r: any) => (
                <div key={r.store} className="flex items-center gap-2 text-xs">
                  <span className="font-semibold text-slate-700 flex-1 truncate">{r.store} <span className="text-gray-400 font-normal">· {r.state}</span></span>
                  <span className="text-gray-500 tabular-nums">{fmtM(r.soh)} SOH</span>
                  <span className="font-bold text-amber-600 tabular-nums w-16 text-right">{r.cover >= 999 ? "no sales" : Math.round(r.cover) + " wks"}</span>
                </div>
              ))}</div>
            </div>
          );
        })()}
      </div>

      {/* Best-selling colours per key pram */}
      {data!.colours && Object.keys(data!.colours).length > 0 && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400 mb-2 px-1">Best-selling colours <span className="font-normal normal-case tracking-normal">· current key prams · rolling-year units</span></p>
          <div className="grid md:grid-cols-3 gap-4">
            {["Vista", "Cruz", "Minu"].filter(m => (data!.colours![m] || []).length).map(model => {
              const rows = data!.colours![model];
              const max = Math.max(...rows.map((r: any) => num(r.cum_units)), 1);
              return (
                <div key={model} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4" style={{ borderTop: `3px solid ${PRAM_GOLD}` }}>
                  <p className="text-sm font-bold text-slate-800 mb-3">{model}</p>
                  <div className="space-y-2">
                    {rows.map((r: any) => (
                      <div key={r.code} className="flex items-center gap-2" title={r.description}>
                        <span className="text-[11px] text-slate-600 w-28 truncate">{colourLabel(r.description)}</span>
                        <span className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${Math.max(num(r.cum_units) / max * 100, 3)}%`, background: PRAM_GOLD }} /></span>
                        <span className="text-[11px] font-bold text-slate-700 tabular-nums w-8 text-right">{fmtU(num(r.cum_units))}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
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
