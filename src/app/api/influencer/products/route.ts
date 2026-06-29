import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Team-facing product list for the gift entry form. Returns ONLY name, style
// code, brand and RRP — never the cost price. The cost lives in Supabase and is
// only ever read server-side (entries route) to compute gifting cost.
// POST (admin) replaces the product catalogue from a CSV upload.

export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hdr = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const toNum = (v: unknown) => { const s = String(v ?? "").replace(/[^0-9.\-]/g, ""); if (s === "") return null; const n = Number(s); return Number.isFinite(n) ? n : null; };

function missing(status: number, body: string) {
  return status === 404 || /PGRST205|does not exist|schema cache/i.test(body);
}

export async function GET() {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false, products: [] }, { status: 500 });
  // NB: cost_price / cost_ratio deliberately excluded from the select
  const res = await fetch(`${sbUrl}/rest/v1/influencer_products?select=style_code,product_name,brand,rrp&order=product_name.asc`, {
    headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` }, cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text), products: [] });
  return NextResponse.json({ ok: true, products: JSON.parse(text || "[]") });
}

// Replace (or merge) the product catalogue from an uploaded CSV. Admin only.
// Body: { rows: [{ style_code, product_name, brand, cost_price, rrp }], replace?: boolean }
export async function POST(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  // Dedupe by style_code (last wins), skip blanks and any "zz" placeholder codes,
  // and default the (NOT NULL) product name to the style code if missing.
  const byCode = new Map<string, any>();
  let skipped = 0;
  for (const r of (Array.isArray(b.rows) ? b.rows : [])) {
    const code = String(r.style_code ?? r.sku ?? "").trim();
    if (!code || /zz/i.test(code)) { skipped++; continue; }
    const rrp = toNum(r.rrp), cost = toNum(r.cost_price ?? r.cost);
    byCode.set(code, {
      style_code: code,
      product_name: (r.product_name ?? r.product ?? r.name ?? "").toString().trim() || code,
      brand: (r.brand ?? null) || null,
      cost_price: cost, rrp,
      cost_ratio: rrp && cost != null && rrp > 0 ? Number((cost / rrp).toFixed(4)) : null,
    });
  }
  const rows = [...byCode.values()];
  if (rows.length === 0) return NextResponse.json({ ok: false, error: "No valid rows (need a style_code)." }, { status: 400 });

  // Start fresh when requested, so each upload re-bases the catalogue.
  if (b.replace) {
    await fetch(`${sbUrl}/rest/v1/influencer_products?style_code=not.is.null`, { method: "DELETE", headers: hdr({ Prefer: "return=minimal" }) }).catch(() => {});
  }
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200);
    const res = await fetch(`${sbUrl}/rest/v1/influencer_products?on_conflict=style_code`, { method: "POST", headers: hdr({ Prefer: "resolution=merge-duplicates,return=minimal" }), body: JSON.stringify(batch) });
    if (!res.ok) {
      const t = await res.text();
      return NextResponse.json({ ok: false, needsSetup: missing(res.status, t), error: (t || "Upload failed").slice(0, 300) }, { status: 500 });
    }
    inserted += batch.length;
  }
  return NextResponse.json({ ok: true, count: inserted, skipped });
}
