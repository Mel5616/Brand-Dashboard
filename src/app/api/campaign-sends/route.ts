import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

// Flat list of every EDM send across the campaign stream — the "read this
// week, not this brand" view. Any signed-in user reads; admins edit.
export const revalidate = 0;
const missing = (m: string) => /PGRST205|does not exist|schema cache|relation .* does not exist/i.test(m || "");

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
  const sb = await createClient();
  const { data, error } = await sb.from("campaign_sends").select("*").order("send_date", { ascending: true }).order("sort_order", { ascending: true });
  if (error) return NextResponse.json({ ok: true, needsSetup: missing(error.message), sends: [] });
  return NextResponse.json({ ok: true, sends: data ?? [] });
}

export async function POST(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  if (!b.send_date || !b.brand || !b.subject) return NextResponse.json({ ok: false, error: "send_date, brand and subject required" }, { status: 400 });
  const sb = await createClient();
  const row = {
    send_date: b.send_date, brand: String(b.brand).slice(0, 120), campaign: b.campaign ? String(b.campaign).slice(0, 200) : null,
    campaign_id: b.campaign_id || null, type: String(b.type || "Campaign").slice(0, 30), subject: String(b.subject).slice(0, 400),
    sort_order: Number(b.sort_order) || 0,
  };
  const { data, error } = await sb.from("campaign_sends").insert(row).select().single();
  if (error) return NextResponse.json({ ok: false, needsSetup: missing(error.message), error: error.message.slice(0, 200) }, { status: 500 });
  return NextResponse.json({ ok: true, item: data });
}

export async function PATCH(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const id = String(b.id || "");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const fields: any = {};
  if (b.send_date !== undefined) fields.send_date = b.send_date;
  if (b.brand !== undefined) fields.brand = String(b.brand).slice(0, 120);
  if (b.campaign !== undefined) fields.campaign = b.campaign ? String(b.campaign).slice(0, 200) : null;
  if (b.type !== undefined) fields.type = String(b.type).slice(0, 30);
  if (b.subject !== undefined) fields.subject = String(b.subject).slice(0, 400);
  const sb = await createClient();
  const { error } = await sb.from("campaign_sends").update(fields).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message.slice(0, 200) }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const sb = await createClient();
  const { error } = await sb.from("campaign_sends").delete().eq("id", id);
  return NextResponse.json({ ok: !error });
}
