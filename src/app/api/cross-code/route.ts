import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { mintToken, storeCreds } from "@/lib/shopifyMint";

// Cross-site discount code creator (write_discounts). Admin-only: creates the
// same percentage code on every selected store and records the result.
export const revalidate = 0;
export const maxDuration = 60;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });

export async function GET() {
  const acc = await getAccess();
  if (acc.role !== "admin") return NextResponse.json({ ok: false }, { status: 403 });
  const res = await fetch(`${sbUrl}/rest/v1/cross_site_codes?select=*&order=created_at.desc&limit=20`, { headers: h(), cache: "no-store" });
  const text = await res.text();
  return NextResponse.json({ ok: true, stores: storeCreds().map(s => ({ id: s.id, name: s.name })), items: res.ok ? JSON.parse(text || "[]") : [], needsSetup: !res.ok });
}

export async function POST(req: Request) {
  const acc = await getAccess();
  if (acc.role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const code = String(b.code || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 40);
  const discountType = b.discount_type === "fixed_amount" ? "fixed_amount" : "percentage";
  const percent = discountType === "percentage" ? Math.min(90, Math.max(1, Number(b.percent) || 0)) : 0;
  const amount = discountType === "fixed_amount" ? Math.min(10000, Math.max(0.01, Number(b.amount) || 0)) : 0;
  const starts = /^\d{4}-\d{2}-\d{2}$/.test(b.starts_at || "") ? b.starts_at : null;
  const ends = /^\d{4}-\d{2}-\d{2}$/.test(b.ends_at || "") ? b.ends_at : null;
  const storeIds: number[] = Array.isArray(b.store_ids) ? b.store_ids.map(Number) : [];
  const value = discountType === "percentage" ? percent : amount;
  if (!code || !value || storeIds.length === 0)
    return NextResponse.json({ ok: false, error: "Code, a discount value and at least one store required" }, { status: 400 });

  const targets = storeCreds().filter(s => storeIds.includes(s.id));
  const results: { brand: string; ok: boolean; error?: string }[] = [];
  for (const st of targets) {
    const token = await mintToken(st);
    if (!token) { results.push({ brand: st.name, ok: false, error: "auth failed" }); continue; }
    const mutation = `mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
      discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
        codeDiscountNode { id }
        userErrors { field message }
      }
    }`;
    const variables = {
      basicCodeDiscount: {
        title: code, code,
        startsAt: (starts ? new Date(starts + "T00:00:00+10:00") : new Date()).toISOString(),
        ...(ends ? { endsAt: new Date(ends + "T23:59:59+10:00").toISOString() } : {}),
        customerSelection: { all: true },
        customerGets: {
          value: discountType === "percentage"
            ? { percentage: percent / 100 }
            : { discountAmount: { amount: amount.toFixed(2), appliesOnEachItem: false } },
          items: { all: true },
        },
        appliesOncePerCustomer: true,
      },
    };
    const res = await fetch(`https://${st.domain}/admin/api/2024-01/graphql.json`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({ query: mutation, variables }), cache: "no-store",
    }).then(r => r.json()).catch(() => null);
    const errs = res?.data?.discountCodeBasicCreate?.userErrors ?? [];
    const topErr = res?.errors?.[0]?.message;
    if (res?.data?.discountCodeBasicCreate?.codeDiscountNode?.id) results.push({ brand: st.name, ok: true });
    else results.push({ brand: st.name, ok: false, error: (errs[0]?.message || topErr || "unknown error").slice(0, 120) });
  }

  await fetch(`${sbUrl}/rest/v1/cross_site_codes`, {
    method: "POST", headers: h({ Prefer: "return=minimal" }),
    body: JSON.stringify({
      code, discount_type: discountType, percent: discountType === "percentage" ? percent : null, amount: discountType === "fixed_amount" ? amount : null,
      starts_at: starts, ends_at: ends, results, created_by: (acc.user as any)?.email ?? null,
    }),
  }).catch(() => {});
  return NextResponse.json({ ok: true, results });
}
