import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { createClient } from "@supabase/supabase-js";

// Tradeshow report data as JSON: by-brand totals (unchanged tradeshow_sales),
// QR summary (Shopify ex-GST standard), top products per bucket, the hourly
// series, and the QR lead funnel (scans/checkouts from the booth app).
// GET ?tradeshow_id={id}[&top=5]
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = () => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}` });
const rest = (p: string) => fetch(`${sbUrl}/rest/v1/${p}`, { headers: h(), cache: "no-store" }).then(async r => (r.ok ? JSON.parse((await r.text()) || "[]") : []));

export async function GET(req: Request) {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  const u = new URL(req.url);
  const id = u.searchParams.get("tradeshow_id");
  const top = Math.max(1, Math.min(50, Number(u.searchParams.get("top") || 5)));
  if (!id) return NextResponse.json({ ok: false, error: "Missing tradeshow_id" }, { status: 400 });

  const [showRows, sales, brands, products, hourly, qr] = await Promise.all([
    rest(`tradeshows?id=eq.${encodeURIComponent(id)}&select=id,name,date_start,date_end,state,location`),
    rest(`tradeshow_sales?tradeshow_id=eq.${encodeURIComponent(id)}&select=brand_id,revenue,orders&order=revenue.desc`),
    rest("brands?select=id,name"),
    rest(`tradeshow_products?tradeshow_id=eq.${encodeURIComponent(id)}&select=bucket,product,revenue,units&order=revenue.desc`),
    rest(`tradeshow_hourly?tradeshow_id=eq.${encodeURIComponent(id)}&select=day,hour,slot,revenue,orders&order=day.asc,hour.asc`),
    rest(`tradeshow_qr?tradeshow_id=eq.${encodeURIComponent(id)}&select=revenue,orders`),
  ]);
  const show = showRows[0] ?? null;
  if (!show) return NextResponse.json({ ok: false, error: "Unknown tradeshow_id" }, { status: 404 });
  const nameById = new Map<number, string>(brands.map((b: any) => [b.id, b.name]));

  // By brand (existing figures, untouched) + the QR bucket as its own line.
  const byBrand = sales.filter((s: any) => Number(s.revenue) > 0)
    .map((s: any) => ({ brand: nameById.get(s.brand_id) ?? `Brand ${s.brand_id}`, revenue: Number(s.revenue), orders: Number(s.orders) }));
  const qrRow = qr[0] ? { brand: "QR", revenue: Number(qr[0].revenue), orders: Number(qr[0].orders) } : null;

  // Top N products per bucket, ranked by revenue within the bucket.
  const buckets = new Map<string, { product: string; revenue: number; units: number }[]>();
  for (const p of products) {
    const list = buckets.get(p.bucket) ?? [];
    list.push({ product: p.product, revenue: Number(p.revenue), units: Number(p.units) });
    buckets.set(p.bucket, list);
  }
  const topProducts = [...buckets.entries()]
    .map(([bucket, list]) => ({
      bucket,
      total: Math.round(list.reduce((s, x) => s + x.revenue, 0)),
      products: list.sort((a, b) => b.revenue - a.revenue).slice(0, top).map((x, i) => ({ rank: i + 1, ...x, revenue: Math.round(x.revenue) })),
    }))
    .sort((a, b) => b.total - a.total);

  // Hourly series, plus a per-slot rollup (both days combined) matching the chart.
  const hourlyRows = hourly.map((r: any) => ({ day: r.day, hour: r.hour, slot: r.slot, revenue: Math.round(Number(r.revenue)), orders: Number(r.orders) }));
  const bySlot = new Map<number, { hour: number; revenue: number; orders: number }>();
  for (const r of hourlyRows) {
    const cur = bySlot.get(r.hour) ?? { hour: r.hour, revenue: 0, orders: 0 };
    cur.revenue += r.revenue; cur.orders += r.orders; bySlot.set(r.hour, cur);
  }

  // Lead funnel from the booth app (scans / checkouts), matched by show window.
  let leads: { scans: number; checkouts: number; orders: number } | null = null;
  if (process.env.BOOTH_SUPABASE_URL && process.env.BOOTH_SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const booth = createClient(process.env.BOOTH_SUPABASE_URL, process.env.BOOTH_SUPABASE_SERVICE_ROLE_KEY);
      const from = `${show.date_start}T00:00:00`;
      const to = `${show.date_end || show.date_start}T23:59:59`;
      const { data } = await booth.from("booth_events").select("event_type").gte("created_at", from).lte("created_at", to);
      if (data) {
        leads = {
          scans: data.filter(r => r.event_type === "scan").length,
          checkouts: data.filter(r => r.event_type === "checkout_started").length,
          orders: data.filter(r => r.event_type === "order").length,
        };
      }
    } catch { /* booth app unreachable — leads stay null */ }
  }

  const total = byBrand.reduce((s: number, b: any) => s + b.revenue, 0) + (qrRow?.revenue ?? 0);
  return NextResponse.json({
    ok: true,
    show,
    totals: { revenue: Math.round(total), note: "ex-GST; QR = Shopify paid orders on the QR channel (standard agreed 17 Jul 2026)" },
    byBrand: qrRow ? [...byBrand, qrRow].sort((a, b) => b.revenue - a.revenue) : byBrand,
    topProductsByBrand: topProducts,
    hourly: hourlyRows,
    hourlyBySlot: [...bySlot.values()].sort((a, b) => a.hour - b.hour),
    leads,
  });
}
