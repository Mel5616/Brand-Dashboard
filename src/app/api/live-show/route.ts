import { NextResponse } from "next/server";

// Live show-day feed: real-time Shopify revenue for a tradeshow.
// Reads the show + participating brands from Supabase, then queries each
// brand's own store (POS or shipping to the show's state, in the show window)
// plus the Coolkidz booth till (date-only, split per brand by vendor/Brand_ tag).
// Works for live shows (auto-refresh) and past shows (single report fetch).
// Pass ?compare=1 to also compute the previous comparable show's totals.

export const revalidate = 0;
const API_VERSION = "2024-01";
const AEST_OFFSET = 10; // hours; QLD has no DST, good enough for hour-of-day buckets
const OPEN = 9, CLOSE = 17; // assumed show open hours (AEST) for "same point" pacing

// Fraction of a show's selling hours elapsed at a given instant (0..1).
function showFraction(iso: string, start: string, end: string): number {
  const aest = new Date(new Date(iso).getTime() + AEST_OFFSET * 3600 * 1000);
  const dateStr = aest.toISOString().slice(0, 10);
  const hour = aest.getUTCHours() + aest.getUTCMinutes() / 60;
  const perDay = CLOSE - OPEN;
  const days: string[] = [];
  for (let d = new Date(start + "T00:00:00Z"); d <= new Date(end + "T00:00:00Z"); d = new Date(d.getTime() + 86400000)) {
    days.push(d.toISOString().slice(0, 10));
  }
  let elapsed = 0;
  for (const day of days) {
    if (day < dateStr) elapsed += perDay;
    else if (day === dateStr) elapsed += Math.min(perDay, Math.max(0, hour - OPEN));
  }
  const total = days.length * perDay;
  return total > 0 ? Math.min(1, elapsed / total) : 1;
}

// vendor / Brand_<Name> → brand_id (mirrors scripts/sync.py coolkidz_brand_id)
const VENDOR_TO_ID: Record<string, number> = {
  nanit: 0, magic: 1, hannie: 2, "gaia baby": 3, wonderfold: 4, uppababy: 5,
  zazu: 6, miamily: 7, frida: 8, "matchstick monkey": 10, mamave: 11,
  ub: 5, mg: 1, wf: 4, ck: 9, msm: 10, gaia: 3,
};
function coolkidzBrandId(title: string, vendor: string, tags: string[]): number | null {
  for (const t of tags || []) {
    if (t.toLowerCase().startsWith("brand_")) {
      const key = t.slice(6).replace(/\s/g, "").toLowerCase();
      for (const [name, id] of Object.entries(VENDOR_TO_ID)) {
        if (name.replace(/\s/g, "") === key) return id;
      }
    }
  }
  const v = (vendor || "").trim().toLowerCase();
  if (v in VENDOR_TO_ID) return VENDOR_TO_ID[v];
  return null;
}

type Store = { id: number; name: string; domain: string; token: string };

