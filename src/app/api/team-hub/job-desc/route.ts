import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

// Upload / remove a job-description document (PDF etc.) for a team member.
export const revalidate = 0;
const BUCKET = "team-job-descriptions";

export async function POST(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ ok: false, error: "Bad upload" }, { status: 400 }); }
  const member_id = String(form.get("member_id") || "").trim();
  const file = form.get("file") as File | null;
  if (!member_id) return NextResponse.json({ ok: false, error: "Member required" }, { status: 400 });
  if (!file || file.size === 0) return NextResponse.json({ ok: false, error: "Attach a file" }, { status: 400 });
  if (file.size > 20 * 1024 * 1024) return NextResponse.json({ ok: false, error: `${file.name} is over 20MB` }, { status: 400 });

  const sb = await createClient();
  await sb.storage.createBucket(BUCKET, { public: true }).catch(() => {}); // idempotent
  const ext = (file.name.split(".").pop() || "pdf").toLowerCase().replace(/[^a-z0-9]/g, "") || "pdf";
  const ctype = ext === "pdf" ? "application/pdf" : ext === "html" || ext === "htm" ? "text/html; charset=utf-8" : (file.type || "application/octet-stream");
  const path = `${member_id}/${Date.now()}.${ext}`;
  const buf = await file.arrayBuffer();
  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, buf, { contentType: ctype, upsert: true });
  if (upErr) return NextResponse.json({ ok: false, error: `Upload: ${upErr.message}` }, { status: 500 });
  const url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

  const { error } = await sb.from("team_members").update({ job_desc_url: url, job_desc_file: file.name.slice(0, 200) }).eq("id", member_id);
  if (error) return NextResponse.json({ ok: false, error: error.message.slice(0, 200) }, { status: 500 });
  return NextResponse.json({ ok: true, url, file: file.name.slice(0, 200) });
}

export async function DELETE(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("member_id");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const sb = await createClient();
  const { error } = await sb.from("team_members").update({ job_desc_url: null, job_desc_file: null }).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
