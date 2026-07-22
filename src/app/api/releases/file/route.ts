import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Admin-only: short-lived signed URL for a file in the PRIVATE media-releases bucket.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function GET(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  const path = new URL(req.url).searchParams.get("path") || "";
  if (!path || path.includes("..")) return NextResponse.json({ ok: false }, { status: 400 });
  const res = await fetch(`${sbUrl}/storage/v1/object/sign/media-releases/${path}`, {
    method: "POST",
    headers: { apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: 600 }),
  });
  const d = await res.json().catch(() => null);
  if (!res.ok || !d?.signedURL) return NextResponse.json({ ok: false, error: "Couldn't sign URL" }, { status: 500 });
  return NextResponse.json({ ok: true, url: `${sbUrl}/storage/v1${d.signedURL}` });
}
