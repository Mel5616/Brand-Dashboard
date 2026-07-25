import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

// Event concepts (Plan > Event Concepts). GET lists concepts + files (any
// signed-in user). POST multipart: with concept_id, adds files to an existing
// concept; without, creates a new concept (plus any attached files).
// PATCH updates details/status. DELETE (admin) removes a concept or one file.
export const revalidate = 0;
const BUCKET = "event-concepts";
const missing = (m: string) => /PGRST205|does not exist|schema cache|relation .* does not exist/i.test(m || "");

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
  const sb = await createClient();
  const [c, f] = await Promise.all([
    sb.from("event_concepts").select("*").order("event_date", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }),
    sb.from("event_concept_files").select("*").order("created_at", { ascending: true }),
  ]);
  if (c.error) return NextResponse.json({ ok: true, needsSetup: missing(c.error.message), concepts: [], files: [] });
  return NextResponse.json({ ok: true, concepts: c.data ?? [], files: f.data ?? [] });
}

// Word docs are converted to HTML on upload so briefs open as an in-dashboard
// spec sheet instead of a download. Other file types keep the plain link.
async function docxHtml(buf: ArrayBuffer): Promise<string | null> {
  try {
    const mammoth = (await import("mammoth")).default;
    const { value } = await mammoth.convertToHtml({ buffer: Buffer.from(buf) });
    // mammoth emits clean markup, but strip anything script-like defensively
    return value.replace(/<script[\s\S]*?<\/script>/gi, "").slice(0, 400_000) || null;
  } catch { return null; }
}

async function uploadFiles(sb: any, conceptId: number, files: File[], by: string | null) {
  const rows: any[] = [];
  for (const file of files) {
    if (!file || file.size === 0) continue;
    if (file.size > 25 * 1024 * 1024) throw new Error(`${file.name} is over 25MB`);
    const ext = (file.name.split(".").pop() || "pdf").toLowerCase().replace(/[^a-z0-9]/g, "") || "pdf";
    const buf = await file.arrayBuffer();
    const path = `${conceptId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await sb.storage.from(BUCKET).upload(path, Buffer.from(buf), { contentType: file.type || "application/octet-stream", upsert: true });
    if (error) throw new Error(`Upload ${file.name}: ${error.message}`);
    rows.push({
      concept_id: conceptId,
      file_url: sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl,
      file_name: file.name.slice(0, 200),
      uploaded_by: by,
      content_html: ext === "docx" ? await docxHtml(buf) : null,
    });
  }
  if (rows.length) {
    let { error } = await sb.from("event_concept_files").insert(rows);
    // content_html column may not exist yet — degrade to plain links
    if (error && /content_html/.test(error.message)) {
      ({ error } = await sb.from("event_concept_files").insert(rows.map(({ content_html: _x, ...r }: any) => r)));
    }
    if (error) throw new Error(error.message);
  }
  return rows.length;
}

export async function POST(req: Request) {
  const access = await getAccess();
  if (!access.role) return NextResponse.json({ ok: false }, { status: 401 });
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ ok: false, error: "Bad upload" }, { status: 400 }); }
  const sb = await createClient();
  await sb.storage.createBucket(BUCKET, { public: true }).catch(() => {});
  const by = access.user?.email ?? null;
  const files = form.getAll("files").filter((f): f is File => f instanceof File);

  // Cover image for a card (jpg/png/webp, stored alongside the docs)
  async function uploadCover(conceptId: number, cover: File): Promise<string> {
    if (cover.size > 10 * 1024 * 1024) throw new Error("Cover image is over 10MB");
    const ext = (cover.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${conceptId}/cover-${Date.now()}.${ext}`;
    const { error } = await sb.storage.from(BUCKET).upload(path, Buffer.from(await cover.arrayBuffer()), { contentType: cover.type || "image/jpeg", upsert: true });
    if (error) throw new Error(`Cover: ${error.message}`);
    return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }
  const cover = form.get("cover");

  const existingId = String(form.get("concept_id") || "").trim();
  if (existingId) {
    try {
      const n = await uploadFiles(sb, Number(existingId), files, by);
      if (cover instanceof File && cover.size > 0) {
        const url = await uploadCover(Number(existingId), cover);
        await sb.from("event_concepts").update({ cover_url: url }).eq("id", Number(existingId));
      }
      return NextResponse.json({ ok: true, added: n });
    } catch (e: any) { return NextResponse.json({ ok: false, error: String(e.message || e).slice(0, 200) }, { status: 500 }); }
  }

  const title = String(form.get("title") || "").trim().slice(0, 200);
  if (!title) return NextResponse.json({ ok: false, error: "Event name required" }, { status: 400 });
  const row = {
    title,
    brand: String(form.get("brand") || "").trim().slice(0, 80) || null,
    event_date: String(form.get("event_date") || "").trim() || null,
    location: String(form.get("location") || "").trim().slice(0, 200) || null,
    status: String(form.get("status") || "concept").slice(0, 30),
    note: String(form.get("note") || "").trim().slice(0, 1000) || null,
    created_by: by,
  };
  const { data, error } = await sb.from("event_concepts").insert(row).select().single();
  if (error) return NextResponse.json({ ok: false, needsSetup: missing(error.message), error: error.message.slice(0, 200) }, { status: 500 });
  try {
    await uploadFiles(sb, data.id, files, by);
    if (cover instanceof File && cover.size > 0) {
      const url = await uploadCover(data.id, cover);
      await sb.from("event_concepts").update({ cover_url: url }).eq("id", data.id);
    }
  } catch (e: any) {
    return NextResponse.json({ ok: true, item: data, fileError: String(e.message || e).slice(0, 200) });
  }
  return NextResponse.json({ ok: true, item: data });
}

