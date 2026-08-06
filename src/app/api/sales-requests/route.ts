import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { sendMail, shell } from "@/lib/releaseMail";

// Sales Hub intake — one table for artwork / swatch / tune-up / product requests.
// Sales team members (granted the "sales-hub" tab, not admin) see only their own
// requests; Marketing (admin) sees and triages everything.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const missing = (s: number, b: string) => s === 404 || /PGRST205|does not exist|schema cache/i.test(b);
const MARKETING_ROTA = ["mel@coolkidz.com.au"];
const BASE = "https://marketing.coolkidz.com.au";

const REQUEST_TYPES = ["artwork", "swatch", "tune_up", "product"] as const;
const STATUSES = ["new", "triaged", "in_progress", "review", "delivered", "on_hold", "declined"] as const;
const canUse = (acc: { role: string | null; allowedTabs: string[] }) => acc.role === "admin" || (!!acc.role && acc.allowedTabs.includes("sales-hub"));

const GUIDELINE_LINKS: Record<string, string> = {
  artwork: "images", swatch: "images", tune_up: "tune-up-days", product: "product-and-gifting",
};

// Business-day add, weekends only (no AU public holiday calendar yet).
function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d;
}

function slaDays(request_type: string, brief: any): number | null {
  if (request_type === "artwork") {
    const t = brief?.artworkRequestType;
    if (t === "resize" || t === "copy_update") return 3;
    const specCount = Array.isArray(brief?.specs) ? brief.specs.length : 1;
    return specCount > 1 ? 15 : 10;
  }
  if (request_type === "swatch") return 5;
  return null; // tune_up reviewed in the next schedule build; product has no marketing SLA
}

export async function GET(req: Request) {
  const acc = await getAccess();
  if (!canUse(acc)) return NextResponse.json({ ok: false, error: "No access" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const id = sp.get("id");

  if (id) {
    const [reqRes, filesRes, eventsRes] = await Promise.all([
      fetch(`${sbUrl}/rest/v1/marketing_requests?id=eq.${encodeURIComponent(id)}&limit=1`, { headers: h(), cache: "no-store" }),
      fetch(`${sbUrl}/rest/v1/request_files?request_id=eq.${encodeURIComponent(id)}&order=created_at.asc`, { headers: h(), cache: "no-store" }),
      fetch(`${sbUrl}/rest/v1/request_events?request_id=eq.${encodeURIComponent(id)}&order=created_at.asc`, { headers: h(), cache: "no-store" }),
    ]);
    const text = await reqRes.text();
    if (!reqRes.ok) return NextResponse.json({ ok: false, needsSetup: missing(reqRes.status, text) }, { status: 200 });
    const item = JSON.parse(text || "[]")[0];
    if (!item) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    if (acc.role !== "admin" && item.requester_email !== acc.user?.email) return NextResponse.json({ ok: false, error: "No access" }, { status: 403 });
    return NextResponse.json({ ok: true, item, files: await filesRes.json().catch(() => []), events: await eventsRes.json().catch(() => []) });
  }

  const res = await fetch(`${sbUrl}/rest/v1/marketing_requests?select=*&order=created_at.desc&limit=1000`, { headers: h(), cache: "no-store" });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: true, needsSetup: missing(res.status, text), items: [] });
  let items = JSON.parse(text || "[]");
  if (acc.role !== "admin") items = items.filter((r: any) => r.requester_email === acc.user?.email);
  return NextResponse.json({ ok: true, items, isAdmin: acc.role === "admin" });
}

