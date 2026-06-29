import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Replace marketing budgets (brand × channel × annual) for a FY from a CSV upload.
// Admin only. Keeps the existing dashboard model — just lets you update the numbers
// in-app instead of editing the Google Sheet.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hdr = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const toNum = (v: unknown) => { const s = String(v ?? "").replace(/[^0-9.\-]/g, ""); if (s === "") return 0; const n = Number(s); return Number.isFinite(n) ? n : 0; };

// Update a single brand × channel budget for a FY (no delete) — inline edits.
export async function PATCH(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const fy = String(b.fy || "2025-26");
  let brand_id = b.brand_id;
  if (brand_id == null && b.brand) {
    const bRes = await fetch(`${sbUrl}/rest/v1/brands?select=id,name`, { headers: hdr(), cache: "no-store" });
    const brands = bRes.ok ? await bRes.json() : [];
    const n = norm(String(b.brand));
    brand_id = brands.find((x: any) => { const bn = norm(x.name); return bn === n || bn.startsWith(n) || n.startsWith(bn); })?.id;
  }
  if (brand_id == null || !b.channel) return NextResponse.json({ ok: false, error: "brand + channel required" }, { status: 400 });
  const row = { brand_id, channel: String(b.channel), annual_budget: toNum(b.budget), fy };
  const res = await fetch(`${sbUrl}/rest/v1/marketing_budgets?on_conflict=brand_id,channel,fy`, { method: "POST", headers: hdr({ Prefer: "resolution=merge-duplicates,return=minimal" }), body: JSON.stringify(row) });
  return NextResponse.json({ ok: res.ok }, { status: res.ok ? 200 : 500 });
}

export async function POST(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const fy = String(b.fy || "2025-26");
  const csvRows: any[] = Array.isArray(b.rows) ? b.rows : [];
  if (csvRows.length === 0) return NextResponse.json({ ok: false, error: "No rows." }, { status: 400 });

  // Resolve brand name → brand_id from the brands table.
  const bRes = await fetch(`${sbUrl}/rest/v1/brands?select=id,name`, { headers: hdr(), cache: "no-store" });
  const brands = bRes.ok ? await bRes.json() : [];
  const idFor = (name: string) => {
    const n = norm(name); if (!n) return null;
    const hit = brands.find((x: any) => { const bn = norm(x.name); return bn === n || bn.startsWith(n) || n.startsWith(bn); });
    return hit ? hit.id : null;
  };

  const rows: any[] = []; const unmatched = new Set<string>();
  for (const r of csvRows) {
    const brand = r.brand ?? r.Brand ?? "";
    const channel = (r.channel ?? r.Channel ?? "").toString().trim();
    if (!brand || !channel) continue;
    const bid = idFor(brand);
    if (bid == null) { unmatched.add(String(brand)); continue; }
    rows.push({ brand_id: bid, channel, annual_budget: toNum(r.budget ?? r.annual_budget ?? r.Budget), fy });
  }
  if (rows.length === 0) return NextResponse.json({ ok: false, error: `No rows matched a brand. Unmatched: ${[...unmatched].join(", ") || "none"}` }, { status: 400 });

  if (b.replace) {
    await fetch(`${sbUrl}/rest/v1/marketing_budgets?fy=eq.${encodeURIComponent(fy)}`, { method: "DELETE", headers: hdr({ Prefer: "return=minimal" }) }).catch(() => {});
  }
  const res = await fetch(`${sbUrl}/rest/v1/marketing_budgets?on_conflict=brand_id,channel,fy`, { method: "POST", headers: hdr({ Prefer: "resolution=merge-duplicates,return=minimal" }), body: JSON.stringify(rows) });
  if (!res.ok) { const t = await res.text(); return NextResponse.json({ ok: false, error: (t || "Upload failed").slice(0, 300) }, { status: 500 }); }
  return NextResponse.json({ ok: true, count: rows.length, fy, unmatched: [...unmatched] });
}
