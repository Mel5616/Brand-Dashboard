// The one email the registry has to send. There are no registry accounts and
// no passwords: the manage link IS the way back in, so if this does not arrive
// a parent who clears their browser has lost their list.
//
// Sent from the verified Coolkidz sender because that is what Resend is set up
// for, but named and written as UPPAbaby, because that is the shop the parent
// thinks they are dealing with. If it should come from an uppababy.com.au
// address, that domain has to be verified in Resend first.
const FROM = "UPPAbaby Australia <mel@coolkidz.com.au>";
const REPLY_TO = "marketing@coolkidz.com.au";
const SITE = "https://uppababy.com.au";

export async function sendRegistryEmail(opts: {
  to: string;
  ownerName: string;
  manageToken: string;
  shareToken: string;
}) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "RESEND_API_KEY not configured" };

  const manageUrl = `${SITE}/pages/registry?manage=${encodeURIComponent(opts.manageToken)}`;
  const shareUrl = `${SITE}/pages/registry?r=${encodeURIComponent(opts.shareToken)}`;
  const first = (opts.ownerName || "").split(" ")[0] || "there";

  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#33404F">
  <div style="padding:26px 28px 6px"><div style="font-size:19px;font-weight:700;letter-spacing:-.01em;color:#141C26">UPPAbaby</div></div>
  <div style="padding:0 28px 28px">
    <h1 style="font-size:23px;font-weight:400;color:#141C26;margin:16px 0 14px">Your registry is ready, ${escapeHtml(first)}.</h1>
    <p style="font-size:15px;line-height:1.6;margin:0 0 22px">Two links. Keep the first, send the second.</p>

    <p style="font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#7A8798;margin:0 0 6px;font-weight:600">Your link, to add and edit</p>
    <p style="font-size:14px;line-height:1.5;margin:0 0 8px"><a href="${manageUrl}" style="color:#141C26">${manageUrl}</a></p>
    <p style="font-size:13px;line-height:1.6;color:#7A8798;margin:0 0 26px">This is the only way back into your registry, so keep this email. Do not forward it: anyone who has it can edit your list.</p>

    <p style="font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#7A8798;margin:0 0 6px;font-weight:600">The link to send your family</p>
    <p style="font-size:14px;line-height:1.5;margin:0 0 8px"><a href="${shareUrl}" style="color:#141C26">${shareUrl}</a></p>
    <p style="font-size:13px;line-height:1.6;color:#7A8798;margin:0 0 26px">They see what you still need. Anything bought comes off the list on its own, so nobody doubles up, and they never see who bought what.</p>

    <p style="margin:0 0 24px"><a href="${manageUrl}" style="display:inline-block;background:#33404F;color:#fff;text-decoration:none;padding:13px 22px;border-radius:999px;font-size:14px">Open my registry</a></p>
    <p style="font-size:13px;line-height:1.6;color:#7A8798;margin:0">Anything at all, just reply to this email.</p>
  </div>
  <p style="color:#98A2B0;font-size:11px;text-align:center;margin-top:6px;line-height:1.6">UPPAbaby is distributed in Australia by Coolkidz Australia Pty Ltd<br>1 Beyer Road, Braeside, Victoria 3195</p>
</div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "User-Agent": "coolkidz-dashboard/1.0" },
    body: JSON.stringify({
      from: FROM, reply_to: REPLY_TO, to: [opts.to],
      subject: "Your UPPAbaby baby registry", html,
    }),
  });
  if (!res.ok) return { ok: false, error: (await res.text()).slice(0, 200) };
  return { ok: true };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
