import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { rest } from "@/lib/registry";
import { storeCreds, mintToken } from "@/lib/shopifyMint";
import { REWARD_BRANDS } from "@/lib/reviewRewards";

// Products with fewer than three published reviews, per brand: the list to
// point QR inserts and post-purchase nudges at. Active products come from
// each brand's Shopify (cached an hour in this process); review counts from
// the klaviyo_reviews mirror, matched on product handle.
export const revalidate = 0;
const MIN = 3;
type Product = { handle: string; title: string; url: string; image: string | null };
const cache = new Map<number, { at: number; products: Product[] }>();

async function products(brandId: number, host: string): Promise<Product[] | null> {
  const hit = cache.get(brandId);
  if (hit && Date.now() - hit.at < 3600e3) return hit.products;
  const cred = storeCreds().find(c => c.id === brandId);
  const token = cred ? await mintToken(cred) : null;
  if (!cred || !token) return null;
  const out: Product[] = [];
  let after: string | null = null;
  for (let i = 0; i < 8; i++) {
    const q = `query($after: String) { products(first: 250, after: $after, query: "status:active AND published_status:published") { pageInfo { hasNextPage endCursor } nodes { handle title productType featuredMedia { preview { image { url } } } } } }`;
    const res: any = await fetch(`https://${cred.domain}/admin/api/2025-07/graphql.json`, { method: "POST", headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" }, body: JSON.stringify({ query: q, variables: { after } }), cache: "no-store" }).then(r => r.json()).catch(() => null);
    const p = res?.data?.products;
    if (!p) break;
    for (const n of p.nodes) {
      if (/gift card|sample|warranty|donation/i.test(n.title)) continue;
      out.push({ handle: n.handle, title: n.title, url: `https://${host}/products/${n.handle}`, image: n.featuredMedia?.preview?.image?.url ?? null });
    }
    if (!p.pageInfo.hasNextPage) break;
    after = p.pageInfo.endCursor;
  }
  cache.set(brandId, { at: Date.now(), products: out });
  return out;
}

export async function GET() {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false }, { status: 403 });
  // published review counts per brand + handle
  const counts = new Map<string, number>();
  for (let from = 0; ; from += 1000) {
    const res = await rest("klaviyo_reviews?select=brand_id,product_url,status,review_type", { headers: { Range: `${from}-${from + 999}` } });
    if (!res.ok) break;
    const page = (await res.json()) as { brand_id: number; product_url: string | null; status: string | null; review_type: string | null }[];
    for (const r of page) {
      if (r.review_type === "question" || !(r.status === "published" || r.status === "featured")) continue;
      const handle = (r.product_url || "").split("/products/")[1]?.split(/[?#]/)[0];
      if (handle) counts.set(`${r.brand_id}:${handle}`, (counts.get(`${r.brand_id}:${handle}`) || 0) + 1);
    }
    if (page.length < 1000) break;
  }
  const brands = await Promise.all(REWARD_BRANDS.filter(b => b.id !== 0).map(async b => {
    const ps = await products(b.id, b.host);
    if (!ps) return { id: b.id, brand: b.name, connected: false, total: 0, thin: [] as (Product & { reviews: number })[] };
    const thin = ps.map(p => ({ ...p, reviews: counts.get(`${b.id}:${p.handle}`) || 0 })).filter(p => p.reviews < MIN).sort((a, c) => a.reviews - c.reviews || a.title.localeCompare(c.title));
    return { id: b.id, brand: b.name, connected: true, total: ps.length, thin };
  }));
  return NextResponse.json({ ok: true, min: MIN, brands: brands.sort((a, b) => (b.total - b.thin.length) - (a.total - a.thin.length)) });
}
