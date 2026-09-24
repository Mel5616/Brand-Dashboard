import { NextResponse, after } from "next/server";
import { configured, rest, h, missingTable, limited, ipOf, clean, looksLikeEmail } from "@/lib/registry";
import { sendWarriorsEmails, corsWf } from "@/lib/warriorsMail";

// WonderFold Warriors applications from wonderfold.com.au. Replaces the PDF a
// family printed, had signed and emailed in. The practitioner part is either an
// uploaded signed letter or the practitioner's details plus the family's consent
// for us to confirm with them; one of the two is required, checked here as well
// as in the form.
export const revalidate = 0;
export const maxDuration = 30;

export async function OPTIONS(req: Request) { return new NextResponse(null, { status: 204, headers: corsWf(req.headers.get("origin")) }); }

const NEEDS = new Set(["Mobility", "Sensory", "Physical disability", "Neurodivergent (e.g. autism, ADHD)", "Anxiety or emotional support", "Complex medical needs", "Other"]);
const NDIS = new Set(["Not an NDIS participant", "Self-managed", "Plan-managed", "NDIA-managed", "Not sure"]);
const STATES = new Set(["VIC", "NSW", "QLD", "SA", "WA", "TAS", "ACT", "NT"]);

function reference() {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = ""; for (let i = 0; i < 6; i++) s += A[Math.floor(Math.random() * A.length)];
  return "WW-" + s;
}

export async function POST(req: Request) {
  const co = corsWf(req.headers.get("origin"));
  const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status, headers: co });
  if (!configured()) return bad("Applications aren't set up yet. Please email info@coolkidz.com.au.", 500);
  if (limited(ipOf(req), 6, 60 * 60 * 1000)) return bad("Too many submissions from this connection. Please email info@coolkidz.com.au instead.", 429);

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return bad("Bad request"); }
  if (clean(b.website, 50)) return NextResponse.json({ ok: true, reference: "WW-THANKS" }, { headers: co }); // honeypot

  const parent = clean(b.parentName, 200), email = clean(b.email, 200);
  if (!parent || !email || !looksLikeEmail(email)) return bad("Your name and a valid email address are required.");
  if (b.declaration !== true) return bad("Please confirm the information is true and correct.");
  if (b.privacyConsent !== true) return bad("Please agree to us storing your application so we can assess it.");

  const files = Array.isArray(b.files) ? (b.files as Record<string, unknown>[]).slice(0, 6) : [];
  const pracName = clean(b.practitionerName, 200);
  const consent = b.consentContactPractitioner === true;
  if (!files.length && !(pracName && consent)) return bad("Please upload your practitioner's signed letter, or give their details and let us contact them to confirm.");

  const needs = (Array.isArray(b.needs) ? b.needs : []).map(n => clean(n, 80)).filter((n): n is string => !!n && NEEDS.has(n));
  const ndis = clean(b.ndisStatus, 60);
  const state = clean(b.state, 10);
  const pm = clean(b.planManagerEmail, 200);

  const row = {
    reference: reference(),
    parent_name: parent, email, phone: clean(b.phone, 50),
    address: clean(b.address, 300), suburb: clean(b.suburb, 120), state: state && STATES.has(state) ? state : null, postcode: clean(b.postcode, 10),
    child_name: clean(b.childName, 120), child_age: clean(b.childAge, 40), needs, how_it_helps: clean(b.howItHelps, 3000),
    wagon_interest: clean(b.wagonInterest, 120), ndis_status: ndis && NDIS.has(ndis) ? ndis : null,
    plan_manager_email: pm && looksLikeEmail(pm) ? pm : null, wants_ndis_quote: b.wantsNdisQuote === true,
    practitioner_name: pracName, practitioner_title: clean(b.practitionerTitle, 120), provider_number: clean(b.providerNumber, 60),
    practice_name: clean(b.practiceName, 200), practitioner_email: clean(b.practitionerEmail, 200), practitioner_phone: clean(b.practitionerPhone, 50),
    diagnosis: clean(b.diagnosis, 1000), treatment_plan: clean(b.treatmentPlan, 20), consent_contact_practitioner: consent,
    declaration: true, privacy_consent: true, source_ip: ipOf(req).slice(0, 60),
  };

  const ins = await rest("warriors_applications", { method: "POST", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(row) });
  const text = await ins.text();
  if (!ins.ok) return bad(missingTable(text) ? "Run add_warriors_applications.sql first" : "That didn't save. Please try again, or email info@coolkidz.com.au.", 500);
  const app = JSON.parse(text)[0];

  if (files.length) {
    const rows = files.map(f => ({ application_id: app.id, storage_path: clean(f.path, 500), file_name: clean(f.name, 200) || "upload", content_type: clean(f.type, 100), bytes: Number(f.bytes) || null, kind: "practitioner_letter" })).filter(r => r.storage_path);
    if (rows.length) await rest("warriors_application_files", { method: "POST", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify(rows) });
  }

  after(async () => { try { await sendWarriorsEmails({ app, fileCount: files.length }); } catch { /* saved regardless */ } });
  return NextResponse.json({ ok: true, reference: app.reference }, { headers: co });
}
