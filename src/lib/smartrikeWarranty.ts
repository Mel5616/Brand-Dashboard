// smarTrike Australia product registration. Registrations live in the
// COOLKIDZ WARRANTY Supabase project (the dedicated one all brands' warranty
// registrations share), NOT the brand-dashboard project the rest of this repo
// uses. Customer PII stays out of the shared ops database. Receipt files go to
// a private bucket in that same warranty project. Self-contained so it can
// ship independently of the Gaia route.
const url = process.env.COOLKIDZ_WARRANTY_SUPABASE_URL || process.env.WARRANTY_SUPABASE_URL || process.env.GAIA_WARRANTY_SUPABASE_URL;
const key = process.env.COOLKIDZ_WARRANTY_SUPABASE_SERVICE_ROLE_KEY || process.env.WARRANTY_SUPABASE_SERVICE_ROLE_KEY || process.env.GAIA_WARRANTY_SUPABASE_SERVICE_ROLE_KEY;

export const BUCKET = "warranty-receipts";
export const configured = () => Boolean(url && key);

export const h = (extra: Record<string, string> = {}) => ({
  apikey: key!,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
  ...extra,
});

export const rest = (p: string, init?: RequestInit) =>
  fetch(`${url}/rest/v1/${p}`, { ...init, headers: h((init?.headers as Record<string, string>) || {}), cache: "no-store" });

export const missingTable = (text: string) => /PGRST205|does not exist|PGRST204|column/i.test(text);

