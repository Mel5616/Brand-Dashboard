import { NextResponse } from "next/server";
import { rest } from "@/lib/registry";
import { REWARD, rewardKey, rewardCode, createCodeEverywhere, sendRewardEmail } from "@/lib/reviewRewards";

// Called by scripts/review_rewards.py (GitHub Actions, hourly) for every new
// published review it finds in any brand's Klaviyo account. Idempotent on
// review_id. Creates the single-use code on every brand store, records it,
// emails the reviewer. Auth is the derived shared key, never a session.
export const revalidate = 0;
export const maxDuration = 60;

export async function POST(req: Request) {
  if (req.headers.get("x-reward-key") !== rewardKey()) return NextResponse.json({ ok: false, error: "unauthorised" }, { status: 401 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const reviewId = String(b.review_id || ""), email = String(b.email || "").trim().toLowerCase();
  if (!reviewId || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ ok: false, error: "review_id and email required" }, { status: 400 });
  const dup = await rest(`review_rewards?review_id=eq.${encodeURIComponent(reviewId)}&select=id,status,code`);
  if (dup.ok) { const rows = await dup.json(); if (rows.length) return NextResponse.json({ ok: true, duplicate: true, code: rows[0].code }); }
  // One reward per reviewer per 30 days, so a burst of reviews on one order earns one code, not five.
  const recent = await rest(`review_rewards?customer_email=eq.${encodeURIComponent(email)}&issued_at=gte.${new Date(Date.now() - 30 * 86400000).toISOString()}&select=id,code`);
  if (recent.ok) { const rows = await recent.json(); if (rows.length) return NextResponse.json({ ok: true, throttled: true, code: rows[0].code }); }

  const code = rewardCode(); const expiresAt = new Date(Date.now() + REWARD.days * 86400000);
  const sourceBrand = String(b.brand_name || "one of our brands");
  const { codes, errors } = await createCodeEverywhere(code, expiresAt, sourceBrand);
  const row = { source_brand_id: Number(b.brand_id ?? 9), source_brand_name: sourceBrand, review_id: reviewId, customer_email: email, customer_name: b.name ? String(b.name).slice(0, 120) : null,
    rating: b.rating != null ? Number(b.rating) : null, product_url: b.product_url ? String(b.product_url).slice(0, 500) : null, code, value: REWARD.value, expires_at: expiresAt.toISOString(), codes,
    status: Object.keys(codes).length ? "issued" : "failed", error: errors.length ? errors.join("; ").slice(0, 500) : null, email_sent: false };
  const ins = await rest("review_rewards", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(row) });
  if (!ins.ok) return NextResponse.json({ ok: false, error: (await ins.text()).slice(0, 200) }, { status: 500 });
  const saved = (await ins.json())[0];
  if (row.status !== "issued") return NextResponse.json({ ok: false, error: row.error });
  const mail = await sendRewardEmail({ to: email, firstName: (row.customer_name || "there").split(" ")[0], sourceBrand, code, expiresAt });
  await rest(`review_rewards?id=eq.${saved.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ email_sent: mail.ok, error: mail.ok ? row.error : `email: ${mail.error}` }) });
  return NextResponse.json({ ok: true, code, stores: Object.keys(codes).length, emailed: mail.ok });
}
