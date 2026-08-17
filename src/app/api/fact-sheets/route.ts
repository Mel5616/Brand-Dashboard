import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

// Product Information (Phase 1): per-brand fact sheet document store.
// GET  → list sheets (current by default, ?all=1 includes archived). Any signed-in role.
// POST → upload a new sheet (HTML + PDF) for a brand; archives the previous current. Admin.
//   Small files (either under ~3MB) ride along directly in one request.
//   Larger files are chunked client-side (Vercel caps request bodies ~4.5MB,
//   the same wall Launch Decks and Documents hit) via action=part / action=finish,
//   independently per slot (html/pdf) since either can be the big one.
// DELETE ?id= → remove a sheet. Admin.
export const revalidate = 0;
const BUCKET = "fact-sheets";
const UPLOAD_BUCKET = "fact-sheet-uploads";
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "brand";
const missing = (m: string) => /PGRST205|does not exist|schema cache|relation .* does not exist/i.test(m || "");

export async function GET(req: Request) {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false, sheets: [] }, { status: 401 });
  const all = new URL(req.url).searchParams.get("all") === "1";
  const sb = await createClient();
  let q = sb.from("product_fact_sheets").select("id,brand_name,html_url,pdf_url,last_updated,version,status,created_at").order("brand_name").order("created_at", { ascending: false });
  if (!all) q = q.eq("status", "current");
  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, needsSetup: missing(error.message), sheets: [] });
  return NextResponse.json({ ok: true, sheets: data || [] });
}

async function saveFinal(sb: any, brand: string, version: string, htmlBlob: Blob | null, pdfBlob: Blob | null) {
  await sb.storage.createBucket(BUCKET, { public: true }).catch(() => {});
  const stamp = Date.now();
  const base = `${slug(brand)}/${stamp}`;
  let html_url: string | null = null, pdf_url: string | null = null;
  if (htmlBlob) {
    const { error } = await sb.storage.from(BUCKET).upload(`${base}.html`, htmlBlob, { contentType: "text/html; charset=utf-8", upsert: true });
    if (error) return { error: `HTML: ${error.message}` };
    html_url = sb.storage.from(BUCKET).getPublicUrl(`${base}.html`).data.publicUrl;
  }
  if (pdfBlob) {
    const { error } = await sb.storage.from(BUCKET).upload(`${base}.pdf`, pdfBlob, { contentType: "application/pdf", upsert: true });
    if (error) return { error: `PDF: ${error.message}` };
    pdf_url = sb.storage.from(BUCKET).getPublicUrl(`${base}.pdf`).data.publicUrl;
  }
  // Archive the brand's previous current sheet, then insert the new one.
  await sb.from("product_fact_sheets").update({ status: "archived" }).eq("brand_name", brand).eq("status", "current");
  const { error } = await sb.from("product_fact_sheets").insert({ brand_name: brand, html_url, pdf_url, version, last_updated: new Date().toISOString().slice(0, 10), status: "current" });
  if (error) return { error: error.message, needsSetup: missing(error.message) };
  return { ok: true };
}

export async function POST(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ ok: false, error: "Bad upload" }, { status: 400 }); }
  const action = String(form.get("action") || "");
  const sb = await createClient();

  if (action === "part") {
    await sb.storage.createBucket(UPLOAD_BUCKET, { public: false }).catch(() => {});
    const uploadId = String(form.get("upload_id") || "").replace(/[^a-z0-9-]/gi, "").slice(0, 64);
    const slotName = String(form.get("slot") || "") === "pdf" ? "pdf" : String(form.get("slot") || "") === "html" ? "html" : "";
    const seq = Number(form.get("seq"));
    const part = form.get("part");
    if (!uploadId || !slotName || !(part instanceof File) || isNaN(seq)) return NextResponse.json({ ok: false, error: "Bad part" }, { status: 400 });
    const { error } = await sb.storage.from(UPLOAD_BUCKET).upload(`${uploadId}/${slotName}/${seq}`, part, { contentType: "application/octet-stream", upsert: true });
    if (error) return NextResponse.json({ ok: false, error: error.message.slice(0, 150) }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "finish") {
    const uploadId = String(form.get("upload_id") || "").replace(/[^a-z0-9-]/gi, "").slice(0, 64);
    const brand = String(form.get("brand_name") || "").trim();
    const version = String(form.get("version") || "1").trim() || "1";
    if (!uploadId || !brand) return NextResponse.json({ ok: false, error: "Bad finish" }, { status: 400 });

    async function assemble(slotName: "html" | "pdf", partsCount: number): Promise<Blob> {
      const chunks: Uint8Array[] = [];
      for (let i = 0; i < partsCount; i++) {
        const { data, error } = await sb.storage.from(UPLOAD_BUCKET).download(`${uploadId}/${slotName}/${i}`);
        if (error || !data) throw new Error(`Missing ${slotName} part ${i + 1}`);
        chunks.push(new Uint8Array(await data.arrayBuffer()));
      }
      await sb.storage.from(UPLOAD_BUCKET).remove(Array.from({ length: partsCount }, (_, i) => `${uploadId}/${slotName}/${i}`)).catch(() => {});
      return new Blob(chunks as BlobPart[]);
    }

    const htmlParts = Number(form.get("html_parts")) || 0;
    const pdfParts = Number(form.get("pdf_parts")) || 0;
    // Whichever file was small enough not to need chunking rides along directly.
    const htmlDirect = form.get("html") as File | null;
    const pdfDirect = form.get("pdf") as File | null;
    for (const f of [htmlDirect, pdfDirect]) if (f && f.size > 20 * 1024 * 1024) return NextResponse.json({ ok: false, error: `${f.name} is over 20MB` }, { status: 400 });

    let htmlBlob: Blob | null = htmlDirect;
    let pdfBlob: Blob | null = pdfDirect;
    try {
      if (!htmlBlob && htmlParts) htmlBlob = await assemble("html", htmlParts);
      if (!pdfBlob && pdfParts) pdfBlob = await assemble("pdf", pdfParts);
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
    }
    if (!htmlBlob && !pdfBlob) return NextResponse.json({ ok: false, error: "Attach the HTML and/or PDF" }, { status: 400 });

    const result = await saveFinal(sb, brand, version, htmlBlob, pdfBlob);
    if ((result as any).error) return NextResponse.json({ ok: false, needsSetup: (result as any).needsSetup, error: (result as any).error }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Small, single-request path — both files comfortably under the body cap.
  const brand = String(form.get("brand_name") || "").trim();
  const version = String(form.get("version") || "1").trim() || "1";
  const html = form.get("html") as File | null;
  const pdf = form.get("pdf") as File | null;
  if (!brand) return NextResponse.json({ ok: false, error: "Brand required" }, { status: 400 });
  if (!html && !pdf) return NextResponse.json({ ok: false, error: "Attach the HTML and/or PDF" }, { status: 400 });
  for (const f of [html, pdf]) if (f && f.size > 20 * 1024 * 1024) return NextResponse.json({ ok: false, error: `${f.name} is over 20MB` }, { status: 400 });

  const result = await saveFinal(sb, brand, version, html, pdf);
  if ((result as any).error) return NextResponse.json({ ok: false, needsSetup: (result as any).needsSetup, error: (result as any).error }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const sb = await createClient();
  const { error } = await sb.from("product_fact_sheets").delete().eq("id", id);
  return NextResponse.json({ ok: !error }, { status: error ? 500 : 200 });
}
