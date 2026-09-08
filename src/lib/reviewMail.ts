// Resend helper for the review-reward flow. Sends from the verified
// hello@coolkidz.com.au address (same one klaviyoSenderForBrand defaults
// to) but with the brand's own name as the display name, since a sending
// domain needs to be verified in Resend but the display name is free text.
const FROM_ADDRESS = "hello@coolkidz.com.au";
const REPLY_TO = "hello@coolkidz.com.au";

export async function sendReviewRewardMail(opts: { to: string; brand: string; subject: string; html: string }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "RESEND_API_KEY not configured" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "User-Agent": "coolkidz-dashboard/1.0" },
    body: JSON.stringify({ from: `${opts.brand} <${FROM_ADDRESS}>`, reply_to: REPLY_TO, to: [opts.to], subject: opts.subject, html: opts.html }),
  });
  if (!res.ok) return { ok: false, error: (await res.text()).slice(0, 200) };
  return { ok: true };
}

export function reviewMailShell(inner: string) {
  return `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;color:#334155">
    <div style="border:1px solid #e2e8f0;border-radius:12px;padding:28px">${inner}</div>
    <p style="color:#94a3b8;font-size:11px;text-align:center;margin-top:14px">Coolkidz Australia Pty Ltd · 1 Beyer Road, Braeside, Victoria 3195</p>
  </div>`;
}
