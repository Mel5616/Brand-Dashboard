// Resend helper for the media release flow. Server-side only.
const FROM = "Coolkidz Marketing <mel@coolkidz.com.au>";
const REPLY_TO = "marketing@coolkidz.com.au";

export async function sendMail(opts: { to: string[]; subject: string; html: string; attachments?: { filename: string; content: string }[] }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "RESEND_API_KEY not configured" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "User-Agent": "coolkidz-dashboard/1.0" },
    body: JSON.stringify({ from: FROM, reply_to: REPLY_TO, to: opts.to, subject: opts.subject, html: opts.html, attachments: opts.attachments }),
  });
  if (!res.ok) return { ok: false, error: (await res.text()).slice(0, 200) };
  return { ok: true };
}

export function shell(inner: string) {
  return `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:560px;margin:0 auto;color:#334155">
    <div style="background:#132741;border-radius:12px 12px 0 0;padding:22px 28px">
      <p style="margin:0;color:#fff;font-size:16px;font-weight:700;letter-spacing:.04em">COOLKIDZ AUSTRALIA</p>
    </div>
    <div style="border:1px solid #e2e8f0;border-top:0;border-radius:0 0 12px 12px;padding:26px 28px">${inner}</div>
    <p style="color:#94a3b8;font-size:11px;text-align:center;margin-top:14px">Coolkidz Australia · questions: marketing@coolkidz.com.au</p>
  </div>`;
}
