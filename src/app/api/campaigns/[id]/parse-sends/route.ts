import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Reads a campaign's edmBrief (and deliverables, as a secondary source) and
// returns the actual EDM send plan as structured {date, topic} entries.
//
// "Generate campaign kit" first tries a cheap regex over deliverables for the
// "Thu 1 Oct: topic" format (CampaignCalendar.tsx, parseDeliverableSends) —
// free and instant when a brief is written that way. But a rewritten brief
// (e.g. deliverables turned into a checklist instead of dated sends) leaves
// nothing for that regex to find, and the kit fell back to a blind +7/+14 day
// guess that ignored the real cadence spelled out in edmBrief (a conditional
// "within 48 hours" send, a trigger-based "no fixed date" send). This route
// is the smarter fallback: it asks Claude to read edmBrief the way a person
// would, and only returns a date when the brief actually states or implies a
// calendar date — a send that's conditional or trigger-based (sells out,
// stock arrives) comes back with date: null, which the kit then creates as
// an undated standby draft instead of inventing a date for it.
export const revalidate = 0;
export const maxDuration = 60;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });

async function callClaude(system: string, user: string, maxTokens: number) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
  });
  const out = await res.json().catch(() => null);
  const text = out?.content?.map((c: any) => c.text ?? "").join("") ?? "";
  if (!res.ok || !text) throw new Error(`AI: ${JSON.stringify(out?.error?.message ?? out).slice(0, 300)}`);
  return text;
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  const { id } = await params;

  const res = await fetch(`${sbUrl}/rest/v1/campaigns?id=eq.${id}&select=key_date,end_date,brief`, { headers: h(), cache: "no-store" });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, error: "Couldn't load the campaign" }, { status: 500 });
  const item = JSON.parse(text)[0];
  if (!item) return NextResponse.json({ ok: false, error: "Campaign not found" }, { status: 404 });

  const edmBrief = String(item.brief?.edmBrief || "").trim();
  const deliverables = String(item.brief?.deliverables || "").trim();
  if (!edmBrief) return NextResponse.json({ ok: true, sends: [] });

  const system = `You read an EDM requirements brief and extract the real send plan as JSON — nothing else, no markdown fences, no commentary.

Return a JSON array, one object per distinct email send, in send order:
[{"date": "YYYY-MM-DD" or null, "topic": "short label for this send"}]

Rules:
- Only include entries the brief actually calls a distinct email/send — not general EDM strategy notes.
- "date": a real calendar date ONLY when the brief states or clearly implies one (an explicit date, or "X days/hours after" a date given elsewhere in the brief). Compute it from the campaign's key date (${item.key_date || "unknown"}) and end date (${item.end_date || "unknown"}) when the brief says something relative like "within 48 hours of launch".
- "date": null when the send is conditional or trigger-based with no fixed calendar date — e.g. "once sold out", "if stock remains", "on restock". Do not invent a date for these.
- "topic": short and concrete, e.g. the send's stated subject/theme or its job ("Pre-orders open", "A few left", "Sold out").
- If the brief describes no distinct sends at all, return [].`;

  const user = `edmBrief:\n${edmBrief}\n\n${deliverables ? `deliverables (secondary context, may repeat or omit sends already in edmBrief):\n${deliverables}\n\n` : ""}Extract the send plan now, as the JSON array only.`;

  let sends: { date: string | null; topic: string }[] = [];
  try {
    const raw = await callClaude(system, user, 1000);
    const match = raw.match(/\[[\s\S]*\]/);
    const parsed = JSON.parse(match ? match[0] : raw);
    if (Array.isArray(parsed)) {
      sends = parsed
        .filter((s: any) => s && typeof s.topic === "string")
        .map((s: any) => ({ date: /^\d{4}-\d{2}-\d{2}$/.test(s.date) ? s.date : null, topic: String(s.topic).slice(0, 200) }));
    }
  } catch {
    return NextResponse.json({ ok: true, sends: [] }); // fall back silently — the kit tries its own guess next
  }
  return NextResponse.json({ ok: true, sends });
}
