import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { shopifyTokenForBrand } from "@/lib/shopifyBrandKeys";

// Real product/variant lookup for a brand's live store — used by the
// Giveaways and Product Requests forms so a push to Shopify uses actual
// SKUs/variant ids, not a guess parsed from free text. Read-only against
// Shopify (GET products.json); no precedent existed for this in the repo
// before, so this is new, modelled on new-products/[id]/draft's
// liveStyleReference() for the auth/fetch shape.
export const revalidate = 0;
export const maxDuration = 30;

export async function GET(req: Request) {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
  const url = new URL(req.url);
  const brandId = Number(url.searchParams.get("brand_id"));
  const q = (url.searchParams.get("q") || "").trim();
  if (!Number.isFinite(brandId)) return NextResponse.json({ ok: false, error: "brand_id required" }, { status: 400 });

  const resolved = await shopifyTokenForBrand(brandId);
  if (!resolved) return NextResponse.json({ ok: false, error: "This brand has no Shopify store configured" }, { status: 400 });
  const { store, token } = resolved;

  // Shopify's REST products.json doesn't support server-side title search
  // reliably across all plans, so pull a working page and filter client-side
  // — fine at these volumes (a few hundred active products per store).
  const res = await fetch(`https://${store.domain}/admin/api/2024-10/products.json?limit=250&status=active&fields=id,title,variants,images`, {
    headers: { "X-Shopify-Access-Token": token }, cache: "no-store",
  }).catch(() => null);
  if (!res?.ok) return NextResponse.json({ ok: false, error: "Shopify lookup failed" }, { status: 502 });
  const json = await res.json().catch(() => ({}));
  const products: any[] = json.products || [];

  const needle = q.toLowerCase();
  const matches = (needle ? products.filter(p => String(p.title || "").toLowerCase().includes(needle)) : products).slice(0, 25);

  const results = matches.map(p => ({
    product_id: p.id, title: p.title, image_url: p.images?.[0]?.src || null,
    variants: (p.variants || []).map((v: any) => ({
      variant_id: v.id, title: v.title === "Default Title" ? null : v.title, sku: v.sku || null, price: v.price ? Number(v.price) : null,
    })),
  }));

  return NextResponse.json({ ok: true, results });
}
