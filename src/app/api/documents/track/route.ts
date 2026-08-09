import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// PUBLIC: view tracking for shared documents. "open" creates a view row for
// this browser session; "beat" accumulates viewing time (sent every 10s while
// the document is actually visible). Logged-in dashboard users are identified
// by email; external viewers are anonymous per-link.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });

export async function POST(req: Request) {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const token = String(b.token || "");
  const session = String(b.session || "").slice(0, 64);
  if (!/^[0-9a-f-]{36}$/.test(token) || !session) return NextResponse.json({ ok: false }, { status: 400 });

  const sRes = await fetch(`${sbUrl}/rest/v1/document_shares?token=eq.${token}&select=id&limit=1`, { headers: h(), cache: "no-store" });
  const share = (await sRes.json().catch(() => []))[0];
  if (!share) return NextResponse.json({ ok: false }, { status: 404 });

  if (b.kind === "open") {
    let viewer: string | null = null;
    try { viewer = (await getAccess()).user?.email ?? null; } catch { /* anonymous */ }
    // External viewers identify themselves via the document's email gate
    if (!viewer && typeof b.email === "string") {
      const em = b.email.trim().toLowerCase().slice(0, 120);
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) viewer = em;
    }
    await fetch(`${sbUrl}/rest/v1/document_views?on_conflict=share_id,session_id`, {
      method: "POST", headers: h({ Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify({ share_id: share.id, session_id: session, viewer }),
    });
    return NextResponse.json({ ok: true });
  }
  // heartbeat: +10s capped per beat to keep the numbers honest
  const add = Math.min(15, Math.max(1, Number(b.seconds) || 10));
  const cur = await fetch(`${sbUrl}/rest/v1/document_views?share_id=eq.${share.id}&session_id=eq.${encodeURIComponent(session)}&select=id,seconds&limit=1`, { headers: h(), cache: "no-store" }).then(r => r.json()).catch(() => []);
  if (cur[0]) {
    await fetch(`${sbUrl}/rest/v1/document_views?id=eq.${cur[0].id}`, {
      method: "PATCH", headers: h({ Prefer: "return=minimal" }),
      body: JSON.stringify({ seconds: (cur[0].seconds || 0) + add, last_seen: new Date().toISOString() }),
    });
  }
  return NextResponse.json({ ok: true });
}
