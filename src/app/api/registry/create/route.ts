import { NextResponse, after } from "next/server";
import { configured, rest, h, cors, missingTable, shareToken, manageToken, limited, ipOf, clean, looksLikeEmail } from "@/lib/registry";
import { sendRegistryEmail } from "@/lib/registryMail";

// Public, CORS-open. Creates a baby registry for a parent on uppababy.com.au
// and hands back both tokens. The theme keeps the manage token in the
// browser and emails it to the parent, because it is the only way back in:
// there are no registry accounts and no passwords.
export const revalidate = 0;

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: cors(req.headers.get("origin"), "POST, OPTIONS") });
}

export async function POST(req: Request) {
  const co = cors(req.headers.get("origin"), "POST, OPTIONS");
  if (!configured()) return NextResponse.json({ ok: false, error: "Registry isn't set up yet" }, { status: 500, headers: co });
  if (limited(ipOf(req), 5, 60 * 60 * 1000)) {
    return NextResponse.json({ ok: false, error: "Too many registries from this connection. Try again later." }, { status: 429, headers: co });
  }

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400, headers: co }); }

  const ownerName = clean(b.ownerName, 120);
  const ownerEmail = clean(b.ownerEmail, 200);
  if (!ownerName || !ownerEmail || !looksLikeEmail(ownerEmail)) {
    return NextResponse.json({ ok: false, error: "A name and a valid email address are required" }, { status: 400, headers: co });
  }

  // A date is optional, but a nonsense one is worth catching here rather than
  // letting Postgres reject the whole insert with something unreadable.
  const due = clean(b.dueDate, 10);
  if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) {
    return NextResponse.json({ ok: false, error: "The due date needs to be a real date" }, { status: 400, headers: co });
  }

  const row = {
    share_token: shareToken(),
    manage_token: manageToken(),
    owner_name: ownerName,
    owner_email: ownerEmail,
    partner_name: clean(b.partnerName, 120),
    due_date: due,
    greeting: clean(b.greeting, 600),
    ship_suburb: clean(b.shipSuburb, 120),
    ship_state: clean(b.shipState, 20),
  };

  const ins = await rest("registries", {
    method: "POST",
    headers: h({ Prefer: "return=representation" }),
    body: JSON.stringify(row),
  });
  const text = await ins.text();
  if (!ins.ok) {
    return NextResponse.json(
      { ok: false, error: missingTable(text) ? "Run add_registries.sql first" : "Couldn't create the registry" },
      { status: 500, headers: co },
    );
  }
  const reg = JSON.parse(text)[0];

  // The manage link is the only way back in, so this email matters more than
  // most. Sent after the response: a Resend outage must not stop a parent from
  // getting to the registry they just made, and the browser has both tokens
  // already.
  after(async () => {
    try { await sendRegistryEmail({ to: reg.owner_email, ownerName: reg.owner_name, manageToken: reg.manage_token, shareToken: reg.share_token }); }
    catch { /* the registry exists either way */ }
  });

  return NextResponse.json({
    ok: true,
    shareToken: reg.share_token,
    manageToken: reg.manage_token,
    ownerName: reg.owner_name,
  }, { headers: co });
}
