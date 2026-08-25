import { NextResponse } from "next/server";
import { getAccess, canManage } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

// Retailer Hub → New Customer Forms: review submitted applications.
// GET → list submissions (?customer_id= filters). Any signed-in role.
// PATCH ?id= → { status } or { customer_id } (link/convert to a CRM record).
export const revalidate = 0;
const missing = (m: string) => /PGRST205|does not exist|schema cache|relation .* does not exist/i.test(m || "");

export async function GET(req: Request) {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false, submissions: [] }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const sb = await createClient();
  let q = sb.from("customer_form_submissions").select("*").order("created_at", { ascending: false }).limit(200);
  if (sp.get("customer_id")) q = q.eq("customer_id", sp.get("customer_id"));
  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, needsSetup: missing(error.message), submissions: [] });
  return NextResponse.json({ ok: true, submissions: data || [] });
}

export async function PATCH(req: Request) {
  if (!(await canManage("customer-forms"))) return NextResponse.json({ ok: false, error: "No access" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const row: any = {};
  if (["new", "reviewed", "approved"].includes(b.status)) row.status = b.status;
  if ("customer_id" in b) row.customer_id = b.customer_id || null;
  if (!Object.keys(row).length) return NextResponse.json({ ok: false }, { status: 400 });
  const sb = await createClient();
  const { error } = await sb.from("customer_form_submissions").update(row).eq("id", id);
  return NextResponse.json({ ok: !error }, { status: error ? 500 : 200 });
}

export async function DELETE(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const sb = await createClient();
  const { error } = await sb.from("customer_form_submissions").delete().eq("id", id);
  return NextResponse.json({ ok: !error }, { status: error ? 500 : 200 });
}
