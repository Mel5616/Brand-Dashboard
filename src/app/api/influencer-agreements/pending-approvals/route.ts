import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Minimal, cheap query for the notification bell — signed agreements whose
// gift order sheet Mel hasn't approved (and therefore sent to Accounts) yet.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = () => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}` });

export async function GET() {
  const acc = await getAccess();
  if (acc.role !== "admin") return NextResponse.json({ ok: true, items: [] });
  const select = "select=id,reference,brands(name),influencers:agreement_influencers(full_name)";
  const res = await fetch(`${sbUrl}/rest/v1/influencer_agreements?status=eq.signed&order_sheet_approved_at=is.null&${select}&order=signed_at.asc&limit=50`, { headers: h(), cache: "no-store" });
  if (!res.ok) return NextResponse.json({ ok: true, items: [] });
  const rows = await res.json().catch(() => []);
  return NextResponse.json({ ok: true, items: rows.map((r: any) => ({ id: r.id, reference: r.reference, brand: r.brands?.name ?? "—", influencer: r.influencers?.full_name ?? "—" })) });
}
