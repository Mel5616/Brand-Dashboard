import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { logActivity } from "@/lib/activity";

const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
function headers() {
  return { apikey: sbKey!, Authorization: `Bearer ${sbKey!}`, "Content-Type": "application/json" };
}

// Client-reported events: logins, logouts, and page/tab views.
export async function POST(req: Request) {
  const access = await getAccess();
  if (!access.user) return NextResponse.json({ ok: false }, { status: 401 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const allowed = ["login", "logout", "view"];
  const action = allowed.includes(b?.action) ? b.action : "view";
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;
  await logActivity({
    userId: access.user.id, email: access.user.email, action,
    target: b?.target ? String(b.target).slice(0, 120) : null,
    detail: b?.detail && typeof b.detail === "object" ? b.detail : null,
    path: b?.path ? String(b.path).slice(0, 300) : null, method: "GET", ip,
  });
  return NextResponse.json({ ok: true });
}

// Admin-only activity feed with optional filters (?user=, ?action=, ?limit=).
export async function GET(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false, rows: [] }, { status: 500 });
  const { searchParams } = new URL(req.url);
  const user = searchParams.get("user");
  const action = searchParams.get("action");
  const limit = Math.min(Number(searchParams.get("limit")) || 500, 2000);
  const parts = [`select=*`, `order=created_at.desc`, `limit=${limit}`];
  if (user) parts.push(`user_email=eq.${encodeURIComponent(user)}`);
  if (action) parts.push(`action=eq.${encodeURIComponent(action)}`);
  const res = await fetch(`${sbUrl}/rest/v1/activity_log?${parts.join("&")}`, { headers: headers(), cache: "no-store" });
  if (!res.ok) return NextResponse.json({ ok: false, rows: [], needsSetup: res.status === 404 || res.status === 400 }, { status: 200 });
  return NextResponse.json({ ok: true, rows: await res.json() });
}
