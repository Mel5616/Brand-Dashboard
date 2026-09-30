import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { shopifyTokenForBrand } from "@/lib/shopifyBrandKeys";

// UPPAbaby returning-customer rate for a calendar month — live from Shopify,
// not synced. Used by the monthly report's Shopify card in place of Revenue
// (which never reconciles against the uploaded Direct Sales total, since that
// blends in spare parts + off-Shopify invoicing — see uppababy.ts). Orders
// and AOV don't have that problem, so only Revenue/D2C YTD needed replacing.
export const revalidate = 0;
export const maxDuration = 60;

const UPPABABY_BRAND_ID = 5;
const melDate = (isoStr: string) => new Date(isoStr).toLocaleDateString("en-CA", { timeZone: "Australia/Melbourne" });

export async function GET(req: Request) {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
  const month = new URL(req.url).searchParams.get("month"); // "YYYY-MM"
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ ok: false, error: "month required" }, { status: 400 });

  const creds = await shopifyTokenForBrand(UPPABABY_BRAND_ID);
  if (!creds) return NextResponse.json({ ok: false, error: "No UPPAbaby Shopify credentials" }, { status: 500 });
  const { store, token } = creds;

  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const end = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10); // first day of next month, exclusive

  // customer id -> numberOfOrders (lifetime, as of now — same simplification used
  // for the Furthr new-vs-returning classification elsewhere in the dashboard).
  const seen = new Map<string, number>();
  let orders = 0, returningOrders = 0;
  let cursor: string | null = null;
  for (let p = 0; p < 20; p++) {
    const after: string = cursor ? `, after: "${cursor}"` : "";
    const q = `{ orders(first: 250${after}, query: "financial_status:paid created_at:>=${start} created_at:<${end}", sortKey: CREATED_AT) {
      edges { cursor node { sourceName customer { id numberOfOrders } } }
      pageInfo { hasNextPage } } }`;
    const j: any = await fetch(`https://${store.domain}/admin/api/2024-01/graphql.json`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({ query: q }), cache: "no-store",
    }).then(r => r.json()).catch(() => null);
    const edges = j?.data?.orders?.edges ?? [];
    for (const e of edges) {
      const n = e.node;
      if ((n.sourceName || "").toLowerCase() === "pos") continue;
      orders++;
      const custId = n.customer?.id;
      const nOrders = Number(n.customer?.numberOfOrders) || 0;
      if (nOrders > 1) returningOrders++;
      if (custId) seen.set(custId, nOrders);
    }
    if (!j?.data?.orders?.pageInfo?.hasNextPage || edges.length === 0) break;
    cursor = edges[edges.length - 1].cursor;
  }

  const customers = seen.size;
  const returningCustomers = [...seen.values()].filter(n => n > 1).length;

  return NextResponse.json({
    ok: true, month, orders, returningOrders,
    returningOrderRate: orders > 0 ? Math.round((returningOrders / orders) * 1000) / 10 : null,
    customers, returningCustomers,
    returningCustomerRate: customers > 0 ? Math.round((returningCustomers / customers) * 1000) / 10 : null,
  });
}
