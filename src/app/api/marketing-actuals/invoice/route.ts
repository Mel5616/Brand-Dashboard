import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

export const revalidate = 0;
const BUCKET = "marketing-invoices";

// Upload an invoice (PDF or image) to Supabase Storage and return its public URL.
export async function POST(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });
  let file: File | null = null;
  try { file = (await req.formData()).get("file") as File | null; } catch { /* ignore */ }
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: "File is too large (max 15MB)" }, { status: 400 });

  const sb = await createClient();
  await sb.storage.createBucket(BUCKET, { public: true }).catch(() => {});
  const ext = (file.name.split(".").pop() || "pdf").toLowerCase().replace(/[^a-z0-9]/g, "") || "pdf";
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || "application/pdf", upsert: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  return NextResponse.json({ ok: true, url });
}
