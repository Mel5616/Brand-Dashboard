import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Chart annotations ("event memory"). Read/create: any signed-in user.
// Delete: admin or the person who added it.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const missing = (s: number, b: string) => s === 404 || /PGRST205|does not exist|schema cache/i.test(b);

const KINDS = ["promo", "expo", "price", "stock", "pr", "other"];

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
  const res = await fetch(`${sbUrl}/rest/v1/chart_annotations?select=*&order=day.desc&limit=500`, { headers: h(), cache: "no-store" });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: true, needsSetup: missing(res.status, text), items: [] });
  return NextResponse.json({ ok: true, items: JSON.parse(text || "[]") });
}

export async function POST(req: Request) {
  const acc = await getAccess();
  if (!acc.role) return NextResponse.json({ ok: false }, { status: 401 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const row = {
    day: String(b.day || "").slice(0, 10),
    label: String(b.label || "").trim().slice(0, 140),
    kind: KINDS.includes(b.kind) ? b.kind : "other",
    brand: b.brand ? String(b.brand).slice(0, 80) : null,
    created_by: (acc.user as any)?.email ?? null,
  };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.day) || !row.label)
    return NextResponse.json({ ok: false, error: "Date and label required" }, { status: 400 });
  const res = await fetch(`${sbUrl}/rest/v1/chart_annotations`, { method: "POST", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(row) });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text) }, { status: 500 });
  return NextResponse.json({ ok: true, item: JSON.parse(text)[0] });
}

export async function DELETE(req: Request) {
  const acc = await getAccess();
  if (!acc.role) return NextResponse.json({ ok: false }, { status: 401 });
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  if (acc.role !== "admin") {
    const cur = await fetch(`${sbUrl}/rest/v1/chart_annotations?id=eq.${id}&select=created_by&limit=1`, { headers: h(), cache: "no-store" }).then(r => r.json()).catch(() => []);
    if (cur[0]?.created_by !== (acc.user as any)?.email) return NextResponse.json({ ok: false, error: "Only the author or an admin can delete" }, { status: 403 });
  }
  const res = await fetch(`${sbUrl}/rest/v1/chart_annotations?id=eq.${id}`, { method: "DELETE", headers: h({ Prefer: "return=minimal" }) });
  return NextResponse.json({ ok: res.ok });
}
