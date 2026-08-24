import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

// Upload a hero image (kit) or product photo (retailer_kit_products), same
// pattern as the competitor/product-image upload routes. Admin only.
export const revalidate = 0;
const BUCKET = "retailer-kit-images";

export async function POST(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "Bad form" }, { status: 400 }); }
  const file = form.get("file") as File | null;
  const target = String(form.get("target") || ""); // "kit" | "product"
  const id = String(form.get("id") || "").trim();
  if (!file || !id || (target !== "kit" && target !== "product")) return NextResponse.json({ error: "Missing file, id or target" }, { status: 400 });
  if (file.size > 8 * 1024 * 1024) return NextResponse.json({ error: "Image too large (max 8MB)" }, { status: 400 });
  if (file.type && !file.type.startsWith("image/")) return NextResponse.json({ error: "Images only" }, { status: 400 });

  const sb = await createClient();
  await sb.storage.createBucket(BUCKET, { public: true }).catch(() => {});
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${target}/${id}/${Date.now()}.${ext}`;
  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || "image/jpeg", upsert: true });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  const url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

  const table = target === "kit" ? "retailer_kits" : "retailer_kit_products";
  const col = target === "kit" ? "hero_image_url" : "image_url";
  const { error } = await sb.from(table).update({ [col]: url }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, url });
}
