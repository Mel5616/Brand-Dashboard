// Two emails per claim: one to the customer so they have their reference, and
// one to the team so a claim never sits unseen in a table nobody opened.
//
// Sent from the verified Coolkidz sender, named and written as UPPAbaby. To
// send from an uppababy.com.au address that domain has to be verified in Resend.
const FROM = "UPPAbaby Australia <mel@coolkidz.com.au>";
const REPLY_TO = "marketing@coolkidz.com.au";
const TEAM = ["mel@coolkidz.com.au"];

type Claim = {
  id: string; reference: string; kind: string;
  name: string; email: string; phone: string | null;
  postal_address: string | null; product_type: string | null; model: string | null;
  serial_number: string | null; purchase_date: string | null; retailer: string | null;
  accident_date: string | null; seat_position: string | null; child_in_seat: string | null;
  report_number: string | null; notes: string | null; created_at: string;
};

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

async function send(to: string[], subject: string, html: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "RESEND_API_KEY not configured" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "User-Agent": "coolkidz-dashboard/1.0" },
    body: JSON.stringify({ from: FROM, reply_to: REPLY_TO, to, subject, html }),
  });
  if (!res.ok) return { ok: false, error: (await res.text()).slice(0, 200) };
  return { ok: true };
}

export async function sendClaimEmails(opts: { claim: Claim; fileCount: number }) {
  const c = opts.claim;
  const isClaim = c.kind !== "registration";
  const first = (c.name || "").split(" ")[0] || "there";

  /* ---- to the customer ---- */
  const customer = `<div style="font-family:-apple-system,Segoe UI,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#33404F">
  <div style="padding:26px 28px 6px"><div style="font-size:19px;font-weight:700;letter-spacing:-.01em;color:#141C26">UPPAbaby</div></div>
  <div style="padding:0 28px 28px">
    <h1 style="font-size:23px;font-weight:400;color:#141C26;margin:16px 0 14px">${isClaim ? "We have your claim" : "Your product is registered"}, ${esc(first)}.</h1>
    <p style="font-size:15px;line-height:1.6;margin:0 0 20px">${isClaim
      ? "Thank you for sending this through. Quote the reference below if you need to get in touch about it."
      : "That is it. Registering makes a warranty claim much quicker if you ever need one."}</p>
    <div style="border:1px solid #E4E1DC;border-radius:12px;padding:16px 18px;margin:0 0 22px;background:#FAF9F7">
      <div style="font-size:10.5px;letter-spacing:.13em;text-transform:uppercase;color:#7A8798;font-weight:600;margin-bottom:4px">Your reference</div>
      <div style="font-size:21px;font-weight:600;color:#141C26;letter-spacing:.02em">${esc(c.reference)}</div>
    </div>
    ${isClaim ? `<p style="font-size:15px;line-height:1.6;margin:0 0 8px"><b style="font-weight:600">What happens next</b></p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 20px">We check the details against the Crash Exchange terms and come back to you. If anything is missing we will ask rather than close it.</p>` : ""}
    <p style="font-size:13px;line-height:1.6;color:#7A8798;margin:0">Just reply to this email if you need anything.</p>
  </div>
  <p style="color:#98A2B0;font-size:11px;text-align:center;margin-top:6px;line-height:1.6">UPPAbaby is distributed in Australia by Coolkidz Australia Pty Ltd<br>1 Beyer Road, Braeside, Victoria 3195</p>
</div>`;

  /* ---- to the team ---- */
  const rows: [string, unknown][] = [
    ["Reference", c.reference], ["Type", isClaim ? "Crash Exchange claim" : "Product registration"],
    ["Name", c.name], ["Email", c.email], ["Phone", c.phone],
    ["Postal address", c.postal_address],
    ["Product", c.product_type], ["Model", c.model], ["Serial", c.serial_number],
    ["Purchased", c.purchase_date], ["Retailer", c.retailer],
    ["Accident date", c.accident_date], ["Position in vehicle", c.seat_position],
    ["Child in it", c.child_in_seat], ["Report number", c.report_number],
    ["Files attached", opts.fileCount], ["Notes", c.notes],
  ];
  const table = rows
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `<tr><td style="padding:7px 14px 7px 0;color:#7A8798;font-size:13px;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:7px 0;font-size:13px;color:#141C26">${esc(v)}</td></tr>`)
    .join("");

  const team = `<div style="font-family:-apple-system,Segoe UI,Helvetica,sans-serif;max-width:620px;margin:0 auto;color:#33404F">
  <div style="padding:22px 24px">
    <h1 style="font-size:19px;font-weight:600;color:#141C26;margin:0 0 4px">${isClaim ? "Crash Exchange claim" : "Product registration"} ${esc(c.reference)}</h1>
    <p style="font-size:13px;color:#7A8798;margin:0 0 18px">${esc(c.name)} · ${esc(c.email)}</p>
    <table style="border-collapse:collapse;width:100%">${table}</table>
    ${opts.fileCount ? `<p style="font-size:13px;color:#7A8798;margin:18px 0 0">${opts.fileCount} file${opts.fileCount === 1 ? "" : "s"} uploaded. They are in the private claim-files bucket in Supabase.</p>` : ""}
  </div>
</div>`;

  const out = await Promise.all([
    send([c.email], isClaim ? `Your UPPAbaby Crash Exchange claim ${c.reference}` : `Your UPPAbaby product registration ${c.reference}`, customer),
    send(TEAM, `${isClaim ? "Crash Exchange claim" : "Registration"} ${c.reference} — ${c.name}`, team),
  ]);
  return { ok: out.every(o => o.ok) };
}
