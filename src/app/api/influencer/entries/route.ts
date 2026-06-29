import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { parseCount } from "@/lib/num";

// Influencer gift entries. POST is called by the team's standalone form — it
// looks up the product cost SERVER-SIDE, computes gifting cost (exact cost,
// falling back to RRP × the brand's average cost ratio for one-offs), stores
// it, and returns nothing sensitive. GET (dashboard) returns entries with cost.

export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const round = (n: number) => Math.round(n * 100) / 100;

function headers(extra: Record<string, string> = {}) {
  return { apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra };
}
function missing(status: number, body: string) {
  return status === 404 || /PGRST205|does not exist|schema cache/i.test(body);
}
const sb = (path: string) => fetch(`${sbUrl}/rest/v1/${path}`, { headers: headers(), cache: "no-store" });

export async function GET() {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false, entries: [] }, { status: 500 });
  // cost data — admin only
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "forbidden", entries: [] }, { status: 403 });
  const res = await sb(`influencer_entries?select=*&order=created_at.desc`);
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text), entries: [] });
  return NextResponse.json({ ok: true, entries: JSON.parse(text || "[]") });
}

export async function POST(req: Request) {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  if (!b.month_key) return NextResponse.json({ ok: false, error: "month required" }, { status: 400 });

  let brand: string | null = b.brand ?? null;
  let product_name: string | null = b.product_name ?? null;
  let rrp: number | null = b.rrp != null ? Number(b.rrp) : null;
  let gifting_cost: number | null = null;

  // Look up the product (server-side) to get cost + canonical brand/RRP
  if (b.style_code) {
    const pr = await sb(`influencer_products?style_code=eq.${encodeURIComponent(b.style_code)}&select=*&limit=1`);
    if (pr.ok) {
      const p = (await pr.json())?.[0];
      if (p) {
        brand = p.brand ?? brand;
        product_name = p.product_name ?? product_name;
        if (rrp == null && p.rrp != null) rrp = Number(p.rrp);
        if (p.cost_price != null) gifting_cost = Number(p.cost_price);           // exact cost
        else if (p.cost_ratio != null && rrp != null) gifting_cost = round(rrp * Number(p.cost_ratio)); // ratio
      }
    }
  }

  // Fallback for one-offs / products without a stored cost: RRP × brand avg ratio
  if (gifting_cost == null && rrp != null && brand) {
    const ar = await sb(`influencer_products?brand=eq.${encodeURIComponent(brand)}&select=cost_ratio`);
    let ratio = 0.3;
    if (ar.ok) {
      const ratios = (await ar.json()).map((r: any) => Number(r.cost_ratio)).filter((n: number) => n > 0);
      if (ratios.length) ratio = ratios.reduce((s: number, n: number) => s + n, 0) / ratios.length;
    }
    gifting_cost = round(rrp * ratio);
  }
  if (gifting_cost == null) gifting_cost = 0;

  const influencer_cost = b.influencer_cost != null ? Number(b.influencer_cost) : 0;
  const row = {
    month_key: b.month_key, handle: b.handle || null, platform: b.platform || null,
    followers: parseCount(b.followers),
    campaign: b.campaign || null, brand, style_code: b.style_code || null, product_name, rrp,
    affiliate_code: b.affiliate_code ? String(b.affiliate_code).slice(0, 120) : null,
    gifting_cost, influencer_cost, total_cost: round(gifting_cost + influencer_cost),
  };
  const res = await fetch(`${sbUrl}/rest/v1/influencer_entries`, { method: "POST", headers: headers({ Prefer: "return=minimal" }), body: JSON.stringify(row) });
  if (!res.ok) { const t = await res.text(); return NextResponse.json({ ok: false, needsSetup: missing(res.status, t) }, { status: 500 }); }

  // Keep the influencer roster current — upsert the influencer by handle.
  if (b.handle) {
    let handle = String(b.handle).trim(); if (!handle.startsWith("@")) handle = "@" + handle.replace(/^@+/, "");
    const inf: any = { handle, updated_at: new Date().toISOString() };
    if (b.name) inf.name = b.name;
    if (b.platform) inf.platform = b.platform;
    if (row.followers != null) inf.followers = row.followers;
    if (b.profile_url) inf.profile_url = String(b.profile_url).slice(0, 500);
    try { await fetch(`${sbUrl}/rest/v1/influencers?on_conflict=handle`, { method: "POST", headers: headers({ Prefer: "resolution=merge-duplicates,return=minimal" }), body: JSON.stringify(inf) }); } catch { /* roster table optional */ }
  }
  return NextResponse.json({ ok: true }); // no cost returned to the team form
}

// Update results / status on an existing gift (admin: reach, engagement, sales…)
export async function PATCH(req: Request) {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  if (!b.id) return NextResponse.json({ ok: false }, { status: 400 });
  const fields: any = {};
  for (const k of ["status", "content_url"]) if (b[k] !== undefined) fields[k] = b[k] || null;
  for (const k of ["reach", "engagements", "sales_value"]) if (b[k] !== undefined) fields[k] = b[k] === "" || b[k] == null ? null : Number(b[k]);
  if (Object.keys(fields).length === 0) return NextResponse.json({ ok: false }, { status: 400 });
  const res = await fetch(`${sbUrl}/rest/v1/influencer_entries?id=eq.${encodeURIComponent(String(b.id))}`, { method: "PATCH", headers: headers({ Prefer: "return=minimal" }), body: JSON.stringify(fields) });
  if (!res.ok) { const t = await res.text(); return NextResponse.json({ ok: false, needsSetup: missing(res.status, t) }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const res = await fetch(`${sbUrl}/rest/v1/influencer_entries?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: headers({ Prefer: "return=minimal" }) });
  return NextResponse.json({ ok: res.ok }, { status: res.ok ? 200 : 500 });
}
