import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

// Admin: manage digital downloads (lead-magnet PDFs). Public signup lives at
// /download/<slug> and /api/public-download.
export const revalidate = 0;
const BUCKET = "downloads";
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const missing = (s: number, b: string) => s === 404 || /PGRST205|does not exist|schema cache/i.test(b);
const deny = () => NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

export async function GET() {
  if ((await getAccess()).role !== "admin") return deny();
  const res = await fetch(`${sbUrl}/rest/v1/digital_downloads?select=*&order=created_at.desc`, { headers: h(), cache: "no-store" });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: true, needsSetup: missing(res.status, text), items: [] });
  const items = JSON.parse(text || "[]");
  const sres = await fetch(`${sbUrl}/rest/v1/download_signups?select=download_id,consent,created_at&limit=20000`, { headers: h(), cache: "no-store" });
  const signups: { download_id: string; consent: boolean; created_at: string }[] = sres.ok ? await sres.json() : [];
  const week = Date.now() - 7 * 86400000;
  return NextResponse.json({
    ok: true,
    items: items.map((d: any) => {
      const mine = signups.filter(s => s.download_id === d.id);
      return { ...d, signups: mine.length, consented: mine.filter(s => s.consent).length, last7: mine.filter(s => new Date(s.created_at).getTime() >= week).length };
    }),
  });
}

export async function POST(req: Request) {
  if ((await getAccess()).role !== "admin") return deny();
  let fd: FormData; try { fd = await req.formData(); } catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 }); }
  const file = fd.get("file") as File | null;
  const title = String(fd.get("title") || "").trim().slice(0, 120);
  const brandId = Number(fd.get("brand_id"));
  const brandName = String(fd.get("brand_name") || "");
  if (!file || !file.size) return NextResponse.json({ ok: false, error: "Choose the file to give away." }, { status: 400 });
  if (!title || !Number.isFinite(brandId)) return NextResponse.json({ ok: false, error: "Add a title and pick a brand." }, { status: 400 });
  if (file.size > 25 * 1024 * 1024) return NextResponse.json({ ok: false, error: "File is too large (max 25MB)." }, { status: 400 });

  let slug = slugify(`${brandName} ${title}`) || "download";
  const taken = await fetch(`${sbUrl}/rest/v1/digital_downloads?select=slug&slug=like.${encodeURIComponent(slug)}*`, { headers: h(), cache: "no-store" }).then(r => r.json()).catch(() => []);
  if (taken.some((t: any) => t.slug === slug)) slug = `${slug}-${taken.length + 1}`;

  const sb = await createClient();
  await sb.storage.createBucket(BUCKET, { public: true }).catch(() => {});
  const ext = (file.name.split(".").pop() || "pdf").toLowerCase().replace(/[^a-z0-9]/g, "") || "pdf";
  const path = `${slug}/${slugify(title) || "download"}.${ext}`;
  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || "application/pdf", upsert: true });
  if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
  const fileUrl = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

  const row = { brand_id: brandId, slug, title, description: String(fd.get("description") || "").trim().slice(0, 400) || null, file_url: fileUrl, file_name: file.name, klaviyo_list_id: String(fd.get("klaviyo_list_id") || "").trim() || null };
  const res = await fetch(`${sbUrl}/rest/v1/digital_downloads`, { method: "POST", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(row) });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text), error: text.slice(0, 200) }, { status: 500 });
  return NextResponse.json({ ok: true, item: JSON.parse(text)[0] });
}

export async function PATCH(req: Request) {
  if ((await getAccess()).role !== "admin") return deny();
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const id = String(b.id || ""); if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const fields: Record<string, unknown> = {};
  if (typeof b.active === "boolean") fields.active = b.active;
  if (b.title !== undefined) fields.title = String(b.title).slice(0, 120);
  if (b.description !== undefined) fields.description = String(b.description).slice(0, 400) || null;
  if (b.klaviyo_list_id !== undefined) fields.klaviyo_list_id = String(b.klaviyo_list_id || "") || null;
  const res = await fetch(`${sbUrl}/rest/v1/digital_downloads?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify(fields) });
  return NextResponse.json({ ok: res.ok });
}

export async function DELETE(req: Request) {
  if ((await getAccess()).role !== "admin") return deny();
  const id = new URL(req.url).searchParams.get("id"); if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const res = await fetch(`${sbUrl}/rest/v1/digital_downloads?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: h({ Prefer: "return=minimal" }) });
  return NextResponse.json({ ok: res.ok });
}
