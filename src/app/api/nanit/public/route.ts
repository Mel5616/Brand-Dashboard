import { NextResponse } from "next/server";

// Nanit-facing endpoint for the token-protected code page. The ONLY thing it can
// do is set subscription_code / subscription_plan on an existing row, and only
// with the valid share token. No reads, no other fields, no deletes.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });

export async function POST(req: Request) {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  if (!b.token || !b.id) return NextResponse.json({ ok: false }, { status: 400 });

  const sRes = await fetch(`${sbUrl}/rest/v1/nanit_settings?id=eq.1&select=share_token`, { headers: h(), cache: "no-store" });
  const settings = sRes.ok ? JSON.parse((await sRes.text()) || "[]") : [];
  if (!settings[0]?.share_token || settings[0].share_token !== String(b.token)) {
    return NextResponse.json({ ok: false, error: "Invalid link" }, { status: 403 });
  }

  const patch: any = { updated_at: new Date().toISOString() };
  if (b.subscription_code !== undefined) { patch.subscription_code = String(b.subscription_code).trim().slice(0, 60); patch.code_added_at = new Date().toISOString(); }
  if (b.subscription_plan !== undefined) patch.subscription_plan = String(b.subscription_plan).trim().slice(0, 80);
  const res = await fetch(`${sbUrl}/rest/v1/nanit_influencers?id=eq.${encodeURIComponent(String(b.id))}`, {
    method: "PATCH", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify(patch),
  });
  return NextResponse.json({ ok: res.ok });
}
