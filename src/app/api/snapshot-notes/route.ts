import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Per-brand, per-month commentary for the Monthly Snapshot report. Admin-only writes.

export const revalidate = 0;

const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const headers = (extra: Record<string, string> = {}) => ({
  apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra,
});
const isMissingTable = (status: number, body: string) =>
  status === 404 || /PGRST205|does not exist|schema cache/i.test(body);

export async function GET(req: Request) {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false, content: "" }, { status: 500 });
  const { searchParams } = new URL(req.url);
  const brand = searchParams.get("brand"), month = searchParams.get("month");
  if (!brand || !month) return NextResponse.json({ ok: false, content: "" }, { status: 400 });
  let res = await fetch(`${sbUrl}/rest/v1/snapshot_notes?brand_id=eq.${brand}&month_key=eq.${month}&select=content,insights`, { headers: headers(), cache: "no-store" });
  let text = await res.text();
  // Fall back if the insights column hasn't been added yet (keeps notes working pre-migration).
  if (!res.ok && /insights/i.test(text) && /column|schema cache|PGRST204/i.test(text)) {
    res = await fetch(`${sbUrl}/rest/v1/snapshot_notes?brand_id=eq.${brand}&month_key=eq.${month}&select=content`, { headers: headers(), cache: "no-store" });
    text = await res.text();
  }
  if (!res.ok) {
    if (isMissingTable(res.status, text)) return NextResponse.json({ ok: true, needsSetup: true, content: "", insights: "" });
    return NextResponse.json({ ok: false, content: "" }, { status: 500 });
  }
  const rows = JSON.parse(text || "[]");
  return NextResponse.json({ ok: true, content: rows[0]?.content ?? "", insights: rows[0]?.insights ?? "" });
}

export async function POST(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, message: "Admins only" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const { brand_id, month_key, content, insights } = b;
  if (brand_id == null || !month_key) return NextResponse.json({ ok: false, message: "brand_id and month_key required" }, { status: 400 });
  const row: any = { brand_id, month_key, content: String(content ?? ""), insights: String(insights ?? ""), updated_at: new Date().toISOString() };
  let res = await fetch(`${sbUrl}/rest/v1/snapshot_notes`, { method: "POST", headers: headers({ Prefer: "resolution=merge-duplicates" }), body: JSON.stringify(row) });
  if (!res.ok) {
    const t = await res.text();
    // Retry without insights if that column hasn't been added yet.
    if (/insights/i.test(t) && /column|schema cache|PGRST204/i.test(t)) {
      delete row.insights;
      res = await fetch(`${sbUrl}/rest/v1/snapshot_notes`, { method: "POST", headers: headers({ Prefer: "resolution=merge-duplicates" }), body: JSON.stringify(row) });
      if (res.ok) return NextResponse.json({ ok: true, insightsUnsupported: true });
    }
    return NextResponse.json({ ok: false, needsSetup: isMissingTable(res.status, t), message: t.slice(0, 200) }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
