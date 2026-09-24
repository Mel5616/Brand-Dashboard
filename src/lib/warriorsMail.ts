// Two emails per WonderFold Warriors application: one to the family with their
// reference and what happens next, one to the team with everything they need to
// assess it (the same details the old emailed PDF carried).
//
// Sent from the verified coolkidz.com.au domain, named WonderFold Australia.
// Replies from the family land in the info@ inbox that handled the PDF form.
const FROM = "WonderFold Australia <noreply@coolkidz.com.au>";
const REPLY_TO = "info@coolkidz.com.au";
const TEAM = (process.env.WARRIORS_TEAM_EMAIL || "info@coolkidz.com.au").split(",").map(s => s.trim()).filter(Boolean);

const ORIGINS = new Set(["https://wonderfold.com.au", "https://www.wonderfold.com.au", "https://wonderfold-australia.myshopify.com", "http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:9292"]);
export const corsWf = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && ORIGINS.has(origin) ? origin : "https://wonderfold.com.au",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  Vary: "Origin",
});

export type WarriorsApplication = {
  id: string; reference: string; created_at: string;
  parent_name: string; email: string; phone: string | null;
  address: string | null; suburb: string | null; state: string | null; postcode: string | null;
  child_name: string | null; child_age: string | null; needs: string[] | null; how_it_helps: string | null;
  wagon_interest: string | null; ndis_status: string | null; plan_manager_email: string | null; wants_ndis_quote: boolean;
  practitioner_name: string | null; practitioner_title: string | null; provider_number: string | null; practice_name: string | null;
  practitioner_email: string | null; practitioner_phone: string | null; diagnosis: string | null; treatment_plan: string | null;
  consent_contact_practitioner: boolean;
};

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

async function send(to: string[], subject: string, html: string, replyTo = REPLY_TO) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "RESEND_API_KEY not configured" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "User-Agent": "coolkidz-dashboard/1.0" },
    body: JSON.stringify({ from: FROM, reply_to: replyTo, to, subject, html }),
  });
  if (!res.ok) return { ok: false, error: (await res.text()).slice(0, 200) };
  return { ok: true };
}

export async function sendWarriorsEmails(opts: { app: WarriorsApplication; fileCount: number }) {
  const a = opts.app;
  const first = (a.parent_name || "").split(" ")[0] || "there";
  const hasPractitionerProof = opts.fileCount > 0;

  const family = `<div style="font-family:-apple-system,Segoe UI,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#2E4442">
  <div style="padding:26px 28px 6px"><div style="font-size:19px;font-weight:700;letter-spacing:.04em;color:#063537">WONDERFOLD</div></div>
  <div style="padding:0 28px 28px">
    <h1 style="font-size:23px;font-weight:500;color:#063537;margin:16px 0 14px">We have your Warriors application, ${esc(first)}.</h1>
    <p style="font-size:15px;line-height:1.6;margin:0 0 20px">Thank you for thinking of WonderFold for your family. Quote this reference if you need to get in touch about it.</p>
    <div style="border:1px solid #D3DFDA;border-radius:12px;padding:16px 18px;margin:0 0 22px;background:#F3F6F4">
      <div style="font-size:10.5px;letter-spacing:.13em;text-transform:uppercase;color:#6E8784;font-weight:600;margin-bottom:4px">Your reference</div>
      <div style="font-size:21px;font-weight:600;color:#063537;letter-spacing:.02em">${esc(a.reference)}</div>
    </div>
    <p style="font-size:15px;line-height:1.6;margin:0 0 8px"><b style="font-weight:600">What happens next</b></p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 14px">${hasPractitionerProof
      ? "We check your application and your practitioner's letter, usually within 3 to 5 business days."
      : "We check your application and confirm the details with your practitioner, usually within 3 to 5 business days."} Once approved, our team will be in touch to help you choose and order your wagon.</p>
    ${a.wants_ndis_quote ? `<p style="font-size:15px;line-height:1.6;margin:0 0 14px">You asked for an NDIS quote, so we'll include one${a.plan_manager_email ? " and can send it to your plan manager" : ""}. Whether a WonderFold is funded is a decision for the NDIA with your plan and your therapist.</p>` : ""}
    <p style="font-size:13px;line-height:1.6;color:#6E8784;margin:0">Questions? Reply to this email or call 1300 722 302, Monday to Friday.</p>
  </div>
  <p style="color:#8FA3A0;font-size:11px;text-align:center;margin-top:6px;line-height:1.6">WonderFold is distributed in Australia by Coolkidz Australia Pty Ltd<br>1 Beyer Road, Braeside, Victoria 3195</p>
</div>`;

  const rows: [string, unknown][] = [
    ["Reference", a.reference], ["Received", new Date(a.created_at).toLocaleString("en-AU", { timeZone: "Australia/Melbourne" })],
    ["Parent or guardian", a.parent_name], ["Email", a.email], ["Phone", a.phone],
    ["Address", [a.address, a.suburb, a.state, a.postcode].filter(Boolean).join(", ")],
    ["Child", a.child_name], ["Child's age", a.child_age], ["Needs", (a.needs || []).join(", ")],
    ["How a WonderFold would help", a.how_it_helps], ["Wagon of interest", a.wagon_interest],
    ["NDIS", a.ndis_status], ["Wants an NDIS quote", a.wants_ndis_quote ? "Yes" : "No"], ["Plan manager email", a.plan_manager_email],
    ["Practitioner", [a.practitioner_name, a.practitioner_title].filter(Boolean).join(", ")], ["Provider number", a.provider_number],
    ["Practice", a.practice_name], ["Practitioner email", a.practitioner_email], ["Practitioner phone", a.practitioner_phone],
    ["Diagnosis (as shared)", a.diagnosis], ["Part of a treatment plan", a.treatment_plan],
    ["OK to contact practitioner", a.consent_contact_practitioner ? "Yes" : "No"],
    ["Practitioner letter uploaded", hasPractitionerProof ? `Yes (${opts.fileCount} file${opts.fileCount === 1 ? "" : "s"}, in Supabase warriors-files)` : "No"],
  ];
  const table = rows.filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `<tr><td style="padding:7px 14px 7px 0;color:#6E8784;font-size:13px;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:7px 0;font-size:13px;color:#063537">${esc(v)}</td></tr>`).join("");
  const team = `<div style="font-family:-apple-system,Segoe UI,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#2E4442"><div style="padding:22px 24px">
    <h1 style="font-size:19px;font-weight:600;color:#063537;margin:0 0 4px">WonderFold Warriors application ${esc(a.reference)}</h1>
    <p style="font-size:13px;color:#6E8784;margin:0 0 16px">${hasPractitionerProof ? "Practitioner letter attached in storage." : a.consent_contact_practitioner ? "No letter uploaded: the family has consented to us contacting the practitioner." : "No letter and no consent to contact the practitioner: ask the family for a signed letter."}</p>
    <table style="border-collapse:collapse;width:100%">${table}</table>
    <p style="font-size:12px;color:#8FA3A0;margin-top:18px">Contains health information about a child. Keep it in this inbox; don't forward outside the team.</p></div></div>`;

  const r1 = await send([a.email], `Your WonderFold Warriors application ${a.reference}`, family);
  const r2 = await send(TEAM, `Warriors application ${a.reference}: ${a.parent_name}${a.wants_ndis_quote ? " (NDIS quote)" : ""}`, team, a.email);
  return { family: r1, team: r2 };
}
