import { NextResponse } from "next/server";

// Public, no-login entry for the Kona Challenge in-store competition. The
// store comes from the QR code's own URL (?store=<slug>), not a field the
// entrant fills in, so attribution is real rather than self-reported.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const missing = (s: number, b: string) => s === 404 || /PGRST205|does not exist|schema cache/i.test(b);
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const STORES = [
  { slug: "baby-village", name: "Baby Village" },
  { slug: "baby-kingdom", name: "Baby Kingdom" },
  { slug: "babyroad", name: "BabyRoad" },
  { slug: "whole-bubs", name: "Whole Bubs" },
  { slug: "coolkidz-hq", name: "Coolkidz Head Office" },
];

export async function POST(req: Request) {
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 }); }

  const store = STORES.find(s => s.slug === String(b.store || "").trim())?.slug;
  const name = String(b.name || "").trim().slice(0, 120);
  const email = String(b.email || "").trim().toLowerCase().slice(0, 200);
  const mobile = b.mobile ? String(b.mobile).trim().slice(0, 30) : null;
  const instagramHandle = b.instagram_handle ? String(b.instagram_handle).trim().replace(/^@/, "").slice(0, 60) : null;
  const foldTime = b.fold_time_seconds !== "" && b.fold_time_seconds != null ? Number(b.fold_time_seconds) : null;

  if (!store) return NextResponse.json({ ok: false, error: "Missing or unrecognised store" }, { status: 400 });
  if (!name) return NextResponse.json({ ok: false, error: "Your name is required" }, { status: 400 });
  if (!emailRe.test(email)) return NextResponse.json({ ok: false, error: "A valid email is required" }, { status: 400 });

  const row = { store, name, mobile, email, instagram_handle: instagramHandle, fold_time_seconds: foldTime };
  const res = await fetch(`${sbUrl}/rest/v1/kona_challenge_entries`, { method: "POST", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(row) });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text), error: text.slice(0, 200) }, { status: 500 });
  return NextResponse.json({ ok: true, item: JSON.parse(text)[0] });
}
