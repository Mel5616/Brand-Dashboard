import { NextResponse } from "next/server";
import QRCode from "qrcode";

// Public — renders a PNG QR code pointing at /review/[slug] (packaging,
// market-stall signage, anywhere a printed code is easier than a link).
export const revalidate = 3600;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");
  if (!slug) return NextResponse.json({ ok: false, error: "slug required" }, { status: 400 });
  const target = `${url.origin}/review/${encodeURIComponent(slug)}`;
  const png = await QRCode.toBuffer(target, { type: "png", width: 480, margin: 2 });
  return new NextResponse(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" } });
}
