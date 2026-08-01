import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

// Brand strategy scorecards. Read: any signed-in user. Write: admin.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const missing = (s: number, b: string) => s === 404 || /PGRST205|does not exist|schema cache/i.test(b);
const BUCKET = "strategy-docs";

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
  const res = await fetch(`${sbUrl}/rest/v1/brand_strategy?select=*`, { headers: h(), cache: "no-store" });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: true, needsSetup: missing(res.status, text), items: [] });
  return NextResponse.json({ ok: true, items: JSON.parse(text || "[]") });
}

export async function PUT(req: Request) {
  const acc = await getAccess();
  if (acc.role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const brand = String(b.brand || "").trim().slice(0, 80);
  if (!brand) return NextResponse.json({ ok: false, error: "brand required" }, { status: 400 });
  const row: any = { brand, updated_by: (acc.user as any)?.email ?? null, updated_at: new Date().toISOString() };
  if (b.fy !== undefined) row.fy = String(b.fy).slice(0, 12);
  if (b.positioning !== undefined) row.positioning = b.positioning ? String(b.positioning).slice(0, 400) : null;
  for (const k of ["revenue_commit", "marketing_commit"] as const)
    if (b[k] !== undefined) row[k] = b[k] === null || b[k] === "" ? null : Number(b[k]) || 0;
  if (Array.isArray(b.pillars)) row.pillars = b.pillars.slice(0, 8).map((p: any) => ({
    name: String(p.name || "").slice(0, 60), measure: String(p.measure || "").slice(0, 160),
    status: ["green", "amber", "red"].includes(p.status) ? p.status : "amber", note: String(p.note || "").slice(0, 200),
  }));
  if (Array.isArray(b.phases)) row.phases = b.phases.slice(0, 6).map((p: any) => ({
    name: String(p.name || "").slice(0, 60), window: String(p.window || "").slice(0, 60),
    items: (Array.isArray(p.items) ? p.items : []).slice(0, 15).map((i: any) => ({ text: String(i.text || "").slice(0, 160), done: !!i.done })),
  }));
  const res = await fetch(`${sbUrl}/rest/v1/brand_strategy?on_conflict=brand`, {
    method: "POST", headers: h({ Prefer: "resolution=merge-duplicates,return=representation" }), body: JSON.stringify(row),
  });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text), error: text.slice(0, 150) }, { status: 500 });
  return NextResponse.json({ ok: true, item: JSON.parse(text)[0] });
}

// PDF attach (multipart): stored in the public strategy-docs bucket.
export async function POST(req: Request) {
  const acc = await getAccess();
  if (acc.role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  let form: FormData; try { form = await req.formData(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const brand = String(form.get("brand") || "").trim();
  const file = form.get("file");
  if (!brand || !(file instanceof File) || file.size === 0) return NextResponse.json({ ok: false, error: "brand + file required" }, { status: 400 });
  if (file.size > 25 * 1024 * 1024) return NextResponse.json({ ok: false, error: "PDF over 25MB" }, { status: 400 });
  const sb = await createClient();
  await sb.storage.createBucket(BUCKET, { public: true }).catch(() => {});
  const path = `${brand.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`;
  const { error } = await sb.storage.from(BUCKET).upload(path, file, { contentType: "application/pdf", upsert: true });
  if (error) return NextResponse.json({ ok: false, error: error.message.slice(0, 150) }, { status: 500 });
  const url = `${sbUrl}/storage/v1/object/public/${BUCKET}/${path}`;
  await fetch(`${sbUrl}/rest/v1/brand_strategy?on_conflict=brand`, {
    method: "POST", headers: h({ Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify({ brand, pdf_url: url, pdf_name: file.name.slice(0, 120), updated_at: new Date().toISOString() }),
  });
  return NextResponse.json({ ok: true, url });
}
