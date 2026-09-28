import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { cin7Fetch, cin7Configured } from "@/lib/cin7";

// Real product/variant lookup in Cin7 — used by the Giveaways and Product
// Requests forms so a push to Cin7 uses real productId/productOptionId
// pairs, not a guess parsed from free text. Read-only (GET /v1/Products).
export const revalidate = 0;
export const maxDuration = 30;

export async function GET(req: Request) {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
  if (!cin7Configured()) return NextResponse.json({ ok: false, error: "Cin7 isn't configured (CIN7_USERNAME/CIN7_API_KEY)" }, { status: 400 });
  const q = (new URL(req.url).searchParams.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json({ ok: true, results: [] });

  // Cin7's `where` clause is raw SQL-ish text — escape single quotes in the
  // search term so a query like "Baby's" can't break out of the string.
  const escaped = q.replace(/'/g, "''");
  const where = encodeURIComponent(`Name like '%${escaped}%'`);
  const res = await cin7Fetch(`/v1/Products?where=${where}&limit=15`);
  if (!res?.ok) return NextResponse.json({ ok: false, error: "Cin7 lookup failed" }, { status: 502 });
  const products: any[] = await res.json().catch(() => []);

  const results = products.map(p => ({
    product_id: p.id, name: p.name, brand: p.brand || null,
    options: (p.productOptions || []).filter((o: any) => o.status !== "Discontinued").map((o: any) => ({
      product_option_id: o.id, code: o.code, stock_available: o.stockAvailable ?? null, retail_price: o.retailPrice ?? null,
    })),
  })).filter(p => p.options.length > 0);

  return NextResponse.json({ ok: true, results });
}