async function shopify(domain: string, token: string, query: string) {
  const res = await fetch(`https://${domain}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query }),
    cache: "no-store",
  });
  return res.json();
}

// Paginated order fetch (the 250 page cap truncates high-volume show days)
async function shopifyOrders(domain: string, token: string, filter: string, nodeFields: string): Promise<any[]> {
  const out: any[] = [];
  let cursor: string | null = null;
  for (let p = 0; p < 8; p++) {
    const after: string = cursor ? `, after: "${cursor}"` : "";
    const q = `{ orders(first: 250${after}, query: "${filter}", sortKey: CREATED_AT) { edges { cursor node { ${nodeFields} } } pageInfo { hasNextPage } } }`;
    const j = await shopify(domain, token, q);
    const edges = j?.data?.orders?.edges ?? [];
    for (const e of edges) out.push(e);
    if (!j?.data?.orders?.pageInfo?.hasNextPage || edges.length === 0) break;
    cursor = edges[edges.length - 1].cursor;
  }
  return out;
}

const exGst = (gross: number, tax: number) => (tax > 0 ? gross - tax : Math.round((gross / 1.1) * 100) / 100);
const round = (n: number) => Math.round(n);

// Compute one show's figures. `detail` adds top products + sales-by-hour
// (skip it for the comparison show to keep the query light).
async function computeShow(
  show: any,
  brandIds: number[],
  storeById: Map<number, Store>,
  boothCreds: { url?: string; key?: string },
  detail: boolean,
  cutoff = 1, // only count booth orders up to this fraction of the show (for fair "same point" compares)
) {
  // Fetch a day either side of the show so every AEST show-day order is in the
  // window regardless of how Shopify interprets the date filter; we then count
  // only orders whose AEST date is an actual show day (no pre/post leakage).
  const since = new Date(new Date(show.date_start + "T00:00:00Z").getTime() - 86400000).toISOString().slice(0, 10);
  const until = new Date(new Date(show.date_end + "T00:00:00Z").getTime() + 86400000).toISOString().slice(0, 10);
  const state = (show.state || "").toLowerCase();
  // booth orders after this point in the show are excluded (cutoff < 1 only)
  const past = (iso?: string) => cutoff < 1 && (!iso || showFraction(iso, show.date_start, show.date_end) > cutoff);
  // true only when the order lands on an actual show day (AEST)
  const offShow = (iso?: string) => { if (!iso) return true; const od = new Date(new Date(iso).getTime() + AEST_OFFSET * 3600 * 1000).toISOString().slice(0, 10); return od < show.date_start || od > show.date_end; };

  type Prod = { title: string; brand_id: number; revenue: number; qty: number };
  const productMap = new Map<string, Prod>();
  const byHour = new Array(24).fill(0);
  const addProduct = (sku: string | null | undefined, title: string, brandId: number, exRev: number, qty: number) => {
    const key = sku && sku.trim() ? `sku:${sku.trim()}` : `t:${title}`;
    const cur = productMap.get(key) ?? { title, brand_id: brandId, revenue: 0, qty: 0 };
    cur.revenue += exRev; cur.qty += qty;
    productMap.set(key, cur);
  };
  const bucket = (iso: string | undefined, amt: number) => {
    if (!iso) return;
    const h = (new Date(iso).getUTCHours() + AEST_OFFSET) % 24;
    byHour[h] += amt;
  };
  // Per-day totals (AEST date), one entry per show day — expo stand vs online
  const byDayMap = new Map<string, { booth: number; boothOrders: number; online: number; onlineOrders: number }>();
  const aestDate = (iso: string) => new Date(new Date(iso).getTime() + AEST_OFFSET * 3600 * 1000).toISOString().slice(0, 10);
  const dayCur = (iso: string) => {
    const d = aestDate(iso);
    let c = byDayMap.get(d);
    if (!c) { c = { booth: 0, boothOrders: 0, online: 0, onlineOrders: 0 }; byDayMap.set(d, c); }
    return c;
  };
  const addDayBooth  = (iso: string | undefined, amt: number, o: number) => { if (iso) { const c = dayCur(iso); c.booth += amt; c.boothOrders += o; } };
  const addDayOnline = (iso: string | undefined, amt: number, o: number) => { if (iso) { const c = dayCur(iso); c.online += amt; c.onlineOrders += o; } };

  // Coolkidz booth till — split per brand (date-only)
  const ck = storeById.get(9);
  const ckByBrand = new Map<number, { rev: number; orders: number }>();
  if (ck) {
    const tillEdges = await shopifyOrders(ck.domain, ck.token,
      `financial_status:paid created_at:>=${since} created_at:<=${until}`,
      `createdAt lineItems(first: 20) { edges { node { title sku quantity originalTotalSet { shopMoney { amount } } product { vendor tags } } } }`);
    for (const e of tillEdges) {
      const seen = new Set<number>();
      const createdAt = e.node.createdAt;
      if (past(createdAt) || offShow(createdAt)) continue;
      let orderRev = 0;
      for (const li of e.node.lineItems.edges) {
        const it = li.node; const p = it.product || {};
        const bid = coolkidzBrandId(it.title || "", p.vendor || "", p.tags || []);
        if (bid == null) continue;
        const amt = Math.round((Number(it.originalTotalSet?.shopMoney?.amount ?? 0) / 1.1) * 100) / 100;
        orderRev += amt;
        const cur = ckByBrand.get(bid) ?? { rev: 0, orders: 0 };
        cur.rev += amt;
        if (!seen.has(bid)) { cur.orders += 1; seen.add(bid); }
        ckByBrand.set(bid, cur);
        if (detail) { addProduct(it.sku, it.title || "Unknown", bid, amt, Number(it.quantity ?? 1)); bucket(createdAt, amt); }
      }
      if (detail && orderRev > 0) addDayBooth(createdAt, orderRev, 1);
    }
  }

  // Each brand's own store — booth POS vs online (shipping to show state)
  const results = await Promise.all(brandIds.filter(id => id !== 9).map(async (id) => {
    const st = storeById.get(id);
    const name = st?.name ?? `Brand ${id}`;
    let posRev = 0, posOrders = 0, webRev = 0, webOrders = 0;
    if (st) {
      const liPart = detail ? "lineItems(first: 50) { edges { node { title sku quantity originalTotalSet { shopMoney { amount } } } } }" : "";
      const brandEdges = await shopifyOrders(st.domain, st.token,
        `financial_status:paid created_at:>=${since} created_at:<=${until}`,
        `createdAt sourceName shippingAddress { province } totalPriceSet { shopMoney { amount } } totalTaxSet { shopMoney { amount } } ${liPart}`);
      for (const e of brandEdges) {
        const n = e.node;
        const rev = exGst(Number(n.totalPriceSet?.shopMoney?.amount ?? 0), Number(n.totalTaxSet?.shopMoney?.amount ?? 0));
        if ((n.sourceName || "").toLowerCase() === "pos") {
          if (past(n.createdAt) || offShow(n.createdAt)) continue;
          posRev += rev; posOrders += 1;
          if (detail) {
            bucket(n.createdAt, rev);
            addDayBooth(n.createdAt, rev, 1);
            for (const li of n.lineItems?.edges ?? []) {
              const it = li.node;
              const amt = Math.round((Number(it.originalTotalSet?.shopMoney?.amount ?? 0) / 1.1) * 100) / 100;
              addProduct(it.sku, it.title || "Unknown", id, amt, Number(it.quantity ?? 1));
            }
          }
        }
        else if ((n.shippingAddress?.province || "").toLowerCase() === state && n.createdAt) {
          // only online orders landing on an actual show day (AEST) count as tradeshow orders
          const od = aestDate(n.createdAt);
          if (od >= show.date_start && od <= show.date_end) {
            webRev += rev; webOrders += 1;
            if (detail) addDayOnline(n.createdAt, rev, 1);
          }
        }
      }
    }
    const booth = ckByBrand.get(id) ?? { rev: 0, orders: 0 };
    return {
      brand_id: id, name,
      boothRevenue: round(posRev + booth.rev), boothOrders: posOrders + booth.orders,
      onlineRevenue: round(webRev), onlineOrders: webOrders,
    };
  }));

  const rows = [...results];

  // QR-scanned booth orders (separate booth_events Supabase) within the window
  if (boothCreds.url && boothCreds.key) {
    try {
      const qr = await fetch(
        `${boothCreds.url}/rest/v1/booth_events?event_type=eq.order&created_at=gte.${since}T00:00:00Z&created_at=lte.${until}T23:59:59Z&select=value,created_at`,
        { headers: { apikey: boothCreds.key, Authorization: `Bearer ${boothCreds.key}` }, cache: "no-store" },
      ).then(r => r.json());
      const qrRows = (qr || []).filter((e: any) => !past(e.created_at) && !offShow(e.created_at));
      const qrRev = qrRows.reduce((s: number, e: any) => s + Number(e.value ?? 0), 0);
      if (detail) for (const e of qrRows) { bucket(e.created_at, Number(e.value ?? 0)); addDayBooth(e.created_at, Number(e.value ?? 0), 1); }
      if (qrRev > 0) rows.push({ brand_id: -1, name: "QR Expo Stand (scanned)", boothRevenue: round(qrRev), boothOrders: qrRows.length, onlineRevenue: 0, onlineOrders: 0 });
    } catch { /* booth project unavailable — skip QR */ }
  }

  rows.sort((a, b) => (b.boothRevenue + b.onlineRevenue) - (a.boothRevenue + a.onlineRevenue));
  const boothTotal  = rows.reduce((s, r) => s + r.boothRevenue, 0);
  const boothOrders = rows.reduce((s, r) => s + r.boothOrders, 0);
  const onlineTotal = rows.reduce((s, r) => s + r.onlineRevenue, 0);
  const onlineOrders = rows.reduce((s, r) => s + r.onlineOrders, 0);

  const topProducts = detail
    ? [...productMap.values()].map(p => ({ ...p, revenue: round(p.revenue) })).sort((a, b) => b.revenue - a.revenue).slice(0, 8)
    : [];

  // One entry per show day (AEST), in order — expo-stand revenue + orders
  const showDays: string[] = [];
  for (let d = new Date(show.date_start + "T00:00:00Z"); d <= new Date(show.date_end + "T00:00:00Z"); d = new Date(d.getTime() + 86400000)) {
    showDays.push(d.toISOString().slice(0, 10));
  }
  const byDay = detail ? showDays.map(d => {
    const c = byDayMap.get(d);
    const booth = round(c?.booth ?? 0), online = round(c?.online ?? 0);
    const boothOrders = c?.boothOrders ?? 0, onlineOrders = c?.onlineOrders ?? 0;
    return { date: d, booth, boothOrders, online, onlineOrders, total: booth + online, orders: boothOrders + onlineOrders };
  }) : [];

  return {
    rows, boothTotal, boothOrders, onlineTotal, onlineOrders,
    showTotal: boothTotal + onlineTotal, showOrders: boothOrders + onlineOrders,
    topProducts,
    byHour: detail ? byHour.map(round) : [],
    byDay,
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const showId = url.searchParams.get("showId");
  const wantCompare = url.searchParams.get("compare") === "1";
  const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const brandsEnv = process.env.BRAND_SHOPIFY;
  if (!showId || !sbUrl || !sbKey || !brandsEnv) return NextResponse.json({ live: false });

  const sb = (path: string) =>
    fetch(`${sbUrl}/rest/v1/${path}`, { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` }, cache: "no-store" }).then(r => r.json());

  // select=* so the optional revenue_target column is picked up if it exists
  const [shows, tbRows] = await Promise.all([
    sb(`tradeshows?id=eq.${showId}&select=*`),
    sb(`tradeshow_brands?tradeshow_id=eq.${showId}&select=brand_id`),
  ]);
  const show = shows?.[0];
  if (!show) return NextResponse.json({ live: false });

  const stores: Store[] = JSON.parse(brandsEnv);
  const storeById = new Map(stores.map(s => [s.id, s]));
  const brandIds: number[] = (tbRows || []).map((r: any) => r.brand_id);
  const boothCreds = { url: process.env.BOOTH_SUPABASE_URL, key: process.env.BOOTH_SUPABASE_SERVICE_ROLE_KEY };

  const data = await computeShow(show, brandIds, storeById, boothCreds, true);

  // How far into this show we are right now (1 once it's over) — used to compare
  // the previous show only up to the same point, so a live show isn't unfairly
  // measured against a completed one.
  const nowFrac = showFraction(new Date().toISOString(), show.date_start, show.date_end);

  // Previous comparable show (same name, earlier date) — for a vs-last-time badge
  let compare: { name: string; date_start: string; boothTotal: number; showTotal: number; onlineTotal: number; samePoint: boolean; atFraction: number } | null = null;
  if (wantCompare) {
    const prevShows = await sb(`tradeshows?name=eq.${encodeURIComponent(show.name)}&date_start=lt.${show.date_start}&order=date_start.desc&limit=1&select=id,name,date_start,date_end,state`);
    const prev = prevShows?.[0];
    if (prev) {
      const prevBrands = await sb(`tradeshow_brands?tradeshow_id=eq.${prev.id}&select=brand_id`);
      const prevIds: number[] = (prevBrands || []).map((r: any) => r.brand_id);
      const prevData = await computeShow(prev, prevIds, storeById, boothCreds, false, nowFrac);
      compare = { name: prev.name, date_start: prev.date_start, boothTotal: prevData.boothTotal, showTotal: prevData.showTotal, onlineTotal: prevData.onlineTotal, samePoint: nowFrac < 1, atFraction: nowFrac };
    }
  }

  const target = show.revenue_target != null ? Number(show.revenue_target) : null;

  return NextResponse.json({
    live: true,
    show: { id: show.id, name: show.name, date_start: show.date_start, date_end: show.date_end, state: show.state },
    ...data,
    target,
    compare,
    updatedAt: new Date().toISOString(),
  });
}

// Save a per-show booth revenue target (shared across devices).
export async function POST(req: Request) {
  const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const { showId, target } = body || {};
  if (!showId) return NextResponse.json({ ok: false }, { status: 400 });
  const res = await fetch(`${sbUrl}/rest/v1/tradeshows?id=eq.${showId}`, {
    method: "PATCH",
    headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ revenue_target: target != null && target > 0 ? target : null }),
  });
  return NextResponse.json({ ok: res.ok }, { status: res.ok ? 200 : 500 });
}
