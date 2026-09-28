import { NextResponse } from "next/server";
import { giveawayRequestOk } from "@/lib/giveawayRequestKey";
import { sendMail, shell } from "@/lib/agreementMail";

// Public, no-login intake for giveaway/competition commitments — share the
// /giveaway-request link (optionally with ?k=<GIVEAWAY_REQUEST_KEY>). Same
// table (giveaways) the admin Giveaways tab reads from. Every submission
// lands as status "proposed" — nothing runs until Mel approves it.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const missing = (s: number, b: string) => s === 404 || /PGRST205|does not exist|schema cache/i.test(b);
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const APPROVER = "mel@coolkidz.com.au";

export async function GET(req: Request) {
  if (!(await giveawayRequestOk(req))) return NextResponse.json({ ok: false }, { status: 403 });
  const res = await fetch(`${sbUrl}/rest/v1/brands?select=id,name&order=name.asc`, { headers: h() });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: true, needsSetup: missing(res.status, text), brands: [] });
  return NextResponse.json({ ok: true, brands: JSON.parse(text || "[]") });
}

export async function POST(req: Request) {
  if (!(await giveawayRequestOk(req))) return NextResponse.json({ ok: false }, { status: 403 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 }); }

  const submitterName = String(b.submitter_name || "").trim().slice(0, 100);
  const submitterEmail = String(b.submitter_email || "").trim().toLowerCase();
  const title = String(b.title || "").trim().slice(0, 200);
  const items = String(b.items || "").trim().slice(0, 1000);
  const brandId = b.brand_id !== "" && b.brand_id != null ? Number(b.brand_id) : null;
  if (!submitterName || !emailRe.test(submitterEmail) || !title || !items || !brandId)
    return NextResponse.json({ ok: false, error: "Your name, a valid email, brand, campaign name and giveaway items are required" }, { status: 400 });

  const row: Record<string, unknown> = {
    brand_id: brandId, title, items,
    gift_items: Array.isArray(b.gift_items) ? b.gift_items.slice(0, 50) : [],
    mechanic: b.mechanic ? String(b.mechanic).trim().slice(0, 1000) : null,
    retail_value: b.retail_value === "" || b.retail_value == null ? null : Number(b.retail_value),
    platform: b.platform ? String(b.platform).trim().slice(0, 60) : null,
    entry_link: b.entry_link ? String(b.entry_link).trim().slice(0, 500) : null,
    start_date: b.start_date || null,
    end_date: b.end_date || null,
    submitter_name: submitterName, submitter_email: submitterEmail,
  };

  const res = await fetch(`${sbUrl}/rest/v1/giveaways`, { method: "POST", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(row) });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text), error: text.slice(0, 200) }, { status: 500 });
  const item = JSON.parse(text)[0];

  const mail = await sendMail({
    to: [APPROVER], subject: `Giveaway commitment for approval — ${title}`,
    html: shell(`
      <p style="font-size:15px;margin:0 0 14px">New giveaway commitment from <strong>${submitterName}</strong> (${submitterEmail}) — needs your approval before it runs.</p>
      <p style="font-size:14px;margin:0 0 6px"><strong>Campaign:</strong> ${title}</p>
      <p style="font-size:14px;margin:0 0 6px"><strong>Items:</strong> ${items}</p>
      ${row.retail_value ? `<p style="font-size:14px;margin:0 0 6px"><strong>Retail value:</strong> $${row.retail_value}</p>` : ""}
      ${row.platform ? `<p style="font-size:14px;margin:0 0 6px"><strong>Platform:</strong> ${row.platform}</p>` : ""}
      ${row.mechanic ? `<p style="font-size:14px;line-height:1.6;margin:0 0 14px"><strong>Mechanic:</strong> ${String(row.mechanic).replace(/\n/g, "<br/>")}</p>` : ""}
      ${row.start_date || row.end_date ? `<p style="font-size:14px;margin:0 0 14px"><strong>Dates:</strong> ${row.start_date || "TBC"} – ${row.end_date || "TBC"}</p>` : ""}
    `),
  }).catch(() => ({ ok: false }));

  return NextResponse.json({ ok: true, item, emailed: !!mail.ok });
}
