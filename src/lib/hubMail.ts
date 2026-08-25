// Retailer Hub email template. One builder used by BOTH the real send and the
// in-modal preview, so what you preview is exactly what the recipient gets.
// Bulletproof-ish email HTML: everything inline-styled, no external CSS.

export const KIND_LABEL: Record<string, string> = {
  price_list: "Price List", brand_overview: "Brand Overview", terms: "Trading Terms",
  fact_sheet: "Fact Sheet", form: "Credit Application Form",
};
const KIND_ICON: Record<string, string> = {
  price_list: "💲", brand_overview: "✨", terms: "📋", fact_sheet: "📄", form: "✍️",
};
const KIND_HINT: Record<string, string> = {
  price_list: "Current pricing", brand_overview: "Meet the brand", terms: "Our trading terms",
  fact_sheet: "Product details at a glance", form: "Open your trade account",
};

export type HubMailLink = { url: string; title: string; kind: string; brand?: string | null };

const esc = (s: any) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");

export function buildHubEmail(opts: { recipientName?: string | null; message?: string | null; links: HubMailLink[] }) {
  const firstName = (String(opts.recipientName || "").trim().split(/\s+/)[0]) || "there";
  const message = String(opts.message || "").trim();
  const brands = Array.from(new Set(opts.links.map(l => l.brand).filter(Boolean)));
  const heroLine = brands.length === 1 ? `Everything you need on ${esc(brands[0])}` : "Here's what we've put together for you";

  const cards = opts.links.map(l => `
    <a href="${l.url}" style="display:block;text-decoration:none;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;padding:16px 18px;margin:0 0 12px">
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%"><tr>
        <td style="width:44px;vertical-align:top">
          <div style="width:40px;height:40px;border-radius:10px;background:#eaf6fb;text-align:center;line-height:40px;font-size:19px">${KIND_ICON[l.kind] || "📄"}</div>
        </td>
        <td style="padding-left:12px;vertical-align:middle">
          <span style="display:inline-block;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#1E9DC2;margin-bottom:2px">${esc(KIND_LABEL[l.kind] || "Document")}</span>
          <span style="display:block;font-size:15px;font-weight:700;color:#0f172a;line-height:1.35">${esc(l.title)}</span>
          <span style="display:block;font-size:12px;color:#94a3b8;margin-top:1px">${esc(KIND_HINT[l.kind] || "")}</span>
        </td>
        <td style="width:84px;text-align:right;vertical-align:middle">
          <span style="display:inline-block;background:#1E9DC2;color:#ffffff;font-size:12px;font-weight:700;border-radius:999px;padding:8px 14px;white-space:nowrap">Open&nbsp;→</span>
        </td>
      </tr></table>
    </a>`).join("");

  return `<div style="background:#f1f5f9;padding:24px 12px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
    <div style="max-width:600px;margin:0 auto">
      <div style="background:#132741;border-radius:16px 16px 0 0;padding:26px 32px 22px">
        <img src="https://marketing.coolkidz.com.au/logos/coolkidz-logo.png" alt="Coolkidz Australia" height="30" style="display:block;height:30px;border:0" />
        <p style="color:#ffffff;font-size:21px;font-weight:800;margin:18px 0 4px;line-height:1.3">${heroLine}</p>
        <p style="color:#8fb0cc;font-size:13px;margin:0">from the Coolkidz Australia team</p>
      </div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 16px 16px;padding:28px 32px">
        <p style="font-size:15px;color:#0f172a;margin:0 0 12px">Hi ${esc(firstName)},</p>
        ${message
          ? `<p style="font-size:14px;color:#334155;line-height:1.65;white-space:pre-line;margin:0 0 20px">${esc(message)}</p>`
          : `<p style="font-size:14px;color:#334155;line-height:1.65;margin:0 0 20px">Great to be talking with you — here's everything to get you started with our brands. Click any card below to view.</p>`}
        ${cards}
        <p style="font-size:13px;color:#64748b;line-height:1.6;margin:20px 0 0">Questions, samples or anything else — just reply to this email and we'll sort it.</p>
        <p style="font-size:13.5px;color:#0f172a;font-weight:700;margin:14px 0 0">The Coolkidz Australia Team</p>
      </div>
      <p style="color:#94a3b8;font-size:11px;text-align:center;margin:16px 0 0;line-height:1.6">Coolkidz Australia Pty Ltd · 1 Beyer Road, Braeside VIC 3195<br/>Distributors of UPPAbaby, Frida, Nanit &amp; more in Australia &amp; New Zealand</p>
    </div>
  </div>`;
}
