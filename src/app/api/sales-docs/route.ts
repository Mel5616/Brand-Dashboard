import { NextResponse } from "next/server";
import { getAccess, canManage } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

// Retailer Hub document library: price lists, brand overviews, trading terms.
// Files (self-contained HTML and/or PDF) live in the public `sales-hub` bucket;
// this table holds metadata + URLs. Mirrors /api/fact-sheets, including the
// chunked-upload dance around Vercel's ~4.5MB request-body cap.
// GET ?category= → list (current by default, ?all=1 includes archived).
// POST → upload a new version (archives the previous current for that
//        category+brand). DELETE ?id= → remove. Both gated per-tab.
export const revalidate = 0;
const BUCKET = "sales-hub";
const UPLOAD_BUCKET = "sales-hub-uploads";
const CATEGORIES = ["price_list", "brand_overview", "terms", "credit_form", "stock_report"] as const;
type Category = (typeof CATEGORIES)[number];
const CAT_TAB: Record<Category, string> = { price_list: "price-lists", brand_overview: "brand-overview", terms: "terms", credit_form: "customer-forms", stock_report: "stock-availability" };
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "doc";
const missing = (m: string) => /PGRST205|does not exist|schema cache|relation .* does not exist/i.test(m || "");

export async function GET(req: Request) {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false, docs: [] }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const category = sp.get("category") || "";
  const all = sp.get("all") === "1";
  const sb = await createClient();
  let q = sb.from("sales_documents").select("*").order("brand_name").order("created_at", { ascending: false });
  if (CATEGORIES.includes(category as Category)) q = q.eq("category", category);
  if (!all) q = q.eq("status", "current");
  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, needsSetup: missing(error.message), docs: [] });
  return NextResponse.json({ ok: true, docs: data || [] });
}

async function saveFinal(sb: any, email: string | null, category: Category, brand: string | null, title: string, version: string, htmlBlob: Blob | null, pdfBlob: Blob | null) {
  await sb.storage.createBucket(BUCKET, { public: true }).catch(() => {});
  const base = `${category}/${slug(brand || title)}/${Date.now()}`;
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
  // One current doc per category+brand+title — matching on title lets a brand
  // keep e.g. a Trade AND a Retail price list current at once; re-uploading
  // under the same title archives the previous version.
  let prev = sb.from("sales_documents").update({ status: "archived" }).eq("category", category).eq("status", "current").eq("title", title);
  prev = brand ? prev.eq("brand_name", brand) : prev.is("brand_name", null);
  await prev;
  const { error } = await sb.from("sales_documents").insert({ category, brand_name: brand, title, version, html_url, pdf_url, status: "current", created_by: email });
  if (error) return { error: error.message, needsSetup: missing(error.message) };
  return { ok: true };
}

export async function POST(req: Request) {
  const a = await getAccess();
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ ok: false, error: "Bad upload" }, { status: 400 }); }
  const action = String(form.get("action") || "");
  const sb = await createClient();

  if (action === "part") {
    if (!a.role) return NextResponse.json({ ok: false }, { status: 401 });
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

  // finish + small single-request path share the metadata handling
  const category = String(form.get("category") || "") as Category;
  if (!CATEGORIES.includes(category)) return NextResponse.json({ ok: false, error: "Bad category" }, { status: 400 });
  if (!(await canManage(CAT_TAB[category]))) return NextResponse.json({ ok: false, error: "No access" }, { status: 403 });
  const brand = String(form.get("brand_name") || "").trim() || null;
  const title = String(form.get("title") || "").trim();
  const version = String(form.get("version") || "1").trim() || "1";
  if (!title) return NextResponse.json({ ok: false, error: "Title required" }, { status: 400 });

  let htmlBlob: Blob | null = form.get("html") as File | null;
  let pdfBlob: Blob | null = form.get("pdf") as File | null;
  for (const f of [htmlBlob, pdfBlob] as (File | null)[]) if (f && f.size > 30 * 1024 * 1024) return NextResponse.json({ ok: false, error: `${f.name} is over 30MB` }, { status: 400 });

  if (action === "finish") {
    const uploadId = String(form.get("upload_id") || "").replace(/[^a-z0-9-]/gi, "").slice(0, 64);
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
    try {
      if (!htmlBlob && htmlParts) htmlBlob = await assemble("html", htmlParts);
      if (!pdfBlob && pdfParts) pdfBlob = await assemble("pdf", pdfParts);
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
    }
  }

  if (!htmlBlob && !pdfBlob) return NextResponse.json({ ok: false, error: "Attach the HTML and/or PDF" }, { status: 400 });
  const result = await saveFinal(sb, a.user?.email || null, category, brand, title, version, htmlBlob, pdfBlob);
  if ((result as any).error) return NextResponse.json({ ok: false, needsSetup: (result as any).needsSetup, error: (result as any).error }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const sb = await createClient();
  const { data } = await sb.from("sales_documents").select("category").eq("id", id).maybeSingle();
  const tab = CAT_TAB[(data?.category || "") as Category] || "";
  if (!tab || !(await canManage(tab))) return NextResponse.json({ ok: false, error: "No access" }, { status: 403 });
  const { error } = await sb.from("sales_documents").delete().eq("id", id);
  return NextResponse.json({ ok: !error }, { status: error ? 500 : 200 });
}
