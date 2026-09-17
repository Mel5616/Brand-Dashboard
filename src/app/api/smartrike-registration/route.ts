import { NextResponse, after } from "next/server";
import { limited, ipOf, clean, looksLikeEmail } from "@/lib/registry";
import { configured, rest, h, missingTable, uploadReceipt, signReceipt, sendRegistrationEmails } from "@/lib/smartrikeWarranty";

// Product registration for smartrike.com.au/pages/register-your-product.
// Multipart: the form posts the fields plus a receipt file. The row lands in
// the dedicated warranty database, the receipt in a private bucket, and the
// helpdesk gets an email with the receipt attached. Same shape as the Gaia
// Baby registration, with the receipt added.
export const revalidate = 0;
export const maxDuration = 30;

const ORIGINS = new Set(["https://smartrike.com.au", "https://www.smartrike.com.au", "https://smartrike.myshopify.com", "http://localhost:3000", "http://127.0.0.1:3000"]);
const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && ORIGINS.has(origin) ? origin : "https://smartrike.com.au",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Vary": "Origin",
});
export async function OPTIONS(req: Request) { return new NextResponse(null, { status: 204, headers: cors(req.headers.get("origin")) }); }

const MODELS: Record<string, string> = {
  "Wonder max™": "Wonder", "Wonder+™": "Wonder", "Wonder™": "Wonder",
  "Wind+™": "Wind", "Wind™": "Wind",
  "Xtend Ride-on": "Xtend", "Xtend Mini+ Scooter": "Xtend",
};
const RECEIPT_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"]);
const MAX_RECEIPT = 10 * 1024 * 1024;

function reference() {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += A[Math.floor(Math.random() * A.length)];
  return "ST-" + s;
}
const isDate = (v: string | null) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(new Date(v + "T00:00:00").getTime());
const str = (f: FormData, k: string, max: number) => clean(f.get(k), max);

export async function POST(req: Request) {
  const co = cors(req.headers.get("origin"));
  if (!configured()) return NextResponse.json({ ok: false, error: "Registration isn't set up yet. Please email hello@smartrike.com.au with your receipt." }, { status: 500, headers: co });
  if (limited(ipOf(req), 6, 60 * 60 * 1000)) {
    return NextResponse.json({ ok: false, error: "Too many submissions from this connection. Please email hello@smartrike.com.au instead." }, { status: 429, headers: co });
  }

  let f: FormData;
  try { f = await req.formData(); } catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400, headers: co }); }

  const firstName = str(f, "firstName", 100), lastName = str(f, "lastName", 100), email = str(f, "email", 200);
  if (!firstName || !lastName || !email || !looksLikeEmail(email)) {
    return NextResponse.json({ ok: false, error: "Your name and a valid email address are required." }, { status: 400, headers: co });
  }
  const model = str(f, "model", 60);
  if (!model || !(model in MODELS)) return NextResponse.json({ ok: false, error: "Please choose the model you bought." }, { status: 400, headers: co });
  const purchaseDate = str(f, "purchaseDate", 10);
  if (!isDate(purchaseDate)) return NextResponse.json({ ok: false, error: "Please enter the purchase date." }, { status: 400, headers: co });
  const childDob = str(f, "childDob", 10);
  if (childDob && !isDate(childDob)) return NextResponse.json({ ok: false, error: "That date of birth doesn't look right." }, { status: 400, headers: co });

  const receipt = f.get("receipt");
  if (!(receipt instanceof File) || receipt.size === 0) return NextResponse.json({ ok: false, error: "Please attach a photo or PDF of your receipt." }, { status: 400, headers: co });
  if (receipt.size > MAX_RECEIPT) return NextResponse.json({ ok: false, error: "The receipt file is over 10 MB. A phone photo or a PDF is perfect." }, { status: 400, headers: co });
  if (receipt.type && !RECEIPT_TYPES.has(receipt.type)) return NextResponse.json({ ok: false, error: "Receipts can be a JPG, PNG, HEIC or PDF." }, { status: 400, headers: co });

  const ref = reference();
  const safeName = receipt.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80) || "receipt";
  const receiptPath = `smartrike/${ref}/${safeName}`;
  const up = await uploadReceipt(receiptPath, receipt);
  if (!up.ok) return NextResponse.json({ ok: false, error: "The receipt didn't upload. Please try again, or email it to hello@smartrike.com.au." }, { status: 500, headers: co });

  const row = {
    reference: ref,
    brand: "smartrike",
    full_name: `${firstName} ${lastName}`,
    email,
    mobile: str(f, "mobile", 50),
    child_dob: childDob,
    guides_opt_in: String(f.get("guides") || "") === "yes",
    receipt_path: receiptPath,
    receipt_name: receipt.name.slice(0, 200),
    source_ip: ipOf(req).slice(0, 60),
  };
  const ins = await rest("warranty_registrations", { method: "POST", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(row) });
  const text = await ins.text();
  if (!ins.ok) {
    return NextResponse.json(
      { ok: false, error: missingTable(text) ? "Run add_smartrike_warranty.sql first" : "That didn't save. Please try again." },
      { status: 500, headers: co },
    );
  }
  const registration = JSON.parse(text)[0];
  const item = { registration_id: registration.id, product_range: MODELS[model], product_name: model, variant: null, purchase_date: purchaseDate, place_of_purchase: str(f, "retailer", 200) };
  await rest("warranty_registration_items", { method: "POST", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify(item) });

  const bytes = up.bytes!;
  after(async () => {
    try {
      const link = await signReceipt(receiptPath);
      await sendRegistrationEmails({ registration, item, receiptLink: link, receipt: { filename: safeName, bytes } });
    } catch { /* the registration is in the dashboard regardless */ }
  });

  return NextResponse.json({ ok: true, reference: ref }, { headers: co });
}
