import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

// Marketing expenses ledger. GET lists (any signed-in user). POST creates one
// expense with an optional PDF upload (admin). DELETE removes one (admin).
export const revalidate = 0;
const BUCKET = "marketing-expenses";
const missing = (m: string) => /PGRST205|does not exist|schema cache|relation .* does not exist/i.test(m || "");

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false, rows: [] }, { status: 401 });
  const sb = await createClient();
  const { data, error } = await sb.from("marketing_expenses")
    .select("id,expense_date,category,vendor,amount,brand_id,file_url,file_name,note,created_at")
    .order("expense_date", { ascending: false }).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ ok: true, needsSetup: missing(error.message), rows: [] });
  return NextResponse.json({ ok: true, rows: data || [] });
}

export async function POST(req: Request) {
  const access = await getAccess();
  if (access.role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ ok: false, error: "Bad upload" }, { status: 400 }); }

  const category = String(form.get("category") || "").trim();
  const expense_date = String(form.get("expense_date") || "").trim();
  if (!category) return NextResponse.json({ ok: false, error: "Category required" }, { status: 400 });
  if (!expense_date) return NextResponse.json({ ok: false, error: "Date required" }, { status: 400 });
  const brandRaw = String(form.get("brand_id") || "").trim();
  const file = form.get("file") as File | null;
  if (file && file.size > 20 * 1024 * 1024) return NextResponse.json({ ok: false, error: `${file.name} is over 20MB` }, { status: 400 });

  const sb = await createClient();
  let file_url: string | null = null, file_name: string | null = null;
  if (file && file.size > 0) {
    await sb.storage.createBucket(BUCKET, { public: true }).catch(() => {}); // idempotent
    const ext = (file.name.split(".").pop() || "pdf").toLowerCase().replace(/[^a-z0-9]/g, "") || "pdf";
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || "application/pdf", upsert: true });
    if (error) return NextResponse.json({ ok: false, error: `Upload: ${error.message}` }, { status: 500 });
    file_url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    file_name = file.name.slice(0, 200);
  }

  const row = {
    expense_date, category: category.slice(0, 80),
    vendor: String(form.get("vendor") || "").trim().slice(0, 200),
    amount: Number(form.get("amount")) || 0,
    brand_id: brandRaw ? Number(brandRaw) : null,
    note: String(form.get("note") || "").trim().slice(0, 500),
    file_url, file_name, created_by: access.user?.email ?? null,
  };
  const { data, error } = await sb.from("marketing_expenses").insert(row).select().single();
  if (error) return NextResponse.json({ ok: false, needsSetup: missing(error.message), error: error.message.slice(0, 200) }, { status: 500 });
  return NextResponse.json({ ok: true, item: data });
}

export async function DELETE(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const sb = await createClient();
  const { error } = await sb.from("marketing_expenses").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
