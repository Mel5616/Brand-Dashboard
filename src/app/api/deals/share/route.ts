import { NextResponse } from "next/server";
import { canManage } from "@/lib/access";
import crypto from "crypto";

// Generate (or return) the public deal-sheet share token for a show.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });

export async function POST(req: Request) {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  if (!(await canManage("show-deals"))) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  if (!b.show_id) return NextResponse.json({ ok: false }, { status: 400 });

  const cur = await fetch(`${sbUrl}/rest/v1/tradeshows?id=eq.${encodeURIComponent(b.show_id)}&select=deals_token`, { headers: H(), cache: "no-store" }).then(r => r.json());
  let token = cur?.[0]?.deals_token as string | null;
  if (!token) {
    token = crypto.randomUUID().replace(/-/g, "").slice(0, 14);
    const res = await fetch(`${sbUrl}/rest/v1/tradeshows?id=eq.${encodeURIComponent(b.show_id)}`, {
      method: "PATCH", headers: H({ Prefer: "return=minimal" }), body: JSON.stringify({ deals_token: token }),
    });
    if (!res.ok) return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true, token });
}
