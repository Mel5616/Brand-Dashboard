import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Campaign Calendar CRUD — reads/writes the campaigns table via the service role.
// GET is any signed-in user (Management can view); writes are admin-only.

export const revalidate = 0;

const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const requireAdmin = async () => (await getAccess()).role === "admin";

function headers(extra: Record<string, string> = {}) {
  return { apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra };
}

function isMissingTable(status: number, body: string) {
  return status === 404 || /PGRST205|does not exist|schema cache/i.test(body);
}

const FIELDS = ["horizon", "campaign", "brand", "tier", "owner", "channel", "status", "key_date", "end_date", "note", "sort_order", "brief", "image_url", "pillar", "confirmed", "asana_task_gid", "asana_permalink_url"];
const DATE_FIELDS = new Set(["key_date", "end_date"]);
function clean(b: any) {
  const row: Record<string, any> = {};
  // Empty-string dates aren't valid for a date column — store null instead.
  for (const f of FIELDS) if (b[f] !== undefined) row[f] = (DATE_FIELDS.has(f) && b[f] === "") ? null : b[f];
  return row;
}

// Real, connected deliverables per campaign (not just the brief's own
// checklist text) — how many blog drafts, EDMs and website tickets actually
// exist with this campaign_id, so the board card and Timeline can show what's
// really been produced instead of just what was planned. Each of these
// tables is small; fetching just the campaign_id column for linked rows is
// cheap, and one failing table (e.g. not set up yet) doesn't block the rest.
type DeliverableKey = "blog" | "edm" | "website" | "promo" | "social";
async function deliverableCounts(): Promise<Record<string, Record<DeliverableKey, number>>> {
  const counts: Record<string, Record<DeliverableKey, number>> = {};
  const bump = (id: string, key: DeliverableKey) => {
    if (!counts[id]) counts[id] = { blog: 0, edm: 0, website: 0, promo: 0, social: 0 };
    counts[id][key]++;
  };
  const tables: { table: string; key: DeliverableKey }[] = [
    { table: "blog_drafts", key: "blog" }, { table: "edm_drafts", key: "edm" }, { table: "website_requests", key: "website" }, { table: "site_deals", key: "promo" }, { table: "social_drafts", key: "social" },
  ];
  await Promise.all(tables.map(async ({ table, key }) => {
    const res = await fetch(`${sbUrl}/rest/v1/${table}?select=campaign_id&campaign_id=not.is.null`, { headers: headers(), cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const rows = await res.json().catch(() => []);
    for (const r of rows) if (r.campaign_id) bump(String(r.campaign_id), key);
  }));
  return counts;
}

export async function GET() {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false, items: [] }, { status: 500 });
  const [res, counts] = await Promise.all([
    fetch(`${sbUrl}/rest/v1/campaigns?select=*&order=sort_order.asc`, { headers: headers(), cache: "no-store" }),
    deliverableCounts(),
  ]);
  const text = await res.text();
  if (!res.ok) {
    if (isMissingTable(res.status, text)) return NextResponse.json({ ok: false, needsSetup: true, items: [] });
    return NextResponse.json({ ok: false, items: [] }, { status: 500 });
  }
  const items = JSON.parse(text || "[]").map((c: any) => ({ ...c, deliverables_status: counts[c.id] ?? { blog: 0, edm: 0, website: 0, promo: 0, social: 0 } }));
  return NextResponse.json({ ok: true, items });
}

export async function POST(req: Request) {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  if (!(await requireAdmin())) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const row = clean(b);
  if (!row.horizon) return NextResponse.json({ ok: false, message: "Missing horizon" }, { status: 400 });
  if (row.owner === undefined) row.owner = "TBC";
  // key_date is NOT NULL — a brand-new card has no date yet, so default to today
  // (the user sets the real date on the card). Avoids a not-null insert failure.
  if (!row.key_date) row.key_date = new Date().toISOString().slice(0, 10);
  const res = await fetch(`${sbUrl}/rest/v1/campaigns`, { method: "POST", headers: headers({ Prefer: "return=representation" }), body: JSON.stringify(row) });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, needsSetup: isMissingTable(res.status, text) }, { status: 500 });
  return NextResponse.json({ ok: true, item: JSON.parse(text)[0] });
}

export async function PATCH(req: Request) {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  if (!(await requireAdmin())) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  if (!b.id) return NextResponse.json({ ok: false }, { status: 400 });
  const fields = clean(b);
  fields.updated_at = new Date().toISOString();
  const res = await fetch(`${sbUrl}/rest/v1/campaigns?id=eq.${encodeURIComponent(String(b.id))}`, { method: "PATCH", headers: headers({ Prefer: "return=representation" }), body: JSON.stringify(fields) });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false }, { status: 500 });
  return NextResponse.json({ ok: true, item: JSON.parse(text)[0] });
}

export async function DELETE(req: Request) {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  if (!(await requireAdmin())) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  if (!b.id) return NextResponse.json({ ok: false }, { status: 400 });
  const res = await fetch(`${sbUrl}/rest/v1/campaigns?id=eq.${encodeURIComponent(String(b.id))}`, { method: "DELETE", headers: headers() });
  if (!res.ok) return NextResponse.json({ ok: false }, { status: 500 });
  return NextResponse.json({ ok: true });
}
