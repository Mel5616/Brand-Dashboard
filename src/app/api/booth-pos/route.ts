import { NextResponse } from "next/server";

// Live Shopify POS query for booth orders. Called on demand from the Tradeshows
// tab so it doesn't add latency to other pages. POS orders are distinct from QR
// booth orders, so they can be summed for total booth revenue.
//   default / ?store=uppababy → UPPAbaby store (UPPABABY_SHOPIFY_* env)
//   ?store=coolkidz           → Coolkidz booth till (brand id 9 in BRAND_SHOPIFY)

export const revalidate = 0;

const API_VERSION = "2024-01";
// Booth POS go-live date — only count orders on/after this so historical
// test POS orders are excluded. Real booth sales start here.
const POS_GO_LIVE = "2026-06-20";

// Resolve the store credentials for the requested storefront.
function storeCreds(store: string): { domain?: string; token?: string } {
  if (store === "coolkidz") {
    try {
      const stores = JSON.parse(process.env.BRAND_SHOPIFY || "[]");
      const ck = stores.find((s: any) => s.id === 9);
      return { domain: ck?.domain, token: ck?.token };
    } catch { return {}; }
  }
  return { domain: process.env.UPPABABY_SHOPIFY_DOMAIN, token: process.env.UPPABABY_SHOPIFY_TOKEN };
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const store = sp.get("store") || "uppababy";
  const { domain, token } = storeCreds(store);
  if (!domain || !token) {
    return NextResponse.json({ ok: false, orders: 0, revenue: 0, daily: [] });
  }

  // Optional show window (YYYY-MM-DD) to scope POS to a single expo; else since go-live.
  const rawSince = sp.get("since");
  const rawUntil = sp.get("until");
  const iso = (v: string | null) => v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  const since = iso(rawSince) || POS_GO_LIVE;
  const until = iso(rawUntil);

  // Paginate so high-volume POS isn't truncated at the 250 page cap.
  // source_name:pos filters server-side so web orders never crowd out POS.
  async function fetchAllPos(): Promise<any[]> {
    const out: any[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 8; page++) {
      const after: string = cursor ? `, after: "${cursor}"` : "";
      // Pad the end by a day so AEST show-day orders near the UTC boundary aren't clipped.
      const untilPad = until ? new Date(new Date(until + "T00:00:00Z").getTime() + 86400000).toISOString().slice(0, 10) : null;
      const untilQ = untilPad ? ` created_at:<=${untilPad}` : "";
      const query = `{
        orders(first: 250${after}, query: "financial_status:paid source_name:pos created_at:>=${since}${untilQ}", sortKey: CREATED_AT, reverse: true) {
          edges { cursor node { sourceName createdAt totalPriceSet { shopMoney { amount } } } }
          pageInfo { hasNextPage }
        }
      }`;
      const res = await fetch(`https://${domain}/admin/api/${API_VERSION}/graphql.json`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token! },
        body: JSON.stringify({ query }),
        cache: "no-store",
      });
      const json = await res.json();
      const orders = json?.data?.orders;
      const edges = orders?.edges ?? [];
      for (const e of edges) out.push(e.node);
      if (!orders?.pageInfo?.hasNextPage || edges.length === 0) break;
      cursor = edges[edges.length - 1].cursor;
    }
    return out;
  }

  try {
    const pos = (await fetchAllPos()).filter((n: any) => (n.sourceName || "").toLowerCase() === "pos");

    let revenue = 0;
    const byDay = new Map<string, { date: string; revenue: number; orders: number }>();
    for (const n of pos) {
      const amt = Number(n.totalPriceSet?.shopMoney?.amount ?? 0);
      revenue += amt;
      // Bucket by Melbourne date (DST-aware) — Shopify's created_at is UTC, so
      // early-morning show-day orders would otherwise fall into the previous day.
      const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(n.createdAt));
      const d = byDay.get(date) ?? { date, revenue: 0, orders: 0 };
      d.revenue += amt;
      d.orders += 1;
      byDay.set(date, d);
    }
    const daily = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
    return NextResponse.json({ ok: true, orders: pos.length, revenue, daily });
  } catch (e: any) {
    return NextResponse.json({ ok: false, orders: 0, revenue: 0, daily: [], error: String(e) });
  }
}
