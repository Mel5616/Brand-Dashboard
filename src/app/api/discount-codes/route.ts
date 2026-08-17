import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Main (not individual) discount codes, with expiry and usage — a separate
// query from /api/shopify-extras on purpose: that route only returns codes
// with usage_count > 0 (fine for "top redemptions", wrong here — a brand-new
// code with zero uses yet still needs to show up so its expiry is visible).
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = { apikey: sbKey!, Authorization: `Bearer ${sbKey}` };
const missing = (s: number, b: string) => s === 404 || /PGRST205|does not exist|schema cache/i.test(b);

type Row = {
  brand_id: number; code: string; usage_count: number; value_type: string | null; value: number | null;
  starts_at: string | null; ends_at: string | null; usage_limit: number | null; codes_in_rule: number | null;
  rule_title: string | null; title_shared_count: number | null;
};

// "Main" excludes: single-use codes (usage_limit=1), codes sharing a rule
// with other codes (codes_in_rule>1 — a less common bulk pattern), and codes
// whose price rule shares an identical/templated title with many other rules
// (title_shared_count>2 — the real signature of affiliate/referral-app
// batches, which typically create one rule PER code, so codes_in_rule alone
// doesn't catch them). Filtered in the query itself, not fetched-then-
// filtered — some brands have 10,000+ codes and PostgREST caps result pages,
// so filtering client-side after a plain fetch was silently truncating.
//
// NULL handling is deliberate, not an oversight: Postgres's `not.gt.1` etc.
// evaluate to NULL (excluded) when the column itself is null, so a code
// whose price rule hasn't been reclassified yet (older sync data, or a
// store with more rules than the sync's cap) drops out of this list rather
// than defaulting to "main". For a tab whose whole point is filtering out
// junk, under-showing is the safer failure mode than flooding it with
// unclassified bulk codes.
const MAIN_FILTER = "usage_limit=not.eq.1&codes_in_rule=not.gt.1&title_shared_count=not.gt.2";

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
  const res = await fetch(`${sbUrl}/rest/v1/shop_discount_codes?select=*&${MAIN_FILTER}&order=code.asc&limit=2000`, { headers: h, cache: "no-store" });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: true, needsSetup: missing(res.status, text), codes: [] });

  const rows = JSON.parse(text || "[]") as Row[];
  const today = new Date().toISOString().slice(0, 10);
  const codes = rows.map(r => ({
    ...r,
    status: r.ends_at && r.ends_at < today ? "expired" : (r.starts_at && r.starts_at > today ? "scheduled" : "active"),
  }));
  return NextResponse.json({ ok: true, codes });
}
