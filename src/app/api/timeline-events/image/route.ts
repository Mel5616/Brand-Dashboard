import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

// Upload a product photo for a timeline event. Admin only, same pattern as
// the competitor-image / influencer-avatar uploads.
export const revalidate = 0;
const BUCKET = "timeline-event-images";

export async function POST(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "Bad form" }, { status: 400 }); }
  const file = form.get("file") as File | null;
  const id = String(form.get("id") || "").trim();
  if (!file || !id) return NextResponse.json({ error: "Missing file or id" }, { status: 400 });
  if (file.size > 8 * 1024 * 1024) return NextResponse.json({ error: "Image too large (max 8MB)" }, { status: 400 });
  if (file.type && !file.type.startsWith("image/")) return NextResponse.json({ error: "Images only" }, { status: 400 });

  const sb = await createClient();
  await sb.storage.createBucket(BUCKET, { public: true }).catch(() => {});
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${id}/${Date.now()}.${ext}`;
  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || "image/jpeg", upsert: true });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  const url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

  const { error } = await sb.from("timeline_events").update({ image_url: url }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, url });
}
