import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { randomBytes } from "crypto";

// Nanit influencer tracker. GET lists rows + the share token (any signed-in
// user — the social team maintains this). POST: row.save (any signed-in),
// row.delete (admin), share.mint (admin, returns the stable token).
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const missing = (s: number, b: string) => s === 404 || /PGRST205|does not exist|schema cache/i.test(b);
const rest = (p: string, init?: RequestInit) => fetch(`${sbUrl}/rest/v1/${p}`, { ...init, headers: h((init?.headers as any) || {}), cache: "no-store" });

export async function GET() {
  const access = await getAccess();
  if (!access.role) return NextResponse.json({ ok: false, rows: [] }, { status: 401 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false, rows: [] }, { status: 500 });
  const [rRes, sRes, aRes] = await Promise.all([
    rest("nanit_influencers?select=*&order=month_key.desc,created_at.desc"),
    rest("nanit_settings?id=eq.1&select=share_token"),
    rest("influencers?select=handle,avatar_url"),
  ]);
  const text = await rRes.text();
  if (!rRes.ok) return NextResponse.json({ ok: true, needsSetup: missing(rRes.status, text), rows: [] });
  const settings = sRes.ok ? JSON.parse((await sRes.text()) || "[]") : [];
  // Avatars come from the shared influencer roster, matched by handle.
  const roster = aRes.ok ? (JSON.parse((await aRes.text()) || "[]") as any[]) : [];
  const avatarBy = new Map(roster.map(r => [String(r.handle || "").toLowerCase(), r.avatar_url]));
  const rows = (JSON.parse(text || "[]") as any[]).map(r => ({ ...r, avatar_url: avatarBy.get(String(r.handle || "").toLowerCase()) ?? null }));
  return NextResponse.json({ ok: true, rows, share_token: settings[0]?.share_token ?? null });
}

export async function POST(req: Request) {
  const access = await getAccess();
  if (!access.role) return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }

  if (b.action === "row.save") {
    const row: any = {
      month_key: String(b.month_key || "").slice(0, 7),
      name: String(b.name || "").trim().slice(0, 160),
      handle: String(b.handle || "").trim().slice(0, 120),
      email: String(b.email || "").trim().slice(0, 200),
      followers: String(b.followers || "").trim().slice(0, 40),
      platform: String(b.platform || "").trim().slice(0, 40),
      partnership_type: String(b.partnership_type || "Influencer collab (gifted)").slice(0, 120),
      product_supplied: String(b.product_supplied || "").trim().slice(0, 300),
      product_value: b.product_value !== "" && b.product_value != null ? Number(b.product_value) || null : null,
      subscription_code: String(b.subscription_code || "").trim().slice(0, 60),
      subscription_plan: String(b.subscription_plan || "").trim().slice(0, 80),
      updated_at: new Date().toISOString(),
    };
    if (!row.month_key || !row.name) return NextResponse.json({ ok: false, error: "Month and name required" }, { status: 400 });
    if (!b.id) row.created_by = access.user?.email ?? null;
    const res = b.id
      ? await rest(`nanit_influencers?id=eq.${encodeURIComponent(b.id)}`, { method: "PATCH", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(row) })
      : await rest("nanit_influencers", { method: "POST", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(row) });
    const text = await res.text();
    if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text), error: text.slice(0, 200) }, { status: 500 });
    return NextResponse.json({ ok: true, item: JSON.parse(text)[0] });
  }

  if (b.action === "row.delete") {
    if (access.role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
    if (!b.id) return NextResponse.json({ ok: false }, { status: 400 });
    const res = await rest(`nanit_influencers?id=eq.${encodeURIComponent(b.id)}`, { method: "DELETE" });
    return NextResponse.json({ ok: res.ok });
  }

  if (b.action === "share.mint") {
    if (access.role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
    const cur = await rest("nanit_settings?id=eq.1&select=share_token");
    const rows = cur.ok ? JSON.parse((await cur.text()) || "[]") : [];
    if (rows[0]?.share_token) return NextResponse.json({ ok: true, token: rows[0].share_token });
    const token = randomBytes(9).toString("base64url");
    const res = await rest("nanit_settings?on_conflict=id", { method: "POST", headers: h({ Prefer: "resolution=merge-duplicates,return=minimal" }), body: JSON.stringify({ id: 1, share_token: token }) });
    if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, await res.text()) }, { status: 500 });
    return NextResponse.json({ ok: true, token });
  }

  return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
}
