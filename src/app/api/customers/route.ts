import { NextResponse } from "next/server";
import { getAccess, canManage } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

// Retailer Hub → Customers (prospect CRM for new-account chasing).
// GET    → list customers with per-customer send/open + form-submission rollups.
// POST   → create a customer. Anyone granted the Customers tab.
// PATCH  → update fields (?id=). Anyone granted the Customers tab.
// DELETE → remove (?id=). Admin only.
export const revalidate = 0;
const missing = (m: string) => /PGRST205|does not exist|schema cache|relation .* does not exist/i.test(m || "");

const FIELDS = ["store_name", "contact_name", "email", "phone", "address", "state", "postcode", "abn", "website", "brands", "stage", "source", "notes", "next_action", "next_action_date"] as const;

function pick(b: any) {
  const row: any = {};
  for (const f of FIELDS) if (f in b) row[f] = b[f] === "" ? null : b[f];
  if (row.brands && !Array.isArray(row.brands)) delete row.brands;
  return row;
}

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
  const sb = await createClient();
  const { data, error } = await sb.from("sales_customers").select("*").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ ok: false, needsSetup: missing(error.message), customers: [] });

  // Rollups (best-effort — the list still renders if these fail).
  const [sends, subs] = await Promise.all([
    sb.from("sales_sends").select("customer_id,open_count,last_opened_at,created_at").not("customer_id", "is", null),
    sb.from("customer_form_submissions").select("customer_id,status,created_at").not("customer_id", "is", null),
  ]);
  const roll = new Map<string, { sends: number; opens: number; last_open: string | null; forms: number }>();
  for (const s of sends.data || []) {
    const r = roll.get(s.customer_id) || { sends: 0, opens: 0, last_open: null, forms: 0 };
    r.sends += 1; r.opens += s.open_count || 0;
    if (s.last_opened_at && (!r.last_open || s.last_opened_at > r.last_open)) r.last_open = s.last_opened_at;
    roll.set(s.customer_id, r);
  }
  for (const f of subs.data || []) {
    const r = roll.get(f.customer_id) || { sends: 0, opens: 0, last_open: null, forms: 0 };
    r.forms += 1; roll.set(f.customer_id, r);
  }
  return NextResponse.json({ ok: true, customers: (data || []).map(c => ({ ...c, activity: roll.get(c.id) || { sends: 0, opens: 0, last_open: null, forms: 0 } })) });
}

export async function POST(req: Request) {
  const a = await getAccess();
  if (!(await canManage("customers"))) return NextResponse.json({ ok: false, error: "No access" }, { status: 403 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const row = pick(b);
  if (!row.store_name) return NextResponse.json({ ok: false, error: "Store name required" }, { status: 400 });
  row.created_by = a.user?.email || null;
  const sb = await createClient();
  const { data, error } = await sb.from("sales_customers").insert(row).select().single();
  if (error) return NextResponse.json({ ok: false, needsSetup: missing(error.message), error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, customer: data });
}

export async function PATCH(req: Request) {
  if (!(await canManage("customers"))) return NextResponse.json({ ok: false, error: "No access" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const row = pick(b);
  row.updated_at = new Date().toISOString();
  const sb = await createClient();
  const { data, error } = await sb.from("sales_customers").update(row).eq("id", id).select().single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, customer: data });
}

export async function DELETE(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const sb = await createClient();
  const { error } = await sb.from("sales_customers").delete().eq("id", id);
  return NextResponse.json({ ok: !error }, { status: error ? 500 : 200 });
}
