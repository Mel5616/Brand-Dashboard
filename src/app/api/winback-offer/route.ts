import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { rest } from "@/lib/registry";
import { candidates, createWinbackCode, sendWinbackEmail, sweepRecoveries, winbackCode, WINBACK, GIFTS, type SendRow, type Checkout } from "@/lib/winbackOffer";

// Win-back card (Shopify tab).
// GET  ?from=YYYY-MM-DD&to=YYYY-MM-DD  -> candidate checkouts (live) + send history (swept)
// POST {campaign, from, to, ids:[checkoutId...] | all:true, test_to?} -> create codes, email, log
export const revalidate = 0;
export const maxDuration = 120;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const missing = (m: string) => /PGRST205|does not exist/i.test(m || "");

export async function GET(req: Request) {
  const acc = await getAccess();
  if (acc.role !== "admin" && !acc.allowedTabs?.includes("shopify")) return NextResponse.json({ ok: false }, { status: 403 });
  const u = new URL(req.url);
  const from = DATE.test(u.searchParams.get("from") || "") ? u.searchParams.get("from")! : new Date().toISOString().slice(0, 8) + "01";
  const to = DATE.test(u.searchParams.get("to") || "") ? u.searchParams.get("to")! : new Date().toISOString().slice(0, 10);
  const [cands, hist] = await Promise.all([candidates(from, to), rest("winback_offers?select=*&order=sent_at.desc&limit=500")]);
  let sends: SendRow[] = [], needsSetup = false;
  if (hist.ok) sends = await sweepRecoveries((await hist.json()) as SendRow[]);
  else needsSetup = missing(await hist.text());
  const sent = new Map(sends.map(s => [s.checkout_id, s]));
  return NextResponse.json({ ok: true, from, to, needsSetup, gifts: GIFTS, config: { days: WINBACK.days },
    candidates: (cands || []).map(c => ({ ...c, url: undefined, sent: sent.get(c.id) ? { code: sent.get(c.id)!.code, sent_at: sent.get(c.id)!.sent_at, status: sent.get(c.id)!.status } : null })),
    live: cands !== null, sends });
}

export async function POST(req: Request) {
  const acc = await getAccess();
  if (acc.role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const from = DATE.test(b.from || "") ? b.from : null, to = DATE.test(b.to || "") ? b.to : null;
  if (!from || !to) return NextResponse.json({ ok: false, error: "date range required" }, { status: 400 });
  const campaign = String(b.campaign || `${from.slice(0, 7)}-free-accessory`).replace(/[^a-z0-9-]/gi, "").slice(0, 60);
  const ids: string[] | null = Array.isArray(b.ids) ? b.ids.map(String) : null;
  const testTo: string | null = typeof b.test_to === "string" && /@/.test(b.test_to) ? b.test_to.trim() : null;

  const cands = await candidates(from, to);
  if (!cands) return NextResponse.json({ ok: false, error: "Shopify lookup failed" }, { status: 502 });
  const already = await rest(`winback_offers?campaign=eq.${encodeURIComponent(campaign)}&select=checkout_id`);
  if (!already.ok) return NextResponse.json({ ok: false, error: missing(await already.text()) ? "Run supabase/add_winback_offers.sql first" : "database error" }, { status: 500 });
  const done = new Set(((await already.json()) as { checkout_id: string }[]).map(x => x.checkout_id));

  let targets: Checkout[] = cands.filter(c => (ids ? ids.includes(c.id) : true) && !done.has(c.id));
  if (testTo) targets = targets.slice(0, 1).map(c => ({ ...c, email: testTo, firstName: c.firstName }));
  const results: { email: string; ok: boolean; code?: string; error?: string }[] = [];
  for (const c of targets) {
    const code = winbackCode();
    const expiresAt = new Date(Date.now() + WINBACK.days * 86400000); expiresAt.setUTCHours(13, 59, 59, 0);
    const made = await createWinbackCode(code, expiresAt, c.name || c.email);
    if (!made.ok) { results.push({ email: c.email, ok: false, error: made.error }); continue; }
    const mail = await sendWinbackEmail(c, code, expiresAt);
    if (!testTo) {
      await rest("winback_offers", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({
        brand_id: WINBACK.brandId, checkout_id: c.id, checkout_created_at: c.createdAt, customer_email: c.email, customer_name: c.name,
        cart_value: c.value, cart_summary: c.summary, campaign, code, discount_gid: made.gid, expires_at: expiresAt.toISOString(),
        email_sent: !!mail.ok, status: mail.ok ? "sent" : "failed", error: mail.ok ? null : mail.error }) });
    }
    results.push({ email: c.email, ok: !!mail.ok, code, error: mail.ok ? undefined : mail.error });
  }
  return NextResponse.json({ ok: true, campaign, results, skipped: cands.length - targets.length });
}
