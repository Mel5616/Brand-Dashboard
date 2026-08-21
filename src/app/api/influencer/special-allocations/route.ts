import { NextResponse } from "next/server";
import { giftOk } from "@/lib/giftKey";
import { getAccess } from "@/lib/access";

// Gift allocations funded outside the normal Influencer Marketing budget —
// tracked by quantity sent against a cap, not by $ spend. Readable from the
// team gift-log form (gift-key auth); only admins create/delete allocations.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hdr = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const missing = (status: number, body: string) => status === 404 || /PGRST205|does not exist|schema cache/i.test(body);

export async function GET(req: Request) {
  if (!(await giftOk(req))) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false, allocations: [] }, { status: 500 });
  const [aRes, eRes] = await Promise.all([
    fetch(`${sbUrl}/rest/v1/influencer_special_allocations?select=*&order=created_at.asc`, { headers: hdr(), cache: "no-store" }),
    fetch(`${sbUrl}/rest/v1/influencer_entries?special_allocation_id=not.is.null&select=special_allocation_id`, { headers: hdr(), cache: "no-store" }),
  ]);
  const aText = await aRes.text();
  if (!aRes.ok) return NextResponse.json({ ok: false, needsSetup: missing(aRes.status, aText), allocations: [] });
  const rows = JSON.parse(aText || "[]") as any[];
  const entries = eRes.ok ? (JSON.parse(await eRes.text() || "[]") as any[]) : [];
  const sentBy = new Map<number, number>();
  for (const e of entries) sentBy.set(e.special_allocation_id, (sentBy.get(e.special_allocation_id) ?? 0) + 1);
  const allocations = rows.map(r => ({ id: r.id, name: r.name, brand: r.brand, target_qty: r.target_qty, sent: sentBy.get(r.id) ?? 0 }));
  return NextResponse.json({ ok: true, allocations });
}

export async function POST(req: Request) {
  if (!(await giftOk(req))) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const name = String(b.name ?? "").trim();
  if (!name) return NextResponse.json({ ok: false, error: "Name required" }, { status: 400 });
  const row = { name, brand: b.brand ? String(b.brand).trim() : null, target_qty: Number(b.target_qty) || 0 };
  const res = await fetch(`${sbUrl}/rest/v1/influencer_special_allocations`, { method: "POST", headers: hdr({ Prefer: "return=minimal" }), body: JSON.stringify(row) });
  if (!res.ok) { const t = await res.text(); return NextResponse.json({ ok: false, needsSetup: missing(res.status, t) }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  if (!(await giftOk(req))) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  // Un-tag any entries first (the FK has no cascade) so old gifts aren't lost.
  await fetch(`${sbUrl}/rest/v1/influencer_entries?special_allocation_id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: hdr({ Prefer: "return=minimal" }), body: JSON.stringify({ special_allocation_id: null }) });
  const res = await fetch(`${sbUrl}/rest/v1/influencer_special_allocations?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: hdr({ Prefer: "return=minimal" }) });
  return NextResponse.json({ ok: res.ok }, { status: res.ok ? 200 : 500 });
}
