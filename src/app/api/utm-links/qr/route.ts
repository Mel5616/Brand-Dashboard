import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { getAccess } from "@/lib/access";

// Downloadable QR PNG for one tracked UTM link — id-based (not an arbitrary
// url= param) so this can't be used as an open URL→QR proxy.
// Encodes the STABLE /l/<short_code> redirect (src/app/l/[code]/route.ts),
// never the destination URL itself — so editing the link later (PATCH
// /api/utm-links) changes where an already-printed QR code sends people,
// instead of the QR being a dead snapshot of the URL at print time.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = { apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json" };
const BASE = "https://marketing.coolkidz.com.au";

async function newShortCode(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = Math.random().toString(36).slice(2, 10);
    const res = await fetch(`${sbUrl}/rest/v1/utm_links?short_code=eq.${code}&select=id`, { headers: h });
    const rows = await res.json().catch(() => []);
    if (!rows?.length) return code;
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export async function GET(req: Request) {
  const acc = await getAccess();
  if (!acc.role) return NextResponse.json({ ok: false, error: "No access" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ ok: false, error: "Bad id" }, { status: 400 });

  const res = await fetch(`${sbUrl}/rest/v1/utm_links?id=eq.${id}&select=partner,final_url,short_code&limit=1`, { headers: h, cache: "no-store" });
  const item = (await res.json().catch(() => []))[0];
  if (!item) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  // Backfill: a link created before short_code existed. Mint one now so the
  // QR being downloaded today is dynamic even if the row is old.
  let shortCode = item.short_code;
  if (!shortCode) {
    shortCode = await newShortCode();
    await fetch(`${sbUrl}/rest/v1/utm_links?id=eq.${id}`, { method: "PATCH", headers: { ...h, Prefer: "return=minimal" }, body: JSON.stringify({ short_code: shortCode }) }).catch(() => {});
  }

  const png = await QRCode.toBuffer(`${BASE}/l/${shortCode}`, { type: "png", width: 640, margin: 2 });
  const safeName = String(item.partner || "utm").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || "utm";
  return new NextResponse(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Content-Disposition": `attachment; filename="${safeName}-qr.png"`, "Cache-Control": "no-store" },
  });
}
