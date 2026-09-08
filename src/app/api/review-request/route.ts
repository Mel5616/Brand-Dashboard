import { NextResponse } from "next/server";
import { storeCreds } from "@/lib/shopifyMint";
import { genRewardCode, createRewardDiscountCode } from "@/lib/shopifyRewardCode";
import { sendReviewRewardMail, reviewMailShell } from "@/lib/reviewMail";

// Public, unauthenticated — the /review/[slug] landing page posts here once
// someone enters their email. Mints a real single-use Shopify code, emails
// it, and hands back the review destination + code for the on-screen
// confirmation. Trust-based (no proof of an actual review required), same
// as most "leave a review, get a code" flows.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const slug = String(b.slug || "").trim();
  const email = String(b.email || "").trim().toLowerCase();
  if (!slug || !emailRe.test(email)) return NextResponse.json({ ok: false, error: "A valid email is required" }, { status: 400 });

  const incRes = await fetch(`${sbUrl}/rest/v1/review_incentives?slug=eq.${encodeURIComponent(slug)}&limit=1`, { headers: h() });
  const [incentive] = incRes.ok ? JSON.parse(await incRes.text() || "[]") : [];
  if (!incentive || !incentive.active) return NextResponse.json({ ok: false, error: "This link isn't active." }, { status: 404 });

  // One code per email per incentive — re-requesting just resends the same code.
  const existingRes = await fetch(`${sbUrl}/rest/v1/review_requests?incentive_id=eq.${incentive.id}&email=eq.${encodeURIComponent(email)}&limit=1`, { headers: h() });
  const [existing] = existingRes.ok ? JSON.parse(await existingRes.text() || "[]") : [];
  if (existing?.discount_code) {
    await emailCode(incentive, email, existing.discount_code, existing.expires_at);
    return NextResponse.json({ ok: true, code: existing.discount_code, review_url: incentive.review_url });
  }

  const store = storeCreds().find(s => s.id === incentive.brand_id);
  if (!store) return NextResponse.json({ ok: false, error: "This brand isn't set up for reward codes yet" }, { status: 400 });

  try {
    const code = genRewardCode("REVIEW");
    const { nodeId, expiresAt } = await createRewardDiscountCode(store, code, {
      discountType: incentive.discount_type, value: Number(incentive.discount_value),
      minSpend: incentive.min_spend, expiryDays: incentive.expiry_days,
    });
    await fetch(`${sbUrl}/rest/v1/review_requests`, {
      method: "POST", headers: h({ Prefer: "return=minimal" }),
      body: JSON.stringify({
        incentive_id: incentive.id, brand: incentive.brand, brand_id: incentive.brand_id, email,
        discount_code: code, price_rule_id: nodeId, status: "issued", expires_at: expiresAt,
      }),
    });
    await emailCode(incentive, email, code, expiresAt);
    return NextResponse.json({ ok: true, code, review_url: incentive.review_url });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e.message || e).slice(0, 300) }, { status: 500 });
  }
}

async function emailCode(incentive: any, email: string, code: string, expiresAt: string) {
  const amount = incentive.discount_type === "percentage" ? `${incentive.discount_value}%` : `$${incentive.discount_value}`;
  const expires = new Date(expiresAt).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
  await sendReviewRewardMail({
    to: email, brand: incentive.brand, subject: `Your ${incentive.brand} reward code`,
    html: reviewMailShell(`
      <p style="font-size:15px;margin:0 0 14px">Thanks for reviewing ${incentive.brand}!</p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 14px">Here's your code for <strong>${amount} off</strong> your next order:</p>
      <p style="font-size:22px;font-weight:700;letter-spacing:0.05em;text-align:center;background:#f1f5f9;border-radius:8px;padding:14px;margin:0 0 14px">${code}</p>
      <p style="font-size:13px;color:#64748b;margin:0">Valid until ${expires}.</p>
    `),
  });
}
