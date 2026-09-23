import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { rest, missingTable } from "@/lib/registry";
import { buildToday } from "@/lib/today";

// Today queue (GET) and dismiss (POST {key, days}). Dismissals are shared —
// once anyone clears an item it's cleared for the team until it changes.
export const revalidate = 0;

export async function GET() {
  const acc = await getAccess();
  if (!acc.role) return NextResponse.json({ ok: false }, { status: 401 });
  const t = await buildToday();
  const probe = await rest("today_dismissals?select=key&limit=1");
  const needsSetup = !probe.ok && missingTable(await probe.text());
  return NextResponse.json({ ok: true, ...t, needsSetup });
}

export async function POST(req: Request) {
  const acc = await getAccess();
  if (!acc.role) return NextResponse.json({ ok: false }, { status: 401 });
  const { key, days = 7 } = await req.json().catch(() => ({}));
  if (!key) return NextResponse.json({ ok: false, error: "key required" }, { status: 400 });
  const until = new Date(Date.now() + Math.min(90, Math.max(1, Number(days))) * 864e5).toISOString();
  const res = await rest("today_dismissals?on_conflict=key", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ key, until, dismissed_by: acc.user?.email ?? null, dismissed_at: new Date().toISOString() }) });
  if (!res.ok) { const text = await res.text(); return NextResponse.json({ ok: false, needsSetup: missingTable(text), error: text.slice(0, 200) }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}
