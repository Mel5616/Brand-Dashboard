import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Portfolio-wide "what's landing and when" timeline — stock arrivals,
// product launches, coming-soon teasers. Any signed-in user can view;
// only admins add/edit/remove.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hdr = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const missing = (status: number, body: string) => status === 404 || /PGRST205|does not exist|schema cache/i.test(body);

const FIELDS = ["brand_id", "event_type", "title", "date", "end_date", "product_name", "quantity", "status", "note", "image_url"];
function clean(b: any) {
  const row: Record<string, any> = {};
  for (const f of FIELDS) if (b[f] !== undefined) row[f] = ((f === "end_date" || f === "date") && b[f] === "") ? null : b[f];
  return row;
}

const isoDate = /^\d{4}-\d{2}-\d{2}$/;
async function sb(path: string) {
  try {
    const r = await fetch(`${sbUrl}/rest/v1/${path}`, { headers: hdr(), cache: "no-store" });
    if (!r.ok) return [];
    return JSON.parse((await r.text()) || "[]");
  } catch { return []; }
}

// Pull in read-only entries from Tradeshows, Campaign Calendar and New
// Products, so the timeline doesn't need everything re-typed by hand.
async function pulledEvents() {
  const [shows, showBrands, campaigns, products, brands] = await Promise.all([
    sb("tradeshows?select=id,name,date_start,date_end,state,location"),
    sb("tradeshow_brands?select=tradeshow_id,brand_id"),
    sb("campaigns?select=id,campaign,brand,key_date,end_date,note,image_url,confirmed"),
    sb("new_products?select=id,name,brand_id,status,launch_date,attrs"),
    sb("brands?select=id,name"),
  ]);

  const out: any[] = [];

  const showsById: Record<string, any> = {};
  for (const s of shows) showsById[s.id] = s;
  for (const link of showBrands) {
    const show = showsById[link.tradeshow_id];
    if (!show || !show.date_start) continue;
    out.push({
      id: `ts-${link.tradeshow_id}-${link.brand_id}`, source: "tradeshows", brand_id: link.brand_id,
      event_type: "trade", title: show.name, date: show.date_start, end_date: show.date_end || null,
      product_name: null, quantity: null, status: "locked",
      note: [show.location, show.state].filter(Boolean).join(", ") || null, image_url: null,
    });
  }

  const brandIdByName: Record<string, number> = {};
  for (const b of brands) brandIdByName[String(b.name).toLowerCase()] = b.id;
  for (const c of campaigns) {
    if (!c.key_date || !isoDate.test(c.key_date)) continue; // skip placeholder month-only dates
    const brandId = brandIdByName[String(c.brand || "").toLowerCase()];
    if (brandId === undefined) continue;
    out.push({
      id: `camp-${c.id}`, source: "campaigns", brand_id: brandId,
      event_type: "campaign", title: c.campaign, date: c.key_date, end_date: c.end_date && isoDate.test(c.end_date) ? c.end_date : null,
      product_name: null, quantity: null, status: c.confirmed === false ? "working" : "locked",
      note: c.note || null, image_url: c.image_url || null,
    });
  }

  const productGroups: Record<string, any[]> = {};
  for (const p of products) {
    if (p.status === "archived") continue;
    const key = `${p.brand_id}|${p.name}|${p.launch_date || ""}|${p.status}`;
    (productGroups[key] = productGroups[key] || []).push(p);
  }
  for (const key in productGroups) {
    const group = productGroups[key];
    const p = group[0];
    const withImg = group.find(g => g.attrs?.image_url);
    out.push({
      id: `prod-${p.id}`, source: "new_products", brand_id: p.brand_id,
      event_type: p.status === "coming_soon" ? "coming" : "launch", title: p.name, date: p.launch_date || null, end_date: null,
      product_name: group.length > 1 ? `${group.length} colourways` : null, quantity: null,
      status: p.status === "launched" ? "locked" : "working", note: null, image_url: withImg?.attrs?.image_url || null,
    });
  }

  return out;
}

export async function GET(req: Request) {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false, error: "auth" }, { status: 401 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false, events: [] }, { status: 500 });
  const brandId = new URL(req.url).searchParams.get("brand_id");
  let q = `${sbUrl}/rest/v1/timeline_events?select=*&order=date.asc`;
  if (brandId && /^\d+$/.test(brandId)) q += `&brand_id=eq.${brandId}`;
  const res = await fetch(q, { headers: hdr(), cache: "no-store" });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text), events: [] });
  const native = JSON.parse(text || "[]");
  let pulled = await pulledEvents();
  if (brandId && /^\d+$/.test(brandId)) pulled = pulled.filter((e: any) => e.brand_id === Number(brandId));
  return NextResponse.json({ ok: true, events: [...native, ...pulled] });
}

export async function POST(req: Request) {
  const acc = await getAccess();
  if (acc.role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const title = String(b.title ?? "").trim();
  if (!b.brand_id || !title) return NextResponse.json({ ok: false, error: "brand_id and title required" }, { status: 400 });
  const row = { ...clean(b), title, created_by: acc.user!.email };
  const res = await fetch(`${sbUrl}/rest/v1/timeline_events`, { method: "POST", headers: hdr({ Prefer: "return=representation" }), body: JSON.stringify(row) });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text), error: text.slice(0, 200) }, { status: 500 });
  return NextResponse.json({ ok: true, event: JSON.parse(text)[0] });
}

export async function PATCH(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  if (!b.id) return NextResponse.json({ ok: false }, { status: 400 });
  const fields = { ...clean(b), updated_at: new Date().toISOString() };
  const res = await fetch(`${sbUrl}/rest/v1/timeline_events?id=eq.${encodeURIComponent(String(b.id))}`, { method: "PATCH", headers: hdr({ Prefer: "return=minimal" }), body: JSON.stringify(fields) });
  return NextResponse.json({ ok: res.ok }, { status: res.ok ? 200 : 500 });
}

export async function DELETE(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const res = await fetch(`${sbUrl}/rest/v1/timeline_events?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: hdr({ Prefer: "return=minimal" }) });
  return NextResponse.json({ ok: res.ok }, { status: res.ok ? 200 : 500 });
}
