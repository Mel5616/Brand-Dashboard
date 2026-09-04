import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

// Campaign Briefs (Influencers tab). Any signed-in user can read; only admins
// create/edit/delete/assign. A brief carries a self-contained HTML file
// (rendered inline via iframe) and/or a PDF for download, plus which
// influencers (by roster handle) it's assigned to.
export const revalidate = 0;
const BUCKET = "campaign-briefs";
const missing = (m: string) => /PGRST205|does not exist|schema cache|relation .* does not exist/i.test(m || "");

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
  const sb = await createClient();
  const [b, a] = await Promise.all([
    sb.from("campaign_briefs").select("*").order("live_date", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }),
    sb.from("campaign_brief_influencers").select("*"),
  ]);
  if (b.error) return NextResponse.json({ ok: true, needsSetup: missing(b.error.message), briefs: [], assignments: [] });
  return NextResponse.json({ ok: true, briefs: b.data ?? [], assignments: a.data ?? [] });
}

export async function POST(req: Request) {
  const access = await getAccess();
  if (access.role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ ok: false, error: "Bad upload" }, { status: 400 }); }
  const sb = await createClient();
  await sb.storage.createBucket(BUCKET, { public: true }).catch(() => {});

  const title = String(form.get("title") || "").trim().slice(0, 200);
  if (!title) return NextResponse.json({ ok: false, error: "Title required" }, { status: 400 });

  const row: any = {
    title,
    brand: String(form.get("brand") || "").trim().slice(0, 80) || null,
    live_date: String(form.get("live_date") || "").trim() || null,
    created_by: access.user?.email ?? null,
  };

  const { data, error } = await sb.from("campaign_briefs").insert(row).select().single();
  if (error) return NextResponse.json({ ok: false, needsSetup: missing(error.message), error: error.message.slice(0, 200) }, { status: 500 });

  try {
    const htmlFile = form.get("html_file");
    if (htmlFile instanceof File && htmlFile.size > 0) {
      if (htmlFile.size > 25 * 1024 * 1024) throw new Error("Brief HTML is over 25MB");
      const html = await htmlFile.text();
      await sb.from("campaign_briefs").update({ content_html: html }).eq("id", data.id);
    }
    const pdfFile = form.get("pdf_file");
    if (pdfFile instanceof File && pdfFile.size > 0) {
      if (pdfFile.size > 25 * 1024 * 1024) throw new Error("Brief PDF is over 25MB");
      const path = `${data.id}/${Date.now()}-${pdfFile.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: upErr } = await sb.storage.from(BUCKET).upload(path, Buffer.from(await pdfFile.arrayBuffer()), { contentType: pdfFile.type || "application/pdf", upsert: true });
      if (upErr) throw new Error(upErr.message);
      await sb.from("campaign_briefs").update({ pdf_path: path, pdf_name: pdfFile.name.slice(0, 200) }).eq("id", data.id);
    }
    const handles = form.getAll("handles").map(h => String(h).trim()).filter(Boolean);
    if (handles.length) {
      await sb.from("campaign_brief_influencers").insert(handles.map(handle => ({ brief_id: data.id, handle })));
    }
  } catch (e: any) {
    return NextResponse.json({ ok: true, item: data, fileError: String(e.message || e).slice(0, 200) });
  }
  return NextResponse.json({ ok: true, item: data });
}

export async function PATCH(req: Request) {
  const access = await getAccess();
  if (access.role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const id = String(b.id || "");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const sb = await createClient();

  if (Array.isArray(b.handles)) {
    const handles = b.handles.map((h: any) => String(h).trim()).filter(Boolean);
    await sb.from("campaign_brief_influencers").delete().eq("brief_id", id);
    if (handles.length) {
      const { error } = await sb.from("campaign_brief_influencers").insert(handles.map((handle: string) => ({ brief_id: id, handle })));
      if (error) return NextResponse.json({ ok: false, error: error.message.slice(0, 200) }, { status: 500 });
    }
  }

  const fields: any = { updated_at: new Date().toISOString() };
  if (b.title) fields.title = String(b.title).trim().slice(0, 200);
  if (b.status) fields.status = String(b.status).slice(0, 30);
  if (b.brand !== undefined) fields.brand = b.brand ? String(b.brand).slice(0, 80) : null;
  if (b.live_date !== undefined) fields.live_date = b.live_date || null;
  const { error } = await sb.from("campaign_briefs").update(fields).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message.slice(0, 200) }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const sb = await createClient();
  const { data } = await sb.from("campaign_briefs").select("pdf_path").eq("id", id).single();
  if (data?.pdf_path) await sb.storage.from(BUCKET).remove([data.pdf_path]).catch(() => {});
  const { error } = await sb.from("campaign_briefs").delete().eq("id", id);
  return NextResponse.json({ ok: !error });
}
