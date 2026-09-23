import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Lifecycle Flows coverage tracker (Email Marketing > Lifecycle Flows) — a
// portfolio-wide grid of brand x flow type. The flows themselves already
// run in Klaviyo; this is visibility only, not a new automation engine, so
// a gap doesn't go unnoticed across 12 brands. Read: any signed-in user.
// Write: any signed-in user (the whole team maintains this, like Sales Hub).
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const missing = (s: number, b: string) => s === 404 || /PGRST205|does not exist|schema cache/i.test(b);

export const FLOW_TYPES = [
  { key: "welcome", label: "Welcome Series" },
  { key: "browse_abandon", label: "Browse Abandonment" },
  { key: "cart_abandon", label: "Cart/Checkout Abandonment" },
  { key: "post_purchase", label: "Post-Purchase" },
  { key: "replenishment", label: "Replenishment" },
  { key: "winback", label: "Winback / Lapsed" },
  { key: "birthday", label: "Birthday / Anniversary" },
  { key: "review_request", label: "Review Request" },
  { key: "back_in_stock", label: "Back in Stock" },
];

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
  const res = await fetch(`${sbUrl}/rest/v1/lifecycle_flows?select=*`, { headers: h(), cache: "no-store" });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: true, needsSetup: missing(res.status, text), items: [], flowTypes: FLOW_TYPES });
  return NextResponse.json({ ok: true, items: JSON.parse(text || "[]"), flowTypes: FLOW_TYPES });
}

export async function POST(req: Request) {
  const acc = await getAccess();
  if (!acc.role) return NextResponse.json({ ok: false }, { status: 401 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const brandId = Number(b.brand_id);
  const flowKey = String(b.flow_key || "");
  if (!brandId || !FLOW_TYPES.some(f => f.key === flowKey)) return NextResponse.json({ ok: false, error: "Brand and a known flow type are required" }, { status: 400 });
  const row: Record<string, any> = {
    brand_id: brandId, flow_key: flowKey,
    updated_by: (acc.user as any)?.email ?? null, updated_at: new Date().toISOString(),
  };
  if (b.status !== undefined) row.status = ["not_built", "planned", "live", "paused"].includes(b.status) ? b.status : "not_built";
  if (b.klaviyo_url !== undefined) row.klaviyo_url = b.klaviyo_url ? String(b.klaviyo_url).slice(0, 500) : null;
  if (b.note !== undefined) row.note = b.note ? String(b.note).slice(0, 500) : null;
  if (b.last_reviewed !== undefined) row.last_reviewed = b.last_reviewed || null;
  const res = await fetch(`${sbUrl}/rest/v1/lifecycle_flows?on_conflict=brand_id,flow_key`, {
    method: "POST", headers: h({ Prefer: "resolution=merge-duplicates,return=representation" }), body: JSON.stringify(row),
  });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text), error: text.slice(0, 200) }, { status: 500 });
  return NextResponse.json({ ok: true, item: JSON.parse(text)[0] });
}
