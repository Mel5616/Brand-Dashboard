import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { buildToday, renderTodayEmail, sendTodayEmail, digestRecipients, todayKey } from "@/lib/today";

// Morning digest: the Today queue as an email, 7am AEST from
// .github/workflows/today_digest.yml (POST with x-today-key). GET ?preview=1
// shows the same HTML to a signed-in admin.
export const revalidate = 0;
const heading = () => `Today · ${new Date().toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: "Australia/Melbourne" })}`;

export async function GET(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false }, { status: 403 });
  const t = await buildToday();
  const html = renderTodayEmail(t.items, { heading: heading(), intro: `${t.items.length} item${t.items.length === 1 ? "" : "s"} across reviews, email, content, websites and jobs.`, jobs: t.jobs });
  if (new URL(req.url).searchParams.get("preview")) return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  return NextResponse.json({ ok: true, count: t.items.length, to: digestRecipients() });
}

export async function POST(req: Request) {
  if (req.headers.get("x-today-key") !== todayKey()) return NextResponse.json({ ok: false }, { status: 401 });
  const t = await buildToday();
  const urgent = t.items.filter(i => i.severity === "urgent").length, attention = t.items.filter(i => i.severity === "attention").length;
  const html = renderTodayEmail(t.items, { heading: heading(), intro: t.items.length ? `${urgent} urgent, ${attention} need you, ${t.items.length - urgent - attention} for info.` : "Nothing is waiting on you this morning.", jobs: t.jobs });
  const subject = t.items.length ? `Today: ${urgent ? `${urgent} urgent · ` : ""}${t.items.length} thing${t.items.length === 1 ? "" : "s"} to look at` : "Today: all clear";
  const sent = await sendTodayEmail(digestRecipients(), subject, html);
  return NextResponse.json({ ok: sent.ok, error: sent.ok ? undefined : sent.error, count: t.items.length, to: digestRecipients() });
}
