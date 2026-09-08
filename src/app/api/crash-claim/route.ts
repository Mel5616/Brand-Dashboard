import { NextResponse, after } from "next/server";
import { configured, rest, h, cors, missingTable, limited, ipOf, clean, looksLikeEmail } from "@/lib/registry";
import { sendClaimEmails } from "@/lib/claimMail";

// Crash Exchange claims and product registrations from uppababy.com.au.
//
// The 30 day rule is enforced here, not only in the browser. The form says it,
// the date input refuses it, and this refuses it again: a deadline that only
// exists in client-side validation is not a deadline.
export const revalidate = 0;
export const maxDuration = 30;

const POSITIONS = new Set(["front passenger", "rear left", "rear centre", "rear right", "not in the vehicle at the time"]);
const YESNO = new Set(["yes", "no"]);
// Crash Exchange covers the Mesa capsule and its base only. Registration takes
// anything. Checked here as well as in the form: a select is trivially edited
// in dev tools, and a claim we cannot honour is worse taken than refused.
const CLAIM_TYPES = new Set(["Mesa capsule", "Mesa base"]);
const REG_TYPES = new Set([...CLAIM_TYPES, "Pram or stroller", "RumbleSeat or bassinet"]);

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: cors(req.headers.get("origin"), "POST, OPTIONS") });
}

/** CE-8KJ4Q2 — short, unambiguous to read down a phone, and unique enough at
 *  this volume that a collision is not worth a round trip to check for. */
function reference(kind: string) {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += A[Math.floor(Math.random() * A.length)];
  return (kind === "registration" ? "PR-" : "CE-") + s;
}

const dayDiff = (iso: string) => Math.floor((Date.now() - new Date(iso + "T00:00:00").getTime()) / 86400000);

export async function POST(req: Request) {
  const co = cors(req.headers.get("origin"), "POST, OPTIONS");
  if (!configured()) return NextResponse.json({ ok: false, error: "Claims aren't set up yet" }, { status: 500, headers: co });
  if (limited(ipOf(req), 6, 60 * 60 * 1000)) {
    return NextResponse.json({ ok: false, error: "Too many submissions from this connection. Please email us instead." }, { status: 429, headers: co });
  }

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400, headers: co }); }

  const kind = clean(b.kind, 20) === "registration" ? "registration" : "crash";
  const name = clean(b.name, 200);
  const email = clean(b.email, 200);
  if (!name || !email || !looksLikeEmail(email)) {
    return NextResponse.json({ ok: false, error: "A name and a valid email address are required." }, { status: 400, headers: co });
  }

  const isDate = (v: string | null) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(new Date(v + "T00:00:00").getTime());
  const purchaseDate = clean(b.purchaseDate, 10);
  const accidentDate = clean(b.accidentDate, 10);

  if (purchaseDate && !isDate(purchaseDate)) {
    return NextResponse.json({ ok: false, error: "The date of purchase isn't a real date." }, { status: 400, headers: co });
  }

  if (kind === "crash") {
    if (!isDate(accidentDate)) {
      return NextResponse.json({ ok: false, error: "The date of the accident is required." }, { status: 400, headers: co });
    }
    const age = dayDiff(accidentDate!);
    if (age < 0) {
      return NextResponse.json({ ok: false, error: "The date of the accident is in the future." }, { status: 400, headers: co });
    }
    if (age > 30) {
      return NextResponse.json({
        ok: false,
        error: "A Crash Exchange claim has to be lodged within 30 days of the accident, and this one is " + age + " days ago. Please contact support so we can look at it with you.",
      }, { status: 400, headers: co });
    }
  }

  const files = Array.isArray(b.files) ? (b.files as Record<string, unknown>[]).slice(0, 12) : [];
  if (kind === "crash" && !files.some(f => clean(f.kind, 20) === "receipt")) {
    return NextResponse.json({ ok: false, error: "Proof of purchase is required." }, { status: 400, headers: co });
  }

  const pos = clean(b.seatPosition, 60);
  const child = clean(b.childInSeat, 10);
  const ptype = clean(b.productType, 60);
  const allowed = kind === "crash" ? CLAIM_TYPES : REG_TYPES;
  if (ptype && !allowed.has(ptype)) {
    return NextResponse.json({
      ok: false,
      error: kind === "crash"
        ? "Crash Exchange covers the Mesa capsule and its base. For a pram or stroller, please contact support."
        : "That product type isn't one we recognise.",
    }, { status: 400, headers: co });
  }

  const row = {
    reference: reference(kind),
    kind,
    name, email,
    phone: clean(b.phone, 50),
    postal_address: clean(b.postalAddress, 600),
    product_type: ptype,
    model: clean(b.model, 200),
    serial_number: clean(b.serialNumber, 120),
    purchase_date: purchaseDate,
    retailer: clean(b.retailer, 200),
    accident_date: kind === "crash" ? accidentDate : null,
    seat_position: pos && POSITIONS.has(pos.toLowerCase()) ? pos : null,
    child_in_seat: child && YESNO.has(child.toLowerCase()) ? child.toLowerCase() : null,
    report_number: clean(b.reportNumber, 120),
    notes: clean(b.notes, 2000),
    source_ip: ipOf(req).slice(0, 60),
  };

  const ins = await rest("crash_claims", {
    method: "POST", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(row),
  });
  const text = await ins.text();
  if (!ins.ok) {
    return NextResponse.json(
      { ok: false, error: missingTable(text) ? "Run add_crash_claims.sql first" : "That didn't save. Please try again." },
      { status: 500, headers: co },
    );
  }
  const claim = JSON.parse(text)[0];

  if (files.length) {
    const rows = files
      .map(f => ({
        claim_id: claim.id,
        storage_path: clean(f.path, 500),
        file_name: clean(f.name, 200) || "upload",
        content_type: clean(f.type, 100),
        bytes: Number(f.bytes) || null,
        kind: clean(f.kind, 20) === "receipt" ? "receipt" : "photo",
      }))
      .filter(r => r.storage_path);
    if (rows.length) {
      await rest("crash_claim_files", { method: "POST", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify(rows) });
    }
  }

  // After the response: the claim is saved either way, and a customer who has
  // just described a car accident should not be watching a spinner wait on an
  // email provider.
  after(async () => {
    try { await sendClaimEmails({ claim, fileCount: files.length }); } catch { /* the claim is in the dashboard regardless */ }
  });

  return NextResponse.json({ ok: true, reference: claim.reference }, { headers: co });
}