/** Upload a receipt to the private bucket. Creates the bucket on first use. */
export async function uploadReceipt(path: string, file: File) {
  const bytes = Buffer.from(await file.arrayBuffer());
  const put = () => fetch(`${url}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: { apikey: key!, Authorization: `Bearer ${key}`, "Content-Type": file.type || "application/octet-stream", "x-upsert": "false" },
    body: bytes,
  });
  let res = await put();
  if (res.status === 404 || res.status === 400) {
    const t = await res.text();
    if (/bucket/i.test(t)) {
      await fetch(`${url}/storage/v1/bucket`, { method: "POST", headers: h(), body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false, file_size_limit: 12 * 1024 * 1024 }) }).catch(() => {});
      res = await put();
    } else {
      return { ok: false, error: t.slice(0, 200) };
    }
  }
  if (!res.ok) return { ok: false, error: (await res.text()).slice(0, 200) };
  return { ok: true, bytes };
}

/** Signed link the helpdesk can open for 60 days. */
export async function signReceipt(path: string, expiresIn = 60 * 24 * 3600) {
  const res = await fetch(`${url}/storage/v1/object/sign/${BUCKET}/${path}`, { method: "POST", headers: h(), body: JSON.stringify({ expiresIn }) });
  if (!res.ok) return null;
  const j = (await res.json()) as { signedURL?: string };
  return j.signedURL ? `${url}/storage/v1${j.signedURL}` : null;
}

/* ---------------- email ---------------- */
const FROM = "smarTrike Australia <mel@coolkidz.com.au>";
const REPLY_TO = "hello@smartrike.com.au";
export const HELPDESK = (process.env.SMARTRIKE_WARRANTY_HELPDESK || "support@coolkidz.com.au").split(",").map(s => s.trim()).filter(Boolean);

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

type Attachment = { filename: string; content: string };
async function send(to: string[], subject: string, html: string, attachments?: Attachment[]) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: "RESEND_API_KEY not configured" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "User-Agent": "coolkidz-dashboard/1.0" },
    body: JSON.stringify({ from: FROM, reply_to: REPLY_TO, to, subject, html, ...(attachments?.length ? { attachments } : {}) }),
  });
  if (!res.ok) return { ok: false, error: (await res.text()).slice(0, 200) };
  return { ok: true };
}

export type Registration = {
  reference: string; full_name: string; email: string; mobile: string | null;
  child_dob: string | null; guides_opt_in: boolean; receipt_path: string | null; receipt_name: string | null; created_at: string;
};
export type Item = { product_range: string | null; product_name: string; purchase_date: string | null; place_of_purchase: string | null };

const wrap = (inner: string) => `<div style="font-family:-apple-system,Segoe UI,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#41414e">
  <div style="padding:26px 28px 6px"><div style="font-size:19px;font-weight:700;letter-spacing:-.01em;color:#41414e">smarTrike<sup style="font-size:9px">®</sup> Australia</div></div>
  <div style="padding:0 28px 28px">${inner}</div>
  <p style="color:#6a6a77;font-size:11px;text-align:center;margin-top:6px;line-height:1.6">smarTrike is distributed in Australia by Coolkidz Australia Pty Ltd<br>1 Beyer Road, Braeside, Victoria 3195 · 1300 722 302</p>
</div>`;

export async function sendRegistrationEmails(opts: { registration: Registration; item: Item; receiptLink: string | null; receipt?: { filename: string; bytes: Buffer } | null }) {
  const r = opts.registration, i = opts.item;
  const first = (r.full_name || "").split(" ")[0] || "there";

  const customer = wrap(`
    <h1 style="font-size:23px;font-weight:500;color:#41414e;margin:16px 0 14px">Your ${esc(i.product_name)} is registered, ${esc(first)}.</h1>
    <p style="font-size:15px;line-height:1.6;margin:0 0 20px">We have your proof of purchase on file, so if you ever need to make a warranty claim there is nothing to dig out. Every smarTrike sold in Australia is covered for two years.</p>
    <div style="border:1px solid rgba(65,65,78,.16);border-radius:12px;padding:16px 18px;margin:0 0 22px;background:#f3f1f4">
      <div style="font-size:10.5px;letter-spacing:.13em;text-transform:uppercase;color:#6a6a77;font-weight:600;margin-bottom:4px">Your reference</div>
      <div style="font-size:21px;font-weight:600;color:#41414e;letter-spacing:.02em">${esc(r.reference)}</div>
    </div>
    <p style="font-size:15px;line-height:1.6;margin:0 0 6px"><b style="font-weight:600">${esc(i.product_name)}</b>${i.purchase_date ? ` · purchased ${esc(i.purchase_date)}` : ""}${i.place_of_purchase ? ` · ${esc(i.place_of_purchase)}` : ""}</p>
    ${r.guides_opt_in ? `<p style="font-size:15px;line-height:1.6;margin:14px 0 0">You asked for one guide a month matched to your child's age. The first one is on its way.</p>` : ""}
    <p style="font-size:13px;line-height:1.6;color:#6a6a77;margin:20px 0 0">Just reply to this email if anything about the registration is wrong.</p>`);

  const rows: [string, unknown][] = [
    ["Reference", r.reference], ["Name", r.full_name], ["Email", r.email], ["Mobile", r.mobile],
    ["Model", [i.product_range, i.product_name].filter(Boolean).join(" · ")], ["Purchased", i.purchase_date], ["Retailer", i.place_of_purchase],
    ["Child DOB", r.child_dob], ["Monthly guides", r.guides_opt_in ? "yes" : "no"],
    ["Receipt", opts.receiptLink ? `<a href="${esc(opts.receiptLink)}">${esc(r.receipt_name || "open receipt")}</a> (link valid 60 days; also attached)` : "not uploaded"],
  ];
  const table = rows.filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `<tr><td style="padding:7px 14px 7px 0;color:#6a6a77;font-size:13px;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:7px 0;font-size:13px;color:#41414e">${k === "Receipt" ? String(v) : esc(v)}</td></tr>`).join("");
  const team = `<div style="font-family:-apple-system,Segoe UI,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#41414e"><div style="padding:22px 24px">
    <h1 style="font-size:19px;font-weight:600;margin:0 0 4px">smarTrike registration ${esc(r.reference)}</h1>
    <p style="font-size:13px;color:#6a6a77;margin:0 0 18px">${esc(r.full_name)} · ${esc(r.email)} · via smartrike.com.au</p>
    <table style="border-collapse:collapse;width:100%">${table}</table></div></div>`;

  const attachments = opts.receipt ? [{ filename: opts.receipt.filename, content: opts.receipt.bytes.toString("base64") }] : undefined;
  const out = await Promise.all([
    send([r.email], `Your smarTrike registration ${r.reference}`, customer),
    send(HELPDESK, `smarTrike registration ${r.reference} — ${r.full_name} — ${i.product_name}`, team, attachments),
  ]);
  return { ok: out.every(o => o.ok) };
}