export async function PATCH(req: Request) {
  const access = await getAccess();
  if (!access.role) return NextResponse.json({ ok: false }, { status: 401 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }

  // Retro-convert an already-uploaded .docx into spec-sheet HTML.
  if (b.action === "convert") {
    const sb = await createClient();
    const { data: f } = await sb.from("event_concept_files").select("*").eq("id", Number(b.fileId)).single();
    if (!f) return NextResponse.json({ ok: false, error: "File not found" }, { status: 404 });
    if (!/\.docx$/i.test(f.file_name)) return NextResponse.json({ ok: false, error: "Only Word (.docx) files convert" }, { status: 400 });
    const res = await fetch(f.file_url, { cache: "no-store" });
    if (!res.ok) return NextResponse.json({ ok: false, error: "Couldn't read the file" }, { status: 500 });
    const html = await docxHtml(await res.arrayBuffer());
    if (!html) return NextResponse.json({ ok: false, error: "Conversion failed" }, { status: 500 });
    const { error } = await sb.from("event_concept_files").update({ content_html: html }).eq("id", f.id);
    if (error) return NextResponse.json({ ok: false, error: error.message.slice(0, 150) }, { status: 500 });
    return NextResponse.json({ ok: true, html });
  }

  const id = Number(b.id);
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const fields: any = {};
  if (b.title) fields.title = String(b.title).trim().slice(0, 200);
  if (b.status) fields.status = String(b.status).slice(0, 30);
  for (const [k, max] of [["brand", 80], ["location", 200], ["note", 1000]] as const)
    if (b[k] !== undefined) fields[k] = b[k] ? String(b[k]).slice(0, max) : null;
  if (b.event_date !== undefined) fields.event_date = b.event_date || null;
  const sb = await createClient();
  const { error } = await sb.from("event_concepts").update(fields).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message.slice(0, 200) }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  const u = new URL(req.url);
  const sb = await createClient();
  const fileId = u.searchParams.get("fileId");
  if (fileId) {
    const { error } = await sb.from("event_concept_files").delete().eq("id", fileId);
    return NextResponse.json({ ok: !error });
  }
  const id = u.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const { error } = await sb.from("event_concepts").delete().eq("id", id);
  return NextResponse.json({ ok: !error });
}
