import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

// Role documents (reference attachments — they never drive KPI data).
// POST: upload a version for a staff member (admin). GET ?id=: redirect to a
// short-lived signed URL (admin). Bucket is PRIVATE.
export const revalidate = 0;
const BUCKET = "role-documents";

export async function POST(req: Request) {
  const access = await getAccess();
  if (access.role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ ok: false, error: "Bad upload" }, { status: 400 }); }
  const staff_id = String(form.get("staff_id") || "").trim();
  const label = String(form.get("label") || "").trim().slice(0, 200);
  const file = form.get("file") as File | null;
  if (!staff_id) return NextResponse.json({ ok: false, error: "Staff required" }, { status: 400 });
  if (!file || file.size === 0) return NextResponse.json({ ok: false, error: "Attach a file" }, { status: 400 });
  if (file.size > 20 * 1024 * 1024) return NextResponse.json({ ok: false, error: "File is over 20MB" }, { status: 400 });

  const sb = await createClient();
  await sb.storage.createBucket(BUCKET, { public: false }).catch(() => {}); // idempotent, PRIVATE
  const ext = (file.name.split(".").pop() || "docx").toLowerCase().replace(/[^a-z0-9]/g, "") || "docx";
  const path = `${staff_id}/${Date.now()}.${ext}`;
  const buf = await file.arrayBuffer();
  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, buf, { contentType: file.type || "application/octet-stream", upsert: false });
  if (upErr) return NextResponse.json({ ok: false, error: `Upload: ${upErr.message}` }, { status: 500 });

  const { data: prev } = await sb.from("role_documents").select("version").eq("staff_id", staff_id).order("version", { ascending: false }).limit(1);
  const version = (prev?.[0]?.version ?? 0) + 1;
  const { data, error } = await sb.from("role_documents")
    .insert({ staff_id, version, file_path: path, source: "uploaded", label: label || file.name.slice(0, 200) })
    .select().single();
  if (error) return NextResponse.json({ ok: false, error: error.message.slice(0, 200) }, { status: 500 });
  await sb.from("audit_log").insert({ actor: access.user?.email ?? "admin", action: "document.upload", target: `staff:${staff_id}`, detail: { version, label } });
  return NextResponse.json({ ok: true, item: data });
}

export async function GET(req: Request) {
  if ((await getAccess()).role !== "admin") return new Response("Admins only", { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return new Response("Missing id", { status: 400 });
  const sb = await createClient();
  const { data } = await sb.from("role_documents").select("file_path").eq("id", id).single();
  if (!data?.file_path) return new Response("Not found", { status: 404 });
  const { data: signed, error } = await sb.storage.from(BUCKET).createSignedUrl(data.file_path, 600);
  if (error || !signed?.signedUrl) return new Response("Could not sign URL", { status: 500 });
  return NextResponse.redirect(signed.signedUrl);
}
