import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

// Post-show report per tradeshow. GET lists (any signed-in user). POST uploads
// the HTML report and attaches it to a show (admin). DELETE removes it (admin).
export const revalidate = 0;
const BUCKET = "tradeshow-reports";
const missing = (m: string) => /PGRST205|does not exist|schema cache|relation .* does not exist/i.test(m || "");

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false, rows: [] }, { status: 401 });
  const sb = await createClient();
  const { data, error } = await sb.from("tradeshow_reports").select("tradeshow_id,title,html_url,file_name,uploaded_at");
  if (error) return NextResponse.json({ ok: true, needsSetup: missing(error.message), rows: [] });
  return NextResponse.json({ ok: true, rows: data || [] });
}

export async function POST(req: Request) {
  const access = await getAccess();
  if (access.role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ ok: false, error: "Bad upload" }, { status: 400 }); }
  const tradeshow_id = String(form.get("tradeshow_id") || "").trim();
  const title = String(form.get("title") || "").trim().slice(0, 200);
  const file = form.get("file") as File | null;
  if (!tradeshow_id) return NextResponse.json({ ok: false, error: "Show required" }, { status: 400 });
  if (!file || file.size === 0) return NextResponse.json({ ok: false, error: "Attach the report HTML" }, { status: 400 });
  if (file.size > 20 * 1024 * 1024) return NextResponse.json({ ok: false, error: `${file.name} is over 20MB` }, { status: 400 });

  const sb = await createClient();
  await sb.storage.createBucket(BUCKET, { public: true }).catch(() => {}); // idempotent
  const ext = (file.name.split(".").pop() || "html").toLowerCase().replace(/[^a-z0-9]/g, "") || "html";
  const ctype = ext === "pdf" ? "application/pdf" : "text/html; charset=utf-8";
  const path = `${tradeshow_id}/${Date.now()}.${ext}`;
  // Upload raw bytes with an explicit content-type from the extension — don't
  // trust file.type (browsers can report .html as text/plain, and Supabase sends
  // nosniff, so a wrong type makes the report open as source text, not a page).
  const buf = await file.arrayBuffer();
  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, buf, { contentType: ctype, upsert: true });
  if (upErr) return NextResponse.json({ ok: false, error: `Upload: ${upErr.message}` }, { status: 500 });
  const html_url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

  const row = { tradeshow_id, title, html_url, file_name: file.name.slice(0, 200), uploaded_by: access.user?.email ?? null, uploaded_at: new Date().toISOString() };
  const { error } = await sb.from("tradeshow_reports").upsert(row, { onConflict: "tradeshow_id" });
  if (error) return NextResponse.json({ ok: false, needsSetup: missing(error.message), error: error.message.slice(0, 200) }, { status: 500 });
  return NextResponse.json({ ok: true, item: row });
}

export async function DELETE(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("tradeshow_id");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const sb = await createClient();
  const { error } = await sb.from("tradeshow_reports").delete().eq("tradeshow_id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
