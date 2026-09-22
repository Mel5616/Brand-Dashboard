import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

// Upload a hero image straight from the computer for an EDM draft — the
// alternative to picking one of the brand's Shopify product photos. Used
// both before generating (as source_image_url, so the model builds the
// email around it) and after, to swap a draft's hero image.
export const revalidate = 0;
export const maxDuration = 30;
const BUCKET = "edm-images";

function canWrite(acc: Awaited<ReturnType<typeof getAccess>>) {
  return acc.role === "admin" || ["alison@coolkidz.com.au"].includes((acc.user?.email ?? "").toLowerCase());
}

export async function POST(req: Request) {
  const acc = await getAccess();
  if (!canWrite(acc)) return NextResponse.json({ ok: false, error: "No access" }, { status: 403 });
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ ok: false, error: "Bad upload" }, { status: 400 }); }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ ok: false, error: "No file given" }, { status: 400 });
  if (file.size > 15 * 1024 * 1024) return NextResponse.json({ ok: false, error: "File is over 15MB" }, { status: 400 });

  try {
    const sb = await createClient();
    await sb.storage.createBucket(BUCKET, { public: true }).catch(() => {});
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await sb.storage.from(BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type || "application/octet-stream", upsert: true });
    if (error) throw new Error(error.message);
    const url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    return NextResponse.json({ ok: true, url });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: `Upload failed: ${String(e.message || e).slice(0, 150)}` }, { status: 500 });
  }
}
