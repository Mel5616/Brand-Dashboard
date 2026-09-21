import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { rest } from "@/lib/registry";
import { VOUCHER, VOUCHER_BRANDS, sweepRedemptions, sendVoucherEmail, brandByName, type VoucherRow } from "@/lib/vouchers";

// The Vouchers card on the Discount Codes tab.
// GET            -> every issued voucher, redemption swept against the brand stores
// POST {resend}  -> resend the email for one voucher (admin)
export const revalidate = 0;
export const maxDuration = 60;

const allowed = async () => {
  const acc = await getAccess();
  return acc.role === "admin" || (acc.allowedTabs ?? []).some(t => t === "cross-site-discounts" || t === "discount-codes");
};

export async function GET(req: Request) {
  if (!(await allowed())) return NextResponse.json({ ok: false }, { status: 403 });
  const force = new URL(req.url).searchParams.get("sweep") === "1";
  const res = await rest("issued_vouchers?select=*&order=issued_at.desc&limit=1000");
  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ ok: true, needsSetup: /PGRST205|does not exist/i.test(text), rows: [], config: VOUCHER, brands: VOUCHER_BRANDS });
  }
  const rows = (await res.json()) as VoucherRow[];
  await sweepRedemptions(rows, force);
  return NextResponse.json({ ok: true, rows, config: VOUCHER, brands: VOUCHER_BRANDS });
}

export async function POST(req: Request) {
  const acc = await getAccess();
  if (acc.role !== "admin") return NextResponse.json({ ok: false }, { status: 403 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  if (!b?.resend) return NextResponse.json({ ok: false }, { status: 400 });
  const res = await rest(`issued_vouchers?id=eq.${encodeURIComponent(String(b.resend))}&select=*`);
  const rows = res.ok ? ((await res.json()) as VoucherRow[]) : [];
  const r = rows[0];
  if (!r || !r.customer_email) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  const mail = await sendVoucherEmail({ to: r.customer_email, firstName: (r.customer_name || "there").split(" ")[0], brand: brandByName(r.brand_name), code: r.code, expiresAt: new Date(r.expires_at), orderName: r.source_order_name || "" });
  if (mail.ok) await rest(`issued_vouchers?id=eq.${r.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ email_sent: true, error: null }) });
  return NextResponse.json({ ok: !!mail.ok, error: mail.ok ? undefined : mail.error });
}
