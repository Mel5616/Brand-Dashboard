import { NextResponse } from "next/server";
import { rest, missingTable } from "@/lib/registry";
import { buildToday, renderTodayEmail, sendTodayEmail, digestRecipients, todayKey } from "@/lib/today";

// Hourly alerts: only URGENT items, each emailed once (today_alerts_sent
// remembers the key). Called by .github/workflows/today_alerts.yml.
export const revalidate = 0;

export async function POST(req: Request) {
  if (req.headers.get("x-today-key") !== todayKey()) return NextResponse.json({ ok: false }, { status: 401 });
  const t = await buildToday();
  const urgent = t.items.filter(i => i.severity === "urgent");
  if (!urgent.length) return NextResponse.json({ ok: true, sent: 0 });
  const seen = await rest(`today_alerts_sent?select=key&key=in.(${urgent.map(i => `"${encodeURIComponent(i.key)}"`).join(",")})`);
  if (!seen.ok) { const text = await seen.text(); return NextResponse.json({ ok: false, needsSetup: missingTable(text), error: text.slice(0, 200) }, { status: 500 }); }
  const sent = new Set(((await seen.json()) as { key: string }[]).map(r => r.key));
  const fresh = urgent.filter(i => !sent.has(i.key));
  if (!fresh.length) return NextResponse.json({ ok: true, sent: 0 });
  const html = renderTodayEmail(fresh, { heading: fresh.length === 1 ? fresh[0].title : `${fresh.length} urgent items`, intro: "New since the last check. The full queue is on the Today tab." });
  const r = await sendTodayEmail(digestRecipients(), `Alert: ${fresh.length === 1 ? `${fresh[0].brand ? fresh[0].brand + " · " : ""}${fresh[0].title}` : `${fresh.length} urgent items`}`, html);
  if (r.ok) await rest("today_alerts_sent?on_conflict=key", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(fresh.map(i => ({ key: i.key, sent_at: new Date().toISOString() }))) });
  return NextResponse.json({ ok: r.ok, error: r.ok ? undefined : r.error, sent: r.ok ? fresh.length : 0 });
}
