import { NextResponse } from "next/server";
import { getAccess, canManage } from "@/lib/access";
import { parseCount } from "@/lib/num";

// Partnerships & affiliates: free product given to companies/affiliates. Cost is
// looked up from the shared influencer_products catalogue (× qty) so spend can be
// tracked against budget. Admin only (cost-bearing).
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const sb = (p: string) => fetch(`${sbUrl}/rest/v1/${p}`, { headers: headers(), cache: "no-store" });
const round = (n: number) => Math.round(n * 100) / 100;
const missing = (s: number, b: string) => s === 404 || /PGRST205|does not exist|schema cache/i.test(b);

export async function GET() {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false, entries: [] }, { status: 500 });
  if (!(await getAccess()).role) return NextResponse.json({ ok: false, error: "unauthorised", entries: [] }, { status: 401 }); // read: any signed-in user
  const res = await sb("partnership_entries?select=*&order=created_at.desc");
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text), entries: [] });
  return NextResponse.json({ ok: true, entries: JSON.parse(text || "[]") });
}

export async function POST(req: Request) {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  if (!(await canManage("pa-tracker"))) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  if (!b.month_key) return NextResponse.json({ ok: false, error: "month required" }, { status: 400 });

  let brand: string | null = b.brand ?? null;
  let product_name: string | null = b.product_name ?? null;
  let rrp: number | null = b.rrp != null && b.rrp !== "" ? Number(b.rrp) : null;
  let unitCost: number | null = null;
  const qty = Math.max(1, parseCount(b.qty) ?? 1);

  if (b.style_code) {
    const pr = await sb(`influencer_products?style_code=eq.${encodeURIComponent(b.style_code)}&select=*&limit=1`);
    if (pr.ok) {
      const p = (await pr.json())?.[0];
      if (p) {
        brand = p.brand ?? brand;
        product_name = p.product_name ?? product_name;
        if (rrp == null && p.rrp != null) rrp = Number(p.rrp);
        if (p.cost_price != null) unitCost = Number(p.cost_price);
        else if (p.cost_ratio != null && rrp != null) unitCost = round(rrp * Number(p.cost_ratio));
      }
    }
  }
  if (unitCost == null && rrp != null && brand) {
    const ar = await sb(`influencer_products?brand=eq.${encodeURIComponent(brand)}&select=cost_ratio`);
    let ratio = 0.3;
    if (ar.ok) { const rs = (await ar.json()).map((r: any) => Number(r.cost_ratio)).filter((n: number) => n > 0); if (rs.length) ratio = rs.reduce((s: number, n: number) => s + n, 0) / rs.length; }
    unitCost = round(rrp * ratio);
  }
  if (unitCost == null) unitCost = 0;

  const cash_fee = b.cash_fee != null && b.cash_fee !== "" ? Number(b.cash_fee) : 0;
  const gifting_cost = round(unitCost * qty);
  const row = {
    month_key: b.month_key, company: b.company || null, brand,
    style_code: b.style_code || null, product_name, qty, rrp,
    gifting_cost, cash_fee, total_cost: round(gifting_cost + cash_fee),
    affiliate_code: b.affiliate_code ? String(b.affiliate_code).slice(0, 120) : null,
    status: b.status || null,
  };
  const res = await fetch(`${sbUrl}/rest/v1/partnership_entries`, { method: "POST", headers: headers({ Prefer: "return=minimal" }), body: JSON.stringify(row) });
  if (!res.ok) { const t = await res.text(); return NextResponse.json({ ok: false, needsSetup: missing(res.status, t) }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request) {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  if (!(await canManage("pa-tracker"))) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  if (!b.id) return NextResponse.json({ ok: false }, { status: 400 });
  const fields: Record<string, any> = {};
  for (const k of ["company", "status", "content_url", "affiliate_code"]) if (b[k] !== undefined) fields[k] = b[k] || null;
  if (Object.keys(fields).length === 0) return NextResponse.json({ ok: false }, { status: 400 });
  const res = await fetch(`${sbUrl}/rest/v1/partnership_entries?id=eq.${encodeURIComponent(String(b.id))}`, { method: "PATCH", headers: headers({ Prefer: "return=minimal" }), body: JSON.stringify(fields) });
  return NextResponse.json({ ok: res.ok }, { status: res.ok ? 200 : 500 });
}

export async function DELETE(req: Request) {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  if (!(await canManage("pa-tracker"))) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const res = await fetch(`${sbUrl}/rest/v1/partnership_entries?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: headers({ Prefer: "return=minimal" }) });
  return NextResponse.json({ ok: res.ok }, { status: res.ok ? 200 : 500 });
}
