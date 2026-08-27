import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { buildCostByBrand, computeMargin, findUnmatched } from "@/lib/tradeshowMargin";
import { currentFY, fyMonthKeys } from "@/lib/fy";

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

  const [shows, sales, qr, expItems, attendance, hourly, products, costRows, brands] = await Promise.all([
    rest("tradeshows?select=id,name,date_start,date_end,state,location&order=date_start.asc"),
    rest("tradeshow_sales?select=tradeshow_id,brand_id,revenue"),
    rest("tradeshow_qr?select=tradeshow_id,revenue,orders"),
    rest("tradeshow_expense_items?select=tradeshow_id,category,amount"),
    rest("tradeshow_attendance?select=tradeshow_id,day,attendance"),
    rest("tradeshow_hourly?select=tradeshow_id,day,revenue"),
    rest("tradeshow_products?select=tradeshow_id,bucket,product,revenue,units,sku"),
    rest("cost_sheet_items?select=brand,product_name,style_code,landed_cost_aud&style_code=not.is.null"),
    rest("brands?select=id,name,color"),
  ]);
  const uppababyId = brands.find((b: any) => b.name === "UPPAbaby")?.id ?? null;

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
    const unmatched = findUnmatched(prods, costByBrand);
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

    // Which brands actually showed up in this show's numbers — QR revenue is
    // Shopify's UPPAbaby headless channel, so it folds into UPPAbaby here too.
    const brandRevMap = new Map<number, number>();
    for (const r of sales.filter((x: any) => x.tradeshow_id === ts.id)) {
      brandRevMap.set(r.brand_id, (brandRevMap.get(r.brand_id) || 0) + (Number(r.revenue) || 0));
    }
    const qrRow = qr.find((r: any) => r.tradeshow_id === ts.id);
    if (qrRow?.revenue && uppababyId != null) brandRevMap.set(uppababyId, (brandRevMap.get(uppababyId) || 0) + Number(qrRow.revenue));
    const byBrand = [...brandRevMap.entries()]
      .map(([brand_id, rev]) => ({ brand_id, name: brands.find((b: any) => b.id === brand_id)?.name ?? `Brand ${brand_id}`, color: brands.find((b: any) => b.id === brand_id)?.color ?? "#94a3b8", revenue: Math.round(rev) }))
      .filter(b => b.revenue > 0).sort((a, b) => b.revenue - a.revenue);

    const prodsForShow = products.filter((p: any) => p.tradeshow_id === ts.id);
    const topProducts = [...prodsForShow].sort((a: any, b: any) => (Number(b.revenue) || 0) - (Number(a.revenue) || 0))
      .slice(0, 8).map((p: any) => ({ product: p.product, bucket: p.bucket, revenue: Math.round(Number(p.revenue) || 0), units: Number(p.units) || 0 }));

    return {
      id: ts.id, name: ts.name, date_start: ts.date_start, date_end: ts.date_end, state: ts.state, location: ts.location,
      revenue, expenses, staffExpense, staffPctOfSales, visitors, orders,
      margin, profit, trueProfit, marginPct, roiPct, costPerVisitor,
      costPerOrder: orders > 0 && expenses > 0 ? Math.round(expenses / orders) : null,
      daily, byBrand, topProducts, unmatched,
    };
  }).filter((r: any) => r.revenue > 0 || r.expenses > 0);

  // Season-level product leaderboard, scoped to the current FY, aggregated
  // from the FULL product list (not each show's top-8) so nothing is
  // undercounted by a product that ranks lower in any single show.
  const fyShowIds = new Set(results.filter((r: any) => fyMonthKeys(currentFY()).includes(r.date_start.slice(0, 7))).map((r: any) => r.id));
  const seasonProdMap = new Map<string, { product: string; revenue: number; units: number }>();
  for (const p of products) {
    if (!fyShowIds.has(p.tradeshow_id)) continue;
    const key = p.product;
    const cur = seasonProdMap.get(key) ?? { product: p.product, revenue: 0, units: 0 };
    cur.revenue += Number(p.revenue) || 0; cur.units += Number(p.units) || 0;
    seasonProdMap.set(key, cur);
  }
  const topProductsSeason = [...seasonProdMap.values()].sort((a, b) => b.revenue - a.revenue)
    .slice(0, 12).map(p => ({ ...p, revenue: Math.round(p.revenue) }));

  // Season-level unmatched products, scoped to the current FY, deduped by
  // product+SKU (same product line at multiple shows rolls up into one row
  // with combined revenue) — this is the actual worklist for Cost Sheet fixes.
  const unmatchedMap = new Map<string, { product: string; bucket: string; sku: string | null; revenue: number; units: number; reason: string }>();
  for (const r of results) {
    if (!fyShowIds.has(r.id)) continue;
    for (const u of r.unmatched as { product: string; bucket: string; sku: string | null; revenue: number; units: number; reason: string }[]) {
      const key = `${u.bucket}|${u.product}|${u.sku ?? ""}`;
      const cur = unmatchedMap.get(key) ?? { ...u, revenue: 0, units: 0 };
      cur.revenue += u.revenue; cur.units += u.units;
      unmatchedMap.set(key, cur);
    }
  }
  const unmatchedSeason = [...unmatchedMap.values()].sort((a, b) => b.revenue - a.revenue);

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

  // Sales by month, split by brand — every FY month gets a slot (even $0
  // ones) so the chart reads as a continuous season, not just the months
  // that happened to have a show.
  const monthKeys = fyMonthKeys(currentFY());
  const salesByMonth = monthKeys.map(mk => {
    const showsInMonth = results.filter((r: any) => r.date_start.slice(0, 7) === mk);
    const byBrandMap = new Map<number, { name: string; color: string; revenue: number }>();
    for (const r of showsInMonth) {
      for (const b of r.byBrand) {
        const cur = byBrandMap.get(b.brand_id) ?? { name: b.name, color: b.color, revenue: 0 };
        cur.revenue += b.revenue;
        byBrandMap.set(b.brand_id, cur);
      }
    }
    const byBrand = [...byBrandMap.entries()].map(([brand_id, v]) => ({ brand_id, ...v, revenue: Math.round(v.revenue) })).sort((a, b) => b.revenue - a.revenue);
    const [yy, mm] = mk.split("-");
    const label = new Date(Number(yy), Number(mm) - 1, 1).toLocaleDateString("en-AU", { month: "short" });
    return { monthKey: mk, label, total: Math.round(byBrand.reduce((s, b) => s + b.revenue, 0)), byBrand };
  });

  return NextResponse.json({ ok: true, shows: results, yoy, topProductsSeason, unmatchedSeason, salesByMonth });
}
