import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers = () => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey!}`, "Content-Type": "application/json" });

function allowed(access: Awaited<ReturnType<typeof getAccess>>) {
  return !!access.user && (access.role === "admin" || access.allowedTabs.includes("assistants"));
}

// Conversation feed across every site assistant (?brand=zazu|frida, ?q=, ?days=, ?limit=).
export async function GET(req: Request) {
  const access = await getAccess();
  if (!allowed(access)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false, rows: [] }, { status: 500 });
  const { searchParams } = new URL(req.url);
  const brand = searchParams.get("brand");
  const q = (searchParams.get("q") || "").trim();
  const days = Math.min(Number(searchParams.get("days")) || 30, 365);
  const limit = Math.min(Number(searchParams.get("limit")) || 500, 2000);
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const parts = [`select=*`, `order=created_at.desc`, `limit=${limit}`, `created_at=gte.${since}`];
  if (brand) parts.push(`brand=eq.${encodeURIComponent(brand)}`);
  if (q) parts.push(`or=(question.ilike.*${encodeURIComponent(q)}*,answer.ilike.*${encodeURIComponent(q)}*)`);
  const res = await fetch(`${sbUrl}/rest/v1/assistant_logs?${parts.join("&")}`, { headers: headers(), cache: "no-store" });
  if (!res.ok) return NextResponse.json({ ok: false, rows: [], needsSetup: res.status === 404 || res.status === 400 }, { status: 200 });
  return NextResponse.json({ ok: true, rows: await res.json() });
}

// Admin: flag a conversation for review or leave a note (what to fix in the knowledge file).
export async function PATCH(req: Request) {
  const access = await getAccess();
  if (access.role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const id = Number(b?.id); if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const patch: Record<string, unknown> = {};
  if (typeof b.flagged === "boolean") patch.flagged = b.flagged;
  if (typeof b.note === "string") patch.note = b.note.slice(0, 1000);
  const res = await fetch(`${sbUrl}/rest/v1/assistant_logs?id=eq.${id}`, { method: "PATCH", headers: { ...headers(), Prefer: "return=minimal" }, body: JSON.stringify(patch) });
  return NextResponse.json({ ok: res.ok });
}
