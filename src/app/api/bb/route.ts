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

export async function GET(req: Request) {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  if (!(await getAccess()).role) return NextResponse.json({ ok: false, error: "unauthorised" }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const state = sp.get("state");
  const stateF = state && state !== "ALL" ? `&state=eq.${encodeURIComponent(state)}` : "";

  const weeksRows = await q("bb_weekly_totals?select=week_ending&order=week_ending.desc");
  if (weeksRows == null) return NextResponse.json({ ok: false, needsSetup: true, weeks: [] });
  const weeks: string[] = weeksRows.map((r: any) => r.week_ending);
  if (!weeks.length) return NextResponse.json({ ok: true, weeks: [], week: null });
  const week = sp.get("week") && weeks.includes(sp.get("week")!) ? sp.get("week")! : weeks[0];

  const [statesRaw, brandsRaw, modelsRaw, storesRaw, weeklyTotals, stateTrend] = await Promise.all([
    q(`bb_agg_state?week_ending=eq.${week}&order=cum_sales.desc`),
    q(`bb_agg_brand?week_ending=eq.${week}${stateF}`),
    q(`bb_agg_model?week_ending=eq.${week}${stateF}`),
    q(`bb_agg_store?week_ending=eq.${week}${stateF}&order=cum_sales.desc`),
    q(`bb_weekly_totals?order=week_ending.asc`),
    q(`bb_agg_state?order=week_ending.asc`),
  ]);

  // Sum brand/model across states when viewing All AU (views are per state × …).
  const rollup = (rows: any[], key: string, extra: string[] = []) => {
    const m = new Map<string, any>();
    for (const r of rows) {
      const k = r[key];
      const cur = m.get(k) ?? { [key]: k, wk_sales: 0, wk_units: 0, cum_sales: 0, cum_units: 0, soh_units: 0, ...(extra.includes("is_pram") ? { is_pram: false } : {}) };
      cur.wk_sales += num(r.wk_sales); cur.wk_units += num(r.wk_units);
      cur.cum_sales += num(r.cum_sales); cur.cum_units += num(r.cum_units);
      cur.soh_units += num(r.soh_units);
      if (r.is_pram) cur.is_pram = true;
      m.set(k, cur);
    }
    return [...m.values()];
  };

  const kpiRows = state && state !== "ALL" ? (statesRaw || []).filter((r: any) => r.state === state) : (statesRaw || []);
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
    ok: true, weeks, week,
    kpi,
    states: statesRaw || [],
    brands: rollup(brandsRaw || [], "brand"),
    models: rollup(modelsRaw || [], "model", ["is_pram"]),
    stores: storesRaw || [],
    trends: { weekly: weeklyTotals || [], byState: stateTrend || [] },
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
