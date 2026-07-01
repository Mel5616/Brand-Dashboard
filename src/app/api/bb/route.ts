import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Baby Bunting sell-through. GET = pre-aggregated data for a week (+ optional state)
// and trend series, all served from SQL views. POST = ingest a chunk of SKU rows (admin).
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const q = async (path: string) => {
  const res = await fetch(`${sbUrl}/rest/v1/${path}`, { headers: H(), cache: "no-store" });
  if (!res.ok) return null;
  return JSON.parse((await res.text()) || "[]");
};
const num = (v: any) => Number(v) || 0;

// Aggregate view rows for a period: SUM week figures across the period's weeks, but
// take rolling-year / stock SNAPSHOTS from the last week only (summed across states).
function periodAgg(rows: any[], keys: string[], lastWeek: string): any[] {
  const m = new Map<string, any>();
  for (const r of rows || []) {
    const kk = keys.map(f => r[f]).join("|");
    let c = m.get(kk);
    if (!c) { c = { wk_sales: 0, wk_units: 0, cum_sales: 0, cum_units: 0, soh_value: 0, soh_units: 0, stores: 0, is_pram: false }; keys.forEach(f => (c[f] = r[f])); m.set(kk, c); }
    c.wk_sales += num(r.wk_sales); c.wk_units += num(r.wk_units);
    if (r.week_ending === lastWeek) {
      c.cum_sales += num(r.cum_sales); c.cum_units += num(r.cum_units);
      c.soh_value += num(r.soh_value); c.soh_units += num(r.soh_units); c.stores += num(r.stores);
    }
    if (r.is_pram) c.is_pram = true;
  }
  for (const c of m.values()) c.sell_thru = c.cum_units + c.soh_units > 0 ? c.cum_units / (c.cum_units + c.soh_units) : null;
  return [...m.values()];
}

