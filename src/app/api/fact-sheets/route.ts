import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

// Product Information (Phase 1): per-brand fact sheet document store.
// GET  → list sheets (current by default, ?all=1 includes archived). Any signed-in role.
// POST → upload a new sheet (HTML + PDF) for a brand; archives the previous current. Admin.
// DELETE ?id= → remove a sheet. Admin.
export const revalidate = 0;
const BUCKET = "fact-sheets";
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "brand";
const missing = (m: string) => /PGRST205|does not exist|schema cache|relation .* does not exist/i.test(m);

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

export async function POST(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ ok: false, error: "Bad upload" }, { status: 400 }); }
  const brand = String(form.get("brand_name") || "").trim();
  const version = String(form.get("version") || "1").trim() || "1";
  const html = form.get("html") as File | null;
  const pdf = form.get("pdf") as File | null;
  if (!brand) return NextResponse.json({ ok: false, error: "Brand required" }, { status: 400 });
  if (!html && !pdf) return NextResponse.json({ ok: false, error: "Attach the HTML and/or PDF" }, { status: 400 });
  for (const f of [html, pdf]) if (f && f.size > 20 * 1024 * 1024) return NextResponse.json({ ok: false, error: `${f.name} is over 20MB` }, { status: 400 });

  const sb = await createClient();
  await sb.storage.createBucket(BUCKET, { public: true }).catch(() => {}); // idempotent

  const stamp = Date.now();
  const base = `${slug(brand)}/${stamp}`;
  let html_url: string | null = null, pdf_url: string | null = null;
  if (html) {
    const { error } = await sb.storage.from(BUCKET).upload(`${base}.html`, html, { contentType: "text/html; charset=utf-8", upsert: true });
    if (error) return NextResponse.json({ ok: false, error: `HTML: ${error.message}` }, { status: 500 });
    html_url = sb.storage.from(BUCKET).getPublicUrl(`${base}.html`).data.publicUrl;
  }
  if (pdf) {
    const { error } = await sb.storage.from(BUCKET).upload(`${base}.pdf`, pdf, { contentType: "application/pdf", upsert: true });
    if (error) return NextResponse.json({ ok: false, error: `PDF: ${error.message}` }, { status: 500 });
    pdf_url = sb.storage.from(BUCKET).getPublicUrl(`${base}.pdf`).data.publicUrl;
  }

  // Archive the brand's previous current sheet, then insert the new one.
  await sb.from("product_fact_sheets").update({ status: "archived" }).eq("brand_name", brand).eq("status", "current");
  const { error } = await sb.from("product_fact_sheets").insert({ brand_name: brand, html_url, pdf_url, version, last_updated: new Date().toISOString().slice(0, 10), status: "current" });
  if (error) return NextResponse.json({ ok: false, needsSetup: missing(error.message), error: error.message }, { status: 500 });
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
