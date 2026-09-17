import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { getAccess } from "@/lib/access";

// Downloadable QR PNG for one tracked UTM link — id-based (not an arbitrary
// url= param) so this can't be used as an open URL→QR proxy.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = { apikey: sbKey!, Authorization: `Bearer ${sbKey}` };

export async function GET(req: Request) {
  const acc = await getAccess();
  if (!acc.role) return NextResponse.json({ ok: false, error: "No access" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ ok: false, error: "Bad id" }, { status: 400 });

  const res = await fetch(`${sbUrl}/rest/v1/utm_links?id=eq.${id}&select=partner,final_url&limit=1`, { headers: h, cache: "no-store" });
  const item = (await res.json().catch(() => []))[0];
  if (!item) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const png = await QRCode.toBuffer(item.final_url, { type: "png", width: 640, margin: 2 });
  const safeName = String(item.partner || "utm").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || "utm";
  return new NextResponse(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Content-Disposition": `attachment; filename="${safeName}-qr.png"`, "Cache-Control": "no-store" },
  });
}
