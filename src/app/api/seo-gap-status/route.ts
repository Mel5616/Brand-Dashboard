import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Action-tracking for SEO keyword-gap rows (open / in_progress / done), keyed
// on brand_id+phrase so it survives the weekly semrush_keyword_gaps resync.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const missing = (s: number, b: string) => s === 404 || /PGRST205|does not exist|schema cache/i.test(b);

export async function GET() {
  const acc = await getAccess();
  if (!acc.role) return NextResponse.json({ ok: false }, { status: 401 });
  const res = await fetch(`${sbUrl}/rest/v1/seo_gap_status?select=brand_id,phrase,status&limit=5000`, { headers: h(), cache: "no-store" });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: true, needsSetup: missing(res.status, text), items: [] });
  return NextResponse.json({ ok: true, items: JSON.parse(text || "[]") });
}

export async function PATCH(req: Request) {
  const acc = await getAccess();
  const email = acc.role ? (acc.user as any)?.email ?? null : null;
  if (!email) return NextResponse.json({ ok: false }, { status: 401 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const brand_id = Number(b.brand_id);
  const phrase = String(b.phrase || "").trim();
  const status = String(b.status || "");
  if (!Number.isFinite(brand_id) || !phrase || !["open", "in_progress", "done"].includes(status)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const res = await fetch(`${sbUrl}/rest/v1/seo_gap_status?on_conflict=brand_id,phrase`, {
    method: "POST",
    headers: h({ Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify({ brand_id, phrase, status, updated_by: email, updated_at: new Date().toISOString() }),
  });
  const t = await res.text();
  return NextResponse.json({ ok: res.ok, needsSetup: !res.ok && missing(res.status, t) });
}
