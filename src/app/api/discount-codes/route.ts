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
};

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
  const res = await fetch(`${sbUrl}/rest/v1/shop_discount_codes?select=*&order=code.asc`, { headers: h, cache: "no-store" });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: true, needsSetup: missing(res.status, text), codes: [] });

  const rows = JSON.parse(text || "[]") as Row[];
  // "Main" = the sole code on its own price rule (not a bulk affiliate/loyalty
  // batch) and not single-use. codes_in_rule/usage_limit are null for rows
  // synced before this classification existed — those fall through to "main"
  // rather than being silently hidden, since the alternative (treating
  // unknown as individual) would drop every pre-existing code from the tab.
  const isMain = (r: Row) => (r.codes_in_rule == null || r.codes_in_rule <= 1) && r.usage_limit !== 1;
  const today = new Date().toISOString().slice(0, 10);
  const codes = rows.filter(isMain).map(r => ({
    ...r,
    status: r.ends_at && r.ends_at < today ? "expired" : (r.starts_at && r.starts_at > today ? "scheduled" : "active"),
  }));
  return NextResponse.json({ ok: true, codes });
}
