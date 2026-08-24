import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Generic CRUD for a retailer kit's sub-resources (products / price rows /
// quiz questions). Dispatch key is "resource", not "kind" — see the same
// note in /api/activation-plan for why.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hdr = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const missing = (status: number, body: string) => status === 404 || /PGRST205|does not exist|schema cache/i.test(body);

const TABLES: Record<string, string> = {
  product: "retailer_kit_products", price_row: "retailer_kit_price_rows", question: "retailer_kit_quiz_questions",
};

export async function GET(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  const kitId = new URL(req.url).searchParams.get("kit_id");
  if (!kitId) return NextResponse.json({ ok: false }, { status: 400 });
  const [pRes, prRes, qRes] = await Promise.all([
    fetch(`${sbUrl}/rest/v1/retailer_kit_products?kit_id=eq.${kitId}&select=*&order=sort_order.asc`, { headers: hdr(), cache: "no-store" }),
    fetch(`${sbUrl}/rest/v1/retailer_kit_price_rows?kit_id=eq.${kitId}&select=*&order=sort_order.asc`, { headers: hdr(), cache: "no-store" }),
    fetch(`${sbUrl}/rest/v1/retailer_kit_quiz_questions?kit_id=eq.${kitId}&select=*&order=sort_order.asc`, { headers: hdr(), cache: "no-store" }),
  ]);
  const text = await pRes.text();
  if (!pRes.ok) return NextResponse.json({ ok: false, needsSetup: missing(pRes.status, text), products: [], priceRows: [], questions: [] });
  return NextResponse.json({
    ok: true,
    products: JSON.parse(text || "[]"),
    priceRows: prRes.ok ? JSON.parse((await prRes.text()) || "[]") : [],
    questions: qRes.ok ? JSON.parse((await qRes.text()) || "[]") : [],
  });
}

export async function POST(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const table = TABLES[b.resource];
  if (!table || !b.kit_id) return NextResponse.json({ ok: false, error: "bad resource/kit_id" }, { status: 400 });
  const { resource, ...row } = b;
  const res = await fetch(`${sbUrl}/rest/v1/${table}`, { method: "POST", headers: hdr({ Prefer: "return=representation" }), body: JSON.stringify(row) });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text), error: text.slice(0, 200) }, { status: 500 });
  return NextResponse.json({ ok: true, item: JSON.parse(text)[0] });
}

export async function PATCH(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const table = TABLES[b.resource];
  if (!table || !b.id) return NextResponse.json({ ok: false, error: "bad resource/id" }, { status: 400 });
  const { resource, id, ...fields } = b;
  const res = await fetch(`${sbUrl}/rest/v1/${table}?id=eq.${encodeURIComponent(String(id))}`, { method: "PATCH", headers: hdr({ Prefer: "return=minimal" }), body: JSON.stringify(fields) });
  return NextResponse.json({ ok: res.ok }, { status: res.ok ? 200 : 500 });
}

export async function DELETE(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  const url = new URL(req.url);
  const resource = url.searchParams.get("resource") || "";
  const id = url.searchParams.get("id");
  const table = TABLES[resource];
  if (!table || !id) return NextResponse.json({ ok: false, error: "bad resource/id" }, { status: 400 });
  const res = await fetch(`${sbUrl}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: hdr({ Prefer: "return=minimal" }) });
  return NextResponse.json({ ok: res.ok }, { status: res.ok ? 200 : 500 });
}
