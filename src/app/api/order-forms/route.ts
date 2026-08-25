import { NextResponse } from "next/server";
import { getAccess, canManage } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

// Retailer Hub → Order Forms (admin side): catalogue summary + received orders.
// GET → { brands: [{brand, products}], orders }. PATCH ?id= → { status }.
export const revalidate = 0;
const missing = (m: string) => /PGRST205|does not exist|schema cache|relation .* does not exist/i.test(m || "");

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
  const sb = await createClient();
  const [{ data: products, error }, { data: orders }] = await Promise.all([
    sb.from("order_form_products").select("brand_name").eq("active", true),
    sb.from("opening_orders").select("*").order("created_at", { ascending: false }).limit(200),
  ]);
  if (error) return NextResponse.json({ ok: false, needsSetup: missing(error.message), brands: [], orders: [] });
  const counts = new Map<string, number>();
  for (const p of products || []) counts.set(p.brand_name, (counts.get(p.brand_name) || 0) + 1);
  return NextResponse.json({ ok: true, brands: [...counts.entries()].map(([brand, n]) => ({ brand, products: n })).sort((a, b) => a.brand.localeCompare(b.brand)), orders: orders || [] });
}

export async function PATCH(req: Request) {
  if (!(await canManage("order-forms"))) return NextResponse.json({ ok: false, error: "No access" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  if (!["new", "processed"].includes(b.status)) return NextResponse.json({ ok: false }, { status: 400 });
  const sb = await createClient();
  const { error } = await sb.from("opening_orders").update({ status: b.status }).eq("id", id);
  return NextResponse.json({ ok: !error }, { status: error ? 500 : 200 });
}

export async function DELETE(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const sb = await createClient();
  const { error } = await sb.from("opening_orders").delete().eq("id", id);
  return NextResponse.json({ ok: !error }, { status: error ? 500 : 200 });
}
