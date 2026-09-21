import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

export const revalidate = 0;

const NUM = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const STR = (v: any) => (v === undefined || v === null || String(v).trim() === "") ? null : String(v).trim();

// List products (any logged-in user). Import rows from the Excel (admin only).
export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ products: [] }, { status: 401 });
  const sb = await createClient();
  const { data, error } = await sb.from("new_products").select("*").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ products: [], needsSetup: /relation|does not exist|schema cache/i.test(error.message) });
  return NextResponse.json({ products: data ?? [] });
}

export async function POST(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });
  let body: any; try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  const rows: any[] = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length) return NextResponse.json({ error: "No rows to import" }, { status: 400 });
  const sb = await createClient();

  const { data: brands } = await sb.from("brands").select("id, name");
  const brandFor = (name: string) => {
    const low = (name || "").toLowerCase();
    for (const b of (brands ?? [])) if (b.name && low.includes(String(b.name).toLowerCase())) return b.id; // full brand name in product name
    const first = low.split(/\s+/)[0];                                                                     // else match the leading word (e.g. "Gaia" → "Gaia Baby")
    for (const b of (brands ?? [])) { const bw = String(b.name || "").toLowerCase().split(/\s+/)[0]; if (bw.length >= 4 && bw === first) return b.id; }
    return null;
  };

  const clean = rows
    .map(r => ({
      name: STR(r.name), sku: STR(r.sku), source_description: STR(r.source_description),
      barcode: STR(r.barcode), weight: NUM(r.weight), length: NUM(r.length), width: NUM(r.width), height: NUM(r.height),
      wholesale_price: NUM(r.wholesale_price), rrp: NUM(r.rrp),
      brand_id: brandFor(r.name),
    }))
    .filter(r => r.name && r.sku);
  if (!clean.length) return NextResponse.json({ error: "No valid rows (need Name and Code)" }, { status: 400 });

  // Upsert by SKU: new rows are inserted, existing ones get their supplier
  // data (name, dims, barcode, wholesale/RRP) refreshed from the sheet. This
  // only ever touches the columns listed in `clean` above, so it can't clobber
  // the AI-drafted copy fields (long_description etc) — those simply aren't
  // part of the payload. ignoreDuplicates was dropped because it was silently
  // discarding pricing on every re-upload of a SKU already in the table.
  const skus = clean.map(r => r.sku) as string[];
  const { data: before } = await sb.from("new_products").select("sku").in("sku", skus);
  const existed = new Set((before ?? []).map((r: any) => r.sku));

  const { data, error } = await sb
    .from("new_products")
    .upsert(clean, { onConflict: "sku" })
    .select("id, sku");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const created = (data ?? []).filter(r => !existed.has(r.sku)).length;
  const updated = (data ?? []).length - created;
  return NextResponse.json({ ok: true, imported: created, updated, received: clean.length });
}
