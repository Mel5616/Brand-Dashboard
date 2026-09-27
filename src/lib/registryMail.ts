// The one email the registry has to send. There are no registry accounts and
// no passwords: the manage link IS the way back in, so if this does not arrive
// a parent who clears their browser has lost their list.
//
// Sent from the shop the parent thinks they are dealing with: uppababy.com.au
// (verified in Resend 20 Sep 2026) or coolkidz.com.au for the Coolkidz Gift
// Registry. registry@ is a sending address only, so replies are steered to a
// mailbox someone reads.
import { STORES, type StoreKey } from "@/lib/registry";

const REPLY_TO = "marketing@coolkidz.com.au";

const LOOK: Record<StoreKey, { wordmark: string; ink: string; button: string; subject: string; footer: string }> = {
  uppababy: {
    wordmark: "UPPAbaby", ink: "#141C26", button: "#33404F",
    subject: "Your UPPAbaby baby registry",
    footer: "UPPAbaby is distributed in Australia by Coolkidz Australia Pty Ltd",
  },
  coolkidz: {
    wordmark: "coolkidz", ink: "#1B2433", button: "#1B2433",
    subject: "Your Coolkidz Gift Registry",
    footer: "Coolkidz Australia Pty Ltd, the Australian home of UPPAbaby, Nanit, Gaia Baby, WonderFold, Frida and more",
  },
};

export async function sendRegistryEmail(opts: {
  to: string;
  ownerName: string;
  manageToken: string;
  shareToken: string;
  store?: StoreKey;
}) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "RESEND_API_KEY not configured" };

  const store = opts.store || "uppababy";
  const s = STORES[store];
  const look = LOOK[store];
  const base = `${s.site}${s.page}`;
  const manageUrl = `${base}?manage=${encodeURIComponent(opts.manageToken)}`;
  const shareUrl = `${base}?r=${encodeURIComponent(opts.shareToken)}`;
  const first = (opts.ownerName || "").split(" ")[0] || "there";
  const brandLine = store === "coolkidz"
    ? "They see what you still need from every brand on your list. Anything bought comes off on its own, so nobody doubles up, and they never see who bought what."
    : "They see what you still need. Anything bought comes off the list on its own, so nobody doubles up, and they never see who bought what.";

  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#33404F">
  <div style="padding:26px 28px 6px"><div style="font-size:19px;font-weight:700;letter-spacing:-.01em;color:${look.ink}">${look.wordmark}</div></div>
  <div style="padding:0 28px 28px">
    <h1 style="font-size:23px;font-weight:400;color:${look.ink};margin:16px 0 14px">Your registry is ready, ${escapeHtml(first)}.</h1>
    <p style="font-size:15px;line-height:1.6;margin:0 0 22px">Two links. Keep the first, send the second.</p>

    <p style="font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#7A8798;margin:0 0 6px;font-weight:600">Your link, to add and edit</p>
    <p style="font-size:14px;line-height:1.5;margin:0 0 8px"><a href="${manageUrl}" style="color:${look.ink}">${manageUrl}</a></p>
    <p style="font-size:13px;line-height:1.6;color:#7A8798;margin:0 0 26px">This is the only way back into your registry, so keep this email. Do not forward it: anyone who has it can edit your list.</p>

    <p style="font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#7A8798;margin:0 0 6px;font-weight:600">The link to send your family</p>
    <p style="font-size:14px;line-height:1.5;margin:0 0 8px"><a href="${shareUrl}" style="color:${look.ink}">${shareUrl}</a></p>
    <p style="font-size:13px;line-height:1.6;color:#7A8798;margin:0 0 26px">${brandLine}</p>

    <p style="margin:0 0 24px"><a href="${manageUrl}" style="display:inline-block;background:${look.button};color:#fff;text-decoration:none;padding:13px 22px;border-radius:999px;font-size:14px">Open my registry</a></p>
    <p style="font-size:13px;line-height:1.6;color:#7A8798;margin:0">Anything at all, just reply to this email.</p>
  </div>
  <p style="color:#98A2B0;font-size:11px;text-align:center;margin-top:6px;line-height:1.6">${look.footer}<br>1 Beyer Road, Braeside, Victoria 3195</p>
</div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "User-Agent": "coolkidz-dashboard/1.0" },
    body: JSON.stringify({
      from: s.from, reply_to: REPLY_TO, to: [opts.to],
      subject: look.subject, html,
    }),
  });
  if (!res.ok) return { ok: false, error: (await res.text()).slice(0, 200) };
  return { ok: true };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
