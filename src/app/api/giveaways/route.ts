import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Admin/team view of giveaway commitments submitted via the public
// /giveaway-request form. Read: any signed-in user. Field edits (results,
// dates, notes etc): any signed-in user. Approving or rejecting a proposal
// is admin-only — that gate is the whole point (free product was going out
// the door with no one but the submitter's team knowing).
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const missing = (s: number, b: string) => s === 404 || /PGRST205|does not exist|schema cache/i.test(b);
const STATUSES = ["proposed", "approved", "running", "completed", "rejected"];
const GATED_STATUSES = new Set(["approved", "rejected"]);

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
  const res = await fetch(`${sbUrl}/rest/v1/giveaways?select=*&order=created_at.desc&limit=500`, { headers: h(), cache: "no-store" });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: true, needsSetup: missing(res.status, text), items: [] });
  return NextResponse.json({ ok: true, items: JSON.parse(text || "[]") });
}

// Staff can log a giveaway straight from this tab too, not just via the
// public share link — same table, same shape, just signed-in.
export async function POST(req: Request) {
  const acc = await getAccess();
  if (!acc.role) return NextResponse.json({ ok: false }, { status: 401 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const title = String(b.title || "").trim().slice(0, 200);
  const items = String(b.items || "").trim().slice(0, 1000);
  const brandId = b.brand_id !== "" && b.brand_id != null ? Number(b.brand_id) : null;
  if (!title || !items || !brandId) return NextResponse.json({ ok: false, error: "Brand, campaign name and giveaway items are required" }, { status: 400 });
  const row = {
    brand_id: brandId, title, items,
    mechanic: b.mechanic ? String(b.mechanic).trim().slice(0, 1000) : null,
    retail_value: b.retail_value === "" || b.retail_value == null ? null : Number(b.retail_value),
    platform: b.platform ? String(b.platform).trim().slice(0, 60) : null,
    entry_link: b.entry_link ? String(b.entry_link).trim().slice(0, 500) : null,
    start_date: b.start_date || null, end_date: b.end_date || null,
    submitter_name: b.submitter_name ? String(b.submitter_name).trim().slice(0, 100) : (acc.user?.email ?? "Team"),
    submitter_email: b.submitter_email ? String(b.submitter_email).trim().toLowerCase() : (acc.user?.email ?? null),
  };
  const res = await fetch(`${sbUrl}/rest/v1/giveaways`, { method: "POST", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(row) });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text), error: text.slice(0, 200) }, { status: 500 });
  return NextResponse.json({ ok: true, item: JSON.parse(text)[0] });
}

export async function PATCH(req: Request) {
  const acc = await getAccess();
  if (!acc.role) return NextResponse.json({ ok: false }, { status: 401 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const id = String(b.id || "");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });

  const fields: any = {};
  if (b.status !== undefined) {
    if (!STATUSES.includes(b.status)) return NextResponse.json({ ok: false, error: "Bad status" }, { status: 400 });
    if (GATED_STATUSES.has(b.status) && acc.role !== "admin") return NextResponse.json({ ok: false, error: "Only Mel can approve or reject a giveaway" }, { status: 403 });
    fields.status = b.status;
    if (b.status === "approved") { fields.approved_by = acc.user?.email ?? null; fields.approved_at = new Date().toISOString(); }
  }
  if (b.admin_note !== undefined) fields.admin_note = b.admin_note ? String(b.admin_note).slice(0, 1000) : null;
  if (b.results !== undefined) fields.results = b.results ? String(b.results).slice(0, 2000) : null;
  if (b.line_items !== undefined) fields.line_items = Array.isArray(b.line_items) ? b.line_items.slice(0, 50) : [];
  if (b.cin7_line_items !== undefined) fields.cin7_line_items = Array.isArray(b.cin7_line_items) ? b.cin7_line_items.slice(0, 50) : [];
  if (b.ship_to_name !== undefined) fields.ship_to_name = b.ship_to_name ? String(b.ship_to_name).slice(0, 150) : null;
  if (b.ship_to_address !== undefined) fields.ship_to_address = b.ship_to_address ? String(b.ship_to_address).slice(0, 500) : null;
  if (b.entry_link !== undefined) fields.entry_link = b.entry_link ? String(b.entry_link).slice(0, 500) : null;
  if (b.start_date !== undefined) fields.start_date = b.start_date || null;
  if (b.end_date !== undefined) fields.end_date = b.end_date || null;
  if (b.retail_value !== undefined) fields.retail_value = b.retail_value === "" || b.retail_value == null ? null : Number(b.retail_value);
  if (!Object.keys(fields).length) return NextResponse.json({ ok: false, error: "Nothing to update" }, { status: 400 });

  const res = await fetch(`${sbUrl}/rest/v1/giveaways?id=eq.${id}`, { method: "PATCH", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(fields) });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, error: text.slice(0, 200) }, { status: 500 });
  return NextResponse.json({ ok: true, item: JSON.parse(text)[0] });
}

export async function DELETE(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const res = await fetch(`${sbUrl}/rest/v1/giveaways?id=eq.${id}`, { method: "DELETE", headers: h({ Prefer: "return=minimal" }) });
  return NextResponse.json({ ok: res.ok });
}
