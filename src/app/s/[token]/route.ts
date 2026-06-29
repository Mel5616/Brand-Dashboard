import { NextResponse } from "next/server";

// Public, open-tracked snapshot. Serves the stored HTML and logs each open.
// (Reachable without a session — "/s" is allowlisted in the auth proxy.)
export const revalidate = 0;

const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hdr = { apikey: sbKey || "", Authorization: `Bearer ${sbKey || ""}`, "Content-Type": "application/json" };

const notFound = () => new NextResponse("<!doctype html><meta charset=utf-8><title>Not found</title><body style='font-family:sans-serif;padding:3rem;text-align:center;color:#475569'>This report link is no longer available.</body>", { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!sbUrl || !sbKey || !token) return notFound();

  const res = await fetch(`${sbUrl}/rest/v1/snapshot_shares?token=eq.${encodeURIComponent(token)}&select=id,html,open_count,first_opened_at`, { headers: hdr, cache: "no-store" });
  if (!res.ok) return notFound();
  const rows = await res.json();
  const row = rows?.[0];
  if (!row) return notFound();

  // Log the open (best-effort; never blocks serving the report).
  try {
    const now = new Date().toISOString();
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;
    const ua = (req.headers.get("user-agent") || "").slice(0, 300);
    await fetch(`${sbUrl}/rest/v1/snapshot_shares?id=eq.${row.id}`, {
      method: "PATCH", headers: { ...hdr, Prefer: "return=minimal" },
      body: JSON.stringify({
        open_count: (row.open_count || 0) + 1,
        first_opened_at: row.first_opened_at || now,
        last_opened_at: now, last_ip: ip, last_ua: ua,
      }),
    });
  } catch { /* ignore */ }

  return new NextResponse(row.html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
