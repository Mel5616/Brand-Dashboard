import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Upload an influencer profile photo to Supabase Storage and store it on the roster
// (by handle). Any logged-in user (social team) may use it.
export const revalidate = 0;
const BUCKET = "influencer-avatars";

// Public like the invoice upload — the team logs gifts from /log-gift without
// signing in. Image-only + size cap keeps it safe.
export async function POST(req: Request) {
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "Bad form" }, { status: 400 }); }
  const file = form.get("file") as File | null;
  let handle = String(form.get("handle") || "").trim();
  if (!file || !handle) return NextResponse.json({ error: "Missing file or handle" }, { status: 400 });
  if (file.size > 8 * 1024 * 1024) return NextResponse.json({ error: "Image too large (max 8MB)" }, { status: 400 });
  if (file.type && !file.type.startsWith("image/")) return NextResponse.json({ error: "Images only" }, { status: 400 });
  if (!handle.startsWith("@")) handle = "@" + handle.replace(/^@+/, "");

  const sb = await createClient();
  await sb.storage.createBucket(BUCKET, { public: true }).catch(() => {});
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${handle.replace(/[^a-z0-9]/gi, "_")}/${Date.now()}.${ext}`;
  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || "image/jpeg", upsert: true });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  const url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

  const { error } = await sb.from("influencers").upsert({ handle, avatar_url: url }, { onConflict: "handle" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, url });
}
