import { NextResponse } from "next/server";

// Phase 2 — AI drafting for the content planner. Generates channel-aware,
// on-brand copy with Claude (same ANTHROPIC_API_KEY as the weekly brief).
// On-demand from the content edit modal; the result is saved to content_items.draft.

export const revalidate = 0;
const MODEL = "claude-sonnet-4-6";

// Channel-specific shape so the output is ready to paste, not generic prose.
const CHANNEL_BRIEF: Record<string, string> = {
  Instagram: "an Instagram caption: a scroll-stopping first line, 2–4 short punchy lines, one clear CTA, then 6–10 relevant hashtags on their own line.",
  Facebook:  "a Facebook post: a friendly hook, 2–3 short sentences of value, and a clear CTA with a link placeholder [link].",
  TikTok:    "a TikTok video script: a 1-line hook, 3–5 quick beats/shots with on-screen text suggestions, and a spoken CTA. Keep it 15–30 seconds.",
  Email:     "a marketing email: a short subject line (prefix it with 'Subject: '), a preview line, then a concise body (2–3 short paragraphs) and a CTA button label.",
  Blog:      "a blog post starter: an SEO-friendly title, a 1-line meta description, and a 2–3 paragraph engaging intro.",
  Website:   "concise website/landing copy: a headline, a supporting subhead, 3 short benefit bullets, and a CTA.",
  Other:     "short, on-brand marketing copy with a clear hook and CTA.",
};

export async function POST(req: Request) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ ok: false, error: "no_api_key" }, { status: 500 });

  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const brand = (b.brand_name || "the brand").toString();
  const channel = (b.channel || "Instagram").toString();
  const title = (b.title || "").toString();
  const notes = (b.notes || "").toString();
  const shape = CHANNEL_BRIEF[channel] || CHANNEL_BRIEF.Other;

  const prompt = `You are a senior social & marketing copywriter for ${brand}, a baby & parenting brand sold in Australia by Coolkidz. Write in Australian English, warm and parent-friendly, never gimmicky or over-claiming.

Write ${shape}

Topic / working title: "${title}"${notes ? `\nExtra context from the planner: ${notes}` : ""}

Return only the finished copy — no preamble, no explanation, no markdown headers.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 700, messages: [{ role: "user", content: prompt }] }),
      cache: "no-store",
    });
    const json = await res.json();
    if (!res.ok) return NextResponse.json({ ok: false, error: json?.error?.message || "api_error" }, { status: 502 });
    const draft = (json?.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n").trim();
    return NextResponse.json({ ok: true, draft });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 502 });
  }
}
