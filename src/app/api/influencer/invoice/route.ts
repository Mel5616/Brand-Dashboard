import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Invoice upload for the team gift form. The form is public (no login), so this
// endpoint is too — locked down to PDFs/images and 10MB, into its own bucket.
export const revalidate = 0;
const BUCKET = "influencer-invoices";
const ALLOWED = new Set(["pdf", "png", "jpg", "jpeg", "webp", "heic"]);

export async function POST(req: Request) {
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ ok: false, error: "Bad upload" }, { status: 400 }); }
  const file = form.get("file") as File | null;
  if (!file || file.size === 0) return NextResponse.json({ ok: false, error: "Attach a file" }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ ok: false, error: "File is too large (max 10MB)" }, { status: 400 });
  const ext = (file.name.split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!ALLOWED.has(ext)) return NextResponse.json({ ok: false, error: "PDF or image files only" }, { status: 400 });

  const sb = await createClient();
  await sb.storage.createBucket(BUCKET, { public: true }).catch(() => {}); // idempotent
  const ctype = ext === "pdf" ? "application/pdf" : `image/${ext === "jpg" ? "jpeg" : ext}`;
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const buf = await file.arrayBuffer();
  const { error } = await sb.storage.from(BUCKET).upload(path, buf, { contentType: ctype, upsert: false });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  return NextResponse.json({ ok: true, url, file: file.name.slice(0, 200) });
}
