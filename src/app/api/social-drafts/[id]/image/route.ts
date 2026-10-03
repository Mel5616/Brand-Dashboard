import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

export const revalidate = 0;
const BUCKET = "social-images";

// Attach the finished graphic to a Social Writing draft (public bucket + URL on the row).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const acc = await getAccess();
  const ok = acc.role === "admin" || ["alison@coolkidz.com.au"].includes((acc.user?.email ?? "").toLowerCase());
  if (!ok) return NextResponse.json({ error: "No access" }, { status: 403 });
  const { id } = await params;
  let file: File | null = null;
  try { file = (await req.formData()).get("file") as File | null; } catch { /* ignore */ }
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (file.size > 8 * 1024 * 1024) return NextResponse.json({ error: "Image is too large (max 8MB)" }, { status: 400 });

  const sb = await createClient();
  await sb.storage.createBucket(BUCKET, { public: true }).catch(() => {}); // idempotent

  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  const path = `${id}/${Date.now()}.${ext}`;
  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || "image/png", upsert: true });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  // On a carousel, "Replace image" swaps the cover only and keeps the other slides.
  const { data: cur } = await sb.from("social_drafts").select("images").eq("id", id).single();
  const rest: string[] = Array.isArray(cur?.images) && cur.images.length > 1 ? cur.images.slice(1) : [];
  const { data, error } = await sb.from("social_drafts").update({ image_url: url, images: [url, ...rest], updated_at: new Date().toISOString() }).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data, url });
}
