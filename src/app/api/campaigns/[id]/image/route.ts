import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

export const revalidate = 0;
const BUCKET = "campaign-images";

// Upload a campaign hero image to Supabase Storage (public bucket) and store the URL.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAccess()).role) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const { id } = await params;
  let file: File | null = null;
  try { file = (await req.formData()).get("file") as File | null; } catch { /* ignore */ }
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (file.size > 8 * 1024 * 1024) return NextResponse.json({ error: "Image is too large (max 8MB)" }, { status: 400 });

  const sb = await createClient();
  await sb.storage.createBucket(BUCKET, { public: true }).catch(() => {}); // idempotent

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${id}/${Date.now()}.${ext}`;
  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || "image/jpeg", upsert: true });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  const { data, error } = await sb.from("campaigns").update({ image_url: url }).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data, url });
}