export async function GET(req: Request) {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  if (!(await getAccess()).role) return NextResponse.json({ ok: false, error: "unauthorised" }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const state = sp.get("state");
  const stateF = state && state !== "ALL" ? `&state=eq.${encodeURIComponent(state)}` : "";
  const mode = sp.get("mode") === "month" ? "month" : "week";
  const wanted = sp.get("period") || sp.get("week");

  const weeksRows = await q("bb_weekly_totals?select=week_ending&order=week_ending.desc");
  if (weeksRows == null) return NextResponse.json({ ok: false, needsSetup: true, weeks: [] });
  const weeks: string[] = weeksRows.map((r: any) => r.week_ending);   // desc
  if (!weeks.length) return NextResponse.json({ ok: true, weeks: [], week: null });

  // Resolve the selected period → its set of weeks + the "snapshot" (last) week.
  let period: string, periodWeeks: string[], lastWeek: string, prevWeeks: string[], periods: string[];
  if (mode === "month") {
    const months = [...new Set(weeks.map(w => String(w).slice(0, 7)))];  // desc
    period = wanted && months.includes(wanted) ? wanted : months[0];
    periodWeeks = weeks.filter(w => String(w).startsWith(period));
    const pm = months[months.indexOf(period) + 1];
    prevWeeks = pm ? weeks.filter(w => String(w).startsWith(pm)) : [];
    periods = months;
  } else {
    period = wanted && weeks.includes(wanted) ? wanted : weeks[0];
    periodWeeks = [period];
    const pw = weeks[weeks.indexOf(period) + 1];
    prevWeeks = pw ? [pw] : [];
    periods = weeks;
  }
  lastWeek = periodWeeks[0];
  const prevLast = prevWeeks[0] ?? "";
  const wf = periodWeeks.length === 1 ? `week_ending=eq.${periodWeeks[0]}` : `week_ending=in.(${periodWeeks.join(",")})`;
  const pwf = prevWeeks.length ? (prevWeeks.length === 1 ? `week_ending=eq.${prevWeeks[0]}` : `week_ending=in.(${prevWeeks.join(",")})`) : null;

  const [statesRaw, brandsRaw, modelsRaw, pramStateRaw, storesRaw, weeklyTotals, stateTrend, brandTrend, modelTrend, storePrevRaw] = await Promise.all([
    q(`bb_agg_state?${wf}`),
    q(`bb_agg_brand?${wf}${stateF}`),
    q(`bb_agg_model?${wf}${stateF}`),
    q(`bb_agg_model?${wf}&is_pram=eq.true`),
    q(`bb_agg_store?${wf}${stateF}`),
    q(`bb_weekly_totals?order=week_ending.asc`),
    q(`bb_agg_state?order=week_ending.asc`),
    q(`bb_weekly_brand?order=week_ending.asc`),
    q(`bb_weekly_model?order=week_ending.asc`),
    pwf ? q(`bb_agg_store?${pwf}${stateF}`) : Promise.resolve([]),
  ]);

  const statesAgg = periodAgg(statesRaw || [], ["state"], lastWeek).sort((a, b) => b.cum_sales - a.cum_sales);
  const storesAgg = periodAgg(storesRaw || [], ["store", "state"], lastWeek).sort((a, b) => b.cum_sales - a.cum_sales);

  // Pram sell-through by state (period snapshot).
  const pramByState = periodAgg(pramStateRaw || [], ["state"], lastWeek)
    .map(r => ({ state: r.state, cum_sales: r.cum_sales, cum_units: r.cum_units, wk_sales: r.wk_sales, sell_thru: r.sell_thru }))
    .filter(r => r.cum_sales > 0).sort((a, b) => (b.sell_thru ?? 0) - (a.sell_thru ?? 0));

  // Store movers: this period's wk_sales vs the prior period's, per store.
  const prevAgg = periodAgg(storePrevRaw || [], ["store", "state"], prevLast);
  const prevMap = new Map<string, number>(prevAgg.map((r: any) => [String(r.store), num(r.wk_sales)] as [string, number]));
  const movers = storesAgg.map((r: any) => {
    const now = num(r.wk_sales), prev = prevMap.get(r.store) ?? 0;
    return { store: r.store, state: r.state, now, prev, delta: now - prev, pct: prev > 0 ? ((now - prev) / prev) * 100 : null };
  }).filter((m: any) => m.now > 0 || m.prev > 0).sort((a: any, b: any) => b.delta - a.delta);

  const kpiRows = state && state !== "ALL" ? statesAgg.filter((r: any) => r.state === state) : statesAgg;
  const kpi = {
    wk_sales: kpiRows.reduce((s: number, r: any) => s + num(r.wk_sales), 0),
    wk_units: kpiRows.reduce((s: number, r: any) => s + num(r.wk_units), 0),
    cum_sales: kpiRows.reduce((s: number, r: any) => s + num(r.cum_sales), 0),
    cum_units: kpiRows.reduce((s: number, r: any) => s + num(r.cum_units), 0),
    soh_value: kpiRows.reduce((s: number, r: any) => s + num(r.soh_value), 0),
    soh_units: kpiRows.reduce((s: number, r: any) => s + num(r.soh_units), 0),
    stores: kpiRows.reduce((s: number, r: any) => s + num(r.stores), 0),
  };

  return NextResponse.json({
    ok: true, mode, period, periods, weeks, week: lastWeek, weekCount: periodWeeks.length,
    kpi,
    states: statesAgg,
    brands: periodAgg(brandsRaw || [], ["brand"], lastWeek),
    models: periodAgg(modelsRaw || [], ["model"], lastWeek).map(m => ({ ...m, is_pram: m.is_pram })),
    stores: storesAgg,
    pramByState,
    trends: { weekly: weeklyTotals || [], byState: stateTrend || [], byBrand: brandTrend || [], byModel: modelTrend || [] },
    movers: { gainers: movers.slice(0, 6), decliners: [...movers].reverse().slice(0, 6), prevWeek: prevLast || null },
  });
}

export async function POST(req: Request) {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const rows = Array.isArray(b.rows) ? b.rows : [];
  if (!rows.length) return NextResponse.json({ ok: false, error: "no rows" }, { status: 400 });
  const res = await fetch(`${sbUrl}/rest/v1/bb_sell_through?on_conflict=week_ending,store,code`, {
    method: "POST", headers: H({ Prefer: "resolution=merge-duplicates,return=minimal" }), body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const t = await res.text();
    return NextResponse.json({ ok: false, needsSetup: /PGRST205|does not exist|schema cache/i.test(t), error: t.slice(0, 300) }, { status: 500 });
  }
  return NextResponse.json({ ok: true, count: rows.length });
}
