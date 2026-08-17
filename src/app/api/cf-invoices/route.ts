import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

// Commission Factory's own monthly PLATFORM SUBSCRIPTION invoices (flat fee
// per brand, e.g. "Grow technology plan") — separate from the affiliate
// commission/transaction data synced from CF's API. CF emails these as PDFs
// with no API exposure, so they're entered manually with the PDF attached.
export const revalidate = 0;
const BUCKET = "cf-invoices";
const missing = (m: string) => /PGRST205|does not exist|schema cache|relation .* does not exist/i.test(m || "");

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false, rows: [] }, { status: 401 });
  const sb = await createClient();
  const { data, error } = await sb.from("commission_factory_invoices")
    .select("id,brand_id,invoice_no,period_month,invoice_date,due_date,subtotal,gst,total,amount_paid,amount_due,file_url,file_name")
    .order("period_month", { ascending: false });
  if (error) return NextResponse.json({ ok: true, needsSetup: missing(error.message), rows: [] });
  return NextResponse.json({ ok: true, rows: data || [] });
}

export async function POST(req: Request) {
  const access = await getAccess();
  if (access.role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ ok: false, error: "Bad upload" }, { status: 400 }); }

  const brand_id = Number(form.get("brand_id"));
  const invoice_no = String(form.get("invoice_no") || "").trim();
  const period_month = String(form.get("period_month") || "").trim();
  const invoice_date = String(form.get("invoice_date") || "").trim();
  if (!Number.isFinite(brand_id)) return NextResponse.json({ ok: false, error: "Brand required" }, { status: 400 });
  if (!invoice_no) return NextResponse.json({ ok: false, error: "Invoice number required" }, { status: 400 });
  if (!/^\d{4}-\d{2}$/.test(period_month)) return NextResponse.json({ ok: false, error: "Period (YYYY-MM) required" }, { status: 400 });
  if (!invoice_date) return NextResponse.json({ ok: false, error: "Invoice date required" }, { status: 400 });

  const file = form.get("file") as File | null;
  if (file && file.size > 20 * 1024 * 1024) return NextResponse.json({ ok: false, error: `${file.name} is over 20MB` }, { status: 400 });

  const sb = await createClient();
  let file_url: string | null = null, file_name: string | null = null;
  if (file && file.size > 0) {
    await sb.storage.createBucket(BUCKET, { public: true }).catch(() => {});
    const ext = (file.name.split(".").pop() || "pdf").toLowerCase().replace(/[^a-z0-9]/g, "") || "pdf";
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || "application/pdf", upsert: true });
    if (error) return NextResponse.json({ ok: false, error: `Upload: ${error.message}` }, { status: 500 });
    file_url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    file_name = file.name.slice(0, 200);
  }

  const num = (k: string) => Number(form.get(k)) || 0;
  const row = {
    brand_id, invoice_no: invoice_no.slice(0, 80), period_month, invoice_date,
    due_date: String(form.get("due_date") || "").trim() || null,
    subtotal: num("subtotal"), gst: num("gst"), total: num("total"),
    amount_paid: num("amount_paid"), amount_due: num("amount_due"),
    file_url, file_name, created_by: access.user?.email ?? null,
  };
  const { data, error } = await sb.from("commission_factory_invoices").insert(row).select().single();
  if (error) return NextResponse.json({ ok: false, needsSetup: missing(error.message), error: error.message.slice(0, 200) }, { status: 500 });
  return NextResponse.json({ ok: true, item: data });
}

export async function DELETE(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const sb = await createClient();
  const { error } = await sb.from("commission_factory_invoices").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
