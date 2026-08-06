import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { salesRequestOk } from "@/lib/salesRequestKey";

// File attachments for Sales Hub requests (retailer spec sheets, tune-up space
// photos, etc). Bucket is created lazily on first use. Reachable from both the
// dashboard (signed in) and the public /request form (shared key).
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const BUCKET = "sales-hub-files";

export async function POST(req: Request) {
  if (!(await salesRequestOk(req))) return NextResponse.json({ ok: false, error: "No access" }, { status: 403 });
  const acc = await getAccess();
  let form: FormData; try { form = await req.formData(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const requestId = String(form.get("request_id") || "");
  const kind = String(form.get("kind") || "other").slice(0, 40);
  const file = form.get("file");
  if (!requestId || !(file instanceof File) || file.size === 0) return NextResponse.json({ ok: false, error: "request_id + file required" }, { status: 400 });
  if (file.size > 25 * 1024 * 1024) return NextResponse.json({ ok: false, error: "File over 25MB" }, { status: 400 });

  const sb = await createClient();
  await sb.storage.createBucket(BUCKET, { public: true }).catch(() => {});
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 100);
  const path = `${requestId}/${Date.now()}-${safeName}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
  if (error) return NextResponse.json({ ok: false, error: error.message.slice(0, 150) }, { status: 500 });
  const url = `${sbUrl}/storage/v1/object/public/${BUCKET}/${path}`;

  const uploaderName = String(form.get("uploader") || "").slice(0, 200);
  const row = { request_id: requestId, storage_path: url, file_name: file.name.slice(0, 200), kind, uploaded_by: acc.user?.email ?? uploaderName ?? null };
  const res = await fetch(`${sbUrl}/rest/v1/request_files`, { method: "POST", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(row) });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, error: text.slice(0, 200) }, { status: 500 });
  return NextResponse.json({ ok: true, file: JSON.parse(text)[0] });
}
