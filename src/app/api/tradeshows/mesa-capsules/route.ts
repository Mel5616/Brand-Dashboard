import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Lightweight: Mesa Capsule units sold per show, for every show at once (used
// to badge the collapsed show list) — avoids an N-request waterfall of the
// full /report/data breakdown just to show one number per card.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false, rows: [] }, { status: 401 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false, rows: [] }, { status: 500 });
  const res = await fetch(`${sbUrl}/rest/v1/tradeshow_products?product=eq.Mesa%20Capsule&select=tradeshow_id,units`, {
    headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` }, cache: "no-store",
  });
  if (!res.ok) return NextResponse.json({ ok: true, rows: [] });
  const raw = JSON.parse((await res.text()) || "[]") as { tradeshow_id: string; units: number }[];
  const byShow = new Map<string, number>();
  for (const r of raw) byShow.set(r.tradeshow_id, (byShow.get(r.tradeshow_id) ?? 0) + Number(r.units || 0));
  return NextResponse.json({ ok: true, rows: [...byShow.entries()].map(([tradeshow_id, units]) => ({ tradeshow_id, units })) });
}
