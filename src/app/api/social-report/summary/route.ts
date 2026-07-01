import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// AI executive summary for the Social Media Report. Takes the already-computed
// metrics (no raw data) and returns a short, plain-English brief for the top of
// the report. Same ANTHROPIC_API_KEY as the rest of the dashboard.
export const revalidate = 0;
const MODEL = "claude-sonnet-4-6";

export async function POST(req: Request) {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false, error: "unauthorised" }, { status: 401 });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ ok: false, error: "no_api_key" }, { status: 500 });

  let m: any; try { m = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }

  const prompt = `You are a senior social media strategist for Coolkidz Australia, which runs the Instagram accounts for a portfolio of baby & parenting brands. Write a concise executive summary for the top of a management report. Australian English. No em dashes. Be specific and use the numbers. Do not invent data beyond what is given.

Period: ${m.period}
Portfolio metrics (JSON):
${JSON.stringify(m, null, 2)}

Write:
1) One short paragraph (2-3 sentences) summarising overall performance for the period.
2) A line starting "Highlights:" then 2-3 short bullet points (use "- ") calling out the best-performing brands, team member, format or day, with numbers.
3) A line starting "Focus next:" then 1-2 short bullet points with concrete, actionable recommendations.

Keep the whole thing under 160 words. Return plain text only, no headings other than the "Highlights:" and "Focus next:" labels.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 500, messages: [{ role: "user", content: prompt }] }),
      cache: "no-store",
    });
    const json = await res.json();
    if (!res.ok) return NextResponse.json({ ok: false, error: json?.error?.message || "api_error" }, { status: 502 });
    const summary = (json?.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n").trim();
    return NextResponse.json({ ok: true, summary });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 502 });
  }
}
