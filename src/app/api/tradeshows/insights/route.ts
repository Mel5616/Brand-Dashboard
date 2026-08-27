import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { buildCostByBrand, computeMargin } from "@/lib/tradeshowMargin";

// Show Insights: cross-show analytics built on top of the per-show breakdown
// figures — year-on-year comparison (vs the previous instance of the same
// show), a best/worst leaderboard, cost-per-visitor / cost-per-order,
// staff cost as a % of sales, and a daily sales trajectory for a sparkline.
// All revenue/expense figures are ex-GST, matching the rest of Tradeshows.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = () => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}` });
const rest = (p: string) => fetch(`${sbUrl}/rest/v1/${p}`, { headers: h(), cache: "no-store" }).then(async r => (r.ok ? JSON.parse((await r.text()) || "[]") : []));

function showDays(dateStart: string, dateEnd: string): string[] {
  const days: string[] = [];
  const d = new Date(dateStart + "T00:00:00");
  const end = new Date((dateEnd || dateStart) + "T00:00:00");
  while (d <= end) { days.push(d.toISOString().slice(0, 10)); d.setDate(d.getDate() + 1); }
  return days;
}

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });

  const [shows, sales, qr, expItems, attendance, hourly, products, costRows] = await Promise.all([
    rest("tradeshows?select=id,name,date_start,date_end,state,location&order=date_start.asc"),
    rest("tradeshow_sales?select=tradeshow_id,revenue"),
    rest("tradeshow_qr?select=tradeshow_id,revenue,orders"),
    rest("tradeshow_expense_items?select=tradeshow_id,category,amount"),
    rest("tradeshow_attendance?select=tradeshow_id,day,attendance"),
    rest("tradeshow_hourly?select=tradeshow_id,day,revenue"),
    rest("tradeshow_products?select=tradeshow_id,bucket,product,revenue,units,sku"),
    rest("cost_sheet_items?select=brand,product_name,style_code,landed_cost_aud&style_code=not.is.null"),
  ]);

  const costByBrand = buildCostByBrand(costRows);
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const past = shows.filter((s: any) => (s.date_end || s.date_start) < todayStr);

  const revOf = (id: string) => sales.filter((r: any) => r.tradeshow_id === id).reduce((s: number, r: any) => s + (Number(r.revenue) || 0), 0)
    + (qr.find((r: any) => r.tradeshow_id === id)?.revenue ? Number(qr.find((r: any) => r.tradeshow_id === id).revenue) : 0);
  const ordersOf = (id: string) => Number(qr.find((r: any) => r.tradeshow_id === id)?.orders || 0);
  const expOf = (id: string) => expItems.filter((r: any) => r.tradeshow_id === id);
  const visitorsOf = (id: string, ts: any) => showDays(ts.date_start, ts.date_end).reduce((s: number, d: string) => {
    const row = attendance.find((a: any) => a.tradeshow_id === id && a.day === d);
    return s + (row ? Number(row.attendance) || 0 : 0);
  }, 0);

  const results = past.map((ts: any) => {
    const revenue = Math.round(revOf(ts.id));
    const exp = expOf(ts.id);
    const expenses = Math.round(exp.reduce((s: number, x: any) => s + (Number(x.amount) || 0), 0));
    const staffExpense = Math.round(exp.filter((x: any) => x.category === "Staff").reduce((s: number, x: any) => s + (Number(x.amount) || 0), 0));
    const visitors = visitorsOf(ts.id, ts);
    const prods = products.filter((p: any) => p.tradeshow_id === ts.id);
    const margin = computeMargin(prods, costByBrand);
    const profit = revenue - expenses;
    const trueProfit = margin ? margin.knownMargin - expenses : null;
    const marginPct = revenue > 0 && trueProfit != null ? Math.round((trueProfit / revenue) * 100) : null;
    const roiPct = expenses > 0 ? Math.round((profit / expenses) * 100) : null;
    const staffPctOfSales = revenue > 0 && staffExpense > 0 ? Math.round((staffExpense / revenue) * 100) : null;
    const orders = ordersOf(ts.id);
    const costPerVisitor = visitors > 0 && expenses > 0 ? Math.round(expenses / visitors) : null;

    const dayTotals = new Map<string, number>();
    for (const h of hourly.filter((r: any) => r.tradeshow_id === ts.id)) {
      dayTotals.set(h.day, (dayTotals.get(h.day) || 0) + (Number(h.revenue) || 0));
    }
    const daily = showDays(ts.date_start, ts.date_end).map(d => ({ day: d, revenue: Math.round(dayTotals.get(d) || 0) }));

    return {
      id: ts.id, name: ts.name, date_start: ts.date_start, date_end: ts.date_end, state: ts.state, location: ts.location,
      revenue, expenses, staffExpense, staffPctOfSales, visitors, orders,
      margin, profit, trueProfit, marginPct, roiPct, costPerVisitor,
      costPerOrder: orders > 0 && expenses > 0 ? Math.round(expenses / orders) : null,
      daily,
    };
  }).filter((r: any) => r.revenue > 0 || r.expenses > 0);

  // Year-on-year: group by exact show name, sorted by date; each show (after
  // the first occurrence) is compared to its immediately preceding instance —
  // handles shows that run more than once a year without assuming annual cadence.
  const byName = new Map<string, typeof results>();
  for (const r of results) byName.set(r.name, [...(byName.get(r.name) ?? []), r]);
  const yoy: any[] = [];
  for (const list of byName.values()) {
    const sorted = [...list].sort((a, b) => a.date_start.localeCompare(b.date_start));
    for (let i = 1; i < sorted.length; i++) {
      const cur = sorted[i], prev = sorted[i - 1];
      const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);
      yoy.push({
        id: cur.id, prevId: prev.id, name: cur.name, date_start: cur.date_start, prevDateStart: prev.date_start,
        revenue: cur.revenue, prevRevenue: prev.revenue, revenueDeltaPct: pct(cur.revenue, prev.revenue),
        visitors: cur.visitors, prevVisitors: prev.visitors, visitorsDeltaPct: pct(cur.visitors, prev.visitors),
        trueProfit: cur.trueProfit, prevTrueProfit: prev.trueProfit,
        trueProfitDeltaPct: cur.trueProfit != null && prev.trueProfit != null ? pct(cur.trueProfit, prev.trueProfit) : null,
        daily: cur.daily, prevDaily: prev.daily,
      });
    }
  }
  yoy.sort((a, b) => b.date_start.localeCompare(a.date_start));

  return NextResponse.json({ ok: true, shows: results, yoy });
}
