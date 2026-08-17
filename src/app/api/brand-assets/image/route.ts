import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

// One lifestyle image per brand, shown on its Brand Assets card. Admin only.
export const revalidate = 0;
const BUCKET = "brand-asset-images";
const missing = (m: string) => /PGRST205|does not exist|schema cache|relation .* does not exist/i.test(m || "");

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
  const sb = await createClient();
  const { data, error } = await sb.from("brand_asset_images").select("brand,image_url");
  if (error) return NextResponse.json({ ok: true, needsSetup: missing(error.message), images: [] });
  return NextResponse.json({ ok: true, images: data || [] });
}

export async function POST(req: Request) {
  const access = await getAccess();
  if (access.role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ ok: false, error: "Bad upload" }, { status: 400 }); }
  const brand = String(form.get("brand") || "").trim().slice(0, 80);
  const file = form.get("file") as File | null;
  if (!brand) return NextResponse.json({ ok: false, error: "Brand required" }, { status: 400 });
  if (!file || file.size === 0) return NextResponse.json({ ok: false, error: "Attach an image" }, { status: 400 });
  if (file.size > 8 * 1024 * 1024) return NextResponse.json({ ok: false, error: "Image is over 8MB" }, { status: 400 });

  const sb = await createClient();
  await sb.storage.createBucket(BUCKET, { public: true }).catch(() => {});
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const slug = brand.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "brand";
  const path = `${slug}-${Date.now()}.${ext}`;
  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || "image/jpeg", upsert: true });
  if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
  const image_url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

  const { error } = await sb.from("brand_asset_images").upsert({ brand, image_url, updated_by: access.user?.email ?? null, updated_at: new Date().toISOString() }, { onConflict: "brand" });
  if (error) return NextResponse.json({ ok: false, needsSetup: missing(error.message), error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, brand, image_url });
}
