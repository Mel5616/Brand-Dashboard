import { sendMail, shell } from "./releaseMail";

// Shared logic for the Sales Hub intake, used by both the authenticated
// dashboard API (/api/sales-requests) and the public no-login form
// (/api/public-sales-request), so SLA/notification behaviour never drifts
// between the two entry points.
export const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const h = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
export const missing = (s: number, b: string) => s === 404 || /PGRST205|does not exist|schema cache/i.test(b);
export const MARKETING_ROTA = ["mel@coolkidz.com.au"];
export const BASE = "https://marketing.coolkidz.com.au";

export const REQUEST_TYPES = ["artwork", "swatch", "tune_up", "product", "filecamp", "comms"] as const;
export const STATUSES = ["new", "triaged", "in_progress", "review", "delivered", "on_hold", "declined"] as const;
export const GUIDELINE_LINKS: Record<string, string> = {
  artwork: "images", swatch: "images", tune_up: "tune-up-days", product: "product-and-gifting",
  filecamp: "filecamp", comms: "comms",
};

// Business-day add, weekends only (no AU public holiday calendar yet).
export function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d;
}

export function slaDays(request_type: string, brief: any): number | null {
  if (request_type === "artwork") {
    const t = brief?.artworkRequestType;
    if (t === "resize" || t === "copy_update") return 3;
    const specCount = Array.isArray(brief?.specs) ? brief.specs.length : 1;
    return specCount > 1 ? 15 : 10;
  }
  if (request_type === "swatch") return 5;
  if (request_type === "filecamp") {
    const reason = brief?.filecampReason;
    if (reason === "user_access") return 2;
    if (reason === "pricelist_update") return 3;
    return 5; // missing_assets, social_content — may need new photography/copy sourced
  }
  if (request_type === "comms") return 2;
  return null; // tune_up reviewed in the next schedule build; product has no marketing SLA
}

export function buildRequestRow(request_type: string, requesterEmail: string, requesterName: string | null, b: any) {
  return {
    request_type, status: "new",
    requester_email: requesterEmail, requester_name: requesterName ? String(requesterName).slice(0, 120) : null,
    brand: b.brand ? String(b.brand).slice(0, 80) : null,
    retailer: b.retailer ? String(b.retailer).slice(0, 120) : null,
    store: b.store ? String(b.store).slice(0, 120) : null,
    state: b.state ? String(b.state).slice(0, 10) : null,
    title: b.title ? String(b.title).slice(0, 200) : `${request_type} request`,
    end_use: String(b.end_use).slice(0, 300),
    needed_by: b.needed_by || null,
    brief: b.brief && typeof b.brief === "object" ? b.brief : {},
  };
}

export async function insertRequest(row: any) {
  const res = await fetch(`${sbUrl}/rest/v1/marketing_requests`, { method: "POST", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(row) });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text, created: res.ok ? JSON.parse(text)[0] : null };
}

export async function logEvent(request_id: string, actor: string, from_status: string | null, to_status: string, note: string | null) {
  await fetch(`${sbUrl}/rest/v1/request_events`, {
    method: "POST", headers: h({ Prefer: "return=minimal" }),
    body: JSON.stringify({ request_id, actor, from_status, to_status, note }),
  });
}

export async function notifyNewRequest(created: any) {
  // Product/gifting requests are a Sales decision, Marketing is notified for
  // awareness only, not asked to action it.
  const isProduct = created.request_type === "product";
  const subject = isProduct
    ? `[FYI] Product/gifting request from ${created.requester_email}: ${created.title}`
    : `New ${created.request_type} request: ${created.title}`;
  const body = shell(`
    <p style="font-size:15px">${isProduct ? "A product/gifting request has been submitted, this routes to Sales leadership, no action needed from Marketing." : "A new request has landed in the Sales Hub."}</p>
    <table style="font-size:13px;color:#334155;border-collapse:collapse;margin:14px 0">
      <tr><td style="padding:3px 12px 3px 0;color:#64748b">Type</td><td><strong>${created.request_type}</strong></td></tr>
      <tr><td style="padding:3px 12px 3px 0;color:#64748b">Requested by</td><td>${created.requester_email}${created.requester_name ? ` (${created.requester_name})` : ""}</td></tr>
      ${created.brand ? `<tr><td style="padding:3px 12px 3px 0;color:#64748b">Brand</td><td>${created.brand}</td></tr>` : ""}
      ${created.needed_by ? `<tr><td style="padding:3px 12px 3px 0;color:#64748b">Needed by</td><td>${created.needed_by}</td></tr>` : ""}
      <tr><td style="padding:3px 12px 3px 0;color:#64748b">Where it's used</td><td>${created.end_use}</td></tr>
    </table>
    <p style="text-align:center;margin:22px 0"><a href="${BASE}" style="background:#10b981;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 26px;border-radius:8px">Open the Sales Hub</a></p>
  `);
  return sendMail({ to: MARKETING_ROTA, subject, html: body });
}