export async function POST(req: Request) {
  const acc = await getAccess();
  if (!canUse(acc)) return NextResponse.json({ ok: false, error: "No access" }, { status: 403 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const request_type = String(b.request_type || "");
  if (!REQUEST_TYPES.includes(request_type as any)) return NextResponse.json({ ok: false, error: "Invalid request type" }, { status: 400 });
  if (!String(b.end_use || "").trim()) return NextResponse.json({ ok: false, error: "\"Where will this be used\" is required" }, { status: 400 });

  const row = {
    request_type, status: "new",
    requester_email: acc.user!.email, requester_name: b.requester_name ? String(b.requester_name).slice(0, 120) : null,
    brand: b.brand ? String(b.brand).slice(0, 80) : null,
    retailer: b.retailer ? String(b.retailer).slice(0, 120) : null,
    store: b.store ? String(b.store).slice(0, 120) : null,
    state: b.state ? String(b.state).slice(0, 10) : null,
    title: b.title ? String(b.title).slice(0, 200) : `${request_type} request`,
    end_use: String(b.end_use).slice(0, 300),
    needed_by: b.needed_by || null,
    brief: b.brief && typeof b.brief === "object" ? b.brief : {},
  };
  const res = await fetch(`${sbUrl}/rest/v1/marketing_requests`, { method: "POST", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(row) });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text), error: text.slice(0, 200) }, { status: 500 });
  const created = JSON.parse(text)[0];

  await fetch(`${sbUrl}/rest/v1/request_events`, {
    method: "POST", headers: h({ Prefer: "return=minimal" }),
    body: JSON.stringify({ request_id: created.id, actor: acc.user!.email, from_status: null, to_status: "new", note: "Request submitted" }),
  });

  // Product/gifting requests are a Sales decision — Marketing is notified for
  // awareness only, not asked to action it.
  const isProduct = request_type === "product";
  const subject = isProduct
    ? `[FYI] Product/gifting request from ${created.requester_email}: ${created.title}`
    : `New ${request_type} request: ${created.title}`;
  const body = shell(`
    <p style="font-size:15px">${isProduct ? "A product/gifting request has been submitted — this routes to Sales leadership, no action needed from Marketing." : "A new request has landed in the Sales Hub."}</p>
    <table style="font-size:13px;color:#334155;border-collapse:collapse;margin:14px 0">
      <tr><td style="padding:3px 12px 3px 0;color:#64748b">Type</td><td><strong>${request_type}</strong></td></tr>
      <tr><td style="padding:3px 12px 3px 0;color:#64748b">Requested by</td><td>${created.requester_email}</td></tr>
      ${created.brand ? `<tr><td style="padding:3px 12px 3px 0;color:#64748b">Brand</td><td>${created.brand}</td></tr>` : ""}
      ${created.needed_by ? `<tr><td style="padding:3px 12px 3px 0;color:#64748b">Needed by</td><td>${created.needed_by}</td></tr>` : ""}
      <tr><td style="padding:3px 12px 3px 0;color:#64748b">Where it's used</td><td>${created.end_use}</td></tr>
    </table>
    <p style="text-align:center;margin:22px 0"><a href="${BASE}" style="background:#10b981;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 26px;border-radius:8px">Open the Sales Hub</a></p>
  `);
  const mail = await sendMail({ to: MARKETING_ROTA, subject, html: body });
  return NextResponse.json({ ok: true, item: created, emailed: mail.ok });
}

export async function PATCH(req: Request) {
  const acc = await getAccess();
  if (acc.role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const id = String(b.id || "");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });

  const get = await fetch(`${sbUrl}/rest/v1/marketing_requests?id=eq.${encodeURIComponent(id)}&limit=1`, { headers: h(), cache: "no-store" });
  const item = (await get.json())[0];
  if (!item) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const fields: any = { updated_at: new Date().toISOString() };
  let toStatus = item.status;
  if (b.status) {
    if (!STATUSES.includes(b.status)) return NextResponse.json({ ok: false, error: "Invalid status" }, { status: 400 });
    if (b.status === "declined" && !String(b.decline_reason || "").trim()) return NextResponse.json({ ok: false, error: "Decline reason required" }, { status: 400 });
    fields.status = toStatus = b.status;
    if (b.status === "declined") fields.decline_reason = String(b.decline_reason).slice(0, 500);
    // Clock starts at triage, not creation.
    if (b.status === "triaged" && !item.sla_due_at) {
      const days = slaDays(item.request_type, item.brief);
      if (days != null) fields.sla_due_at = addBusinessDays(new Date(), days).toISOString();
    }
  }
  if (b.assignee_email !== undefined) fields.assignee_email = b.assignee_email ? String(b.assignee_email).slice(0, 200) : null;

  const res = await fetch(`${sbUrl}/rest/v1/marketing_requests?id=eq.${id}`, { method: "PATCH", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify(fields) });
  if (!res.ok) return NextResponse.json({ ok: false, error: (await res.text()).slice(0, 200) }, { status: 500 });

  if (b.status && b.status !== item.status) {
    await fetch(`${sbUrl}/rest/v1/request_events`, {
      method: "POST", headers: h({ Prefer: "return=minimal" }),
      body: JSON.stringify({ request_id: id, actor: acc.user!.email, from_status: item.status, to_status: toStatus, note: b.note ? String(b.note).slice(0, 500) : (b.decline_reason ? String(b.decline_reason).slice(0, 500) : null) }),
    });
    if (item.requester_email) {
      const declined = toStatus === "declined";
      const guideLink = declined && GUIDELINE_LINKS[item.request_type] ? `${BASE}?tab=sales-hub&guide=${GUIDELINE_LINKS[item.request_type]}` : null;
      await sendMail({
        to: [item.requester_email],
        subject: declined ? `Request declined: ${item.title}` : `Request update: ${item.title} — ${toStatus.replace(/_/g, " ")}`,
        html: shell(`
          <p style="font-size:15px">Your ${item.request_type.replace(/_/g, " ")} request "<strong>${item.title}</strong>" is now <strong>${toStatus.replace(/_/g, " ")}</strong>.</p>
          ${declined && b.decline_reason ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:12px 16px;margin:14px 0"><p style="margin:0;font-size:13px;color:#991b1b"><strong>Reason:</strong> ${String(b.decline_reason)}</p></div>` : ""}
          ${guideLink ? `<p style="font-size:13px"><a href="${guideLink}">Review the relevant guidelines</a> before resubmitting.</p>` : ""}
          <p style="text-align:center;margin:22px 0"><a href="${BASE}" style="background:#10b981;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 26px;border-radius:8px">Open the Sales Hub</a></p>
        `),
      });
    }
  }
  return NextResponse.json({ ok: true });
}
