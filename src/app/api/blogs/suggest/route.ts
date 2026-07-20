import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// AI blog-topic suggestions for the Blogs tab, in the house SEO-brief style
// (question-led AU-parent titles, hero/cluster structure, keyword-first).
// Reads what's already on the Blogs board + live campaigns so suggestions are
// topical and don't duplicate existing work. Admin-only.
export const revalidate = 0;
export const maxDuration = 60;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const rest = (p: string) => fetch(`${sbUrl}/rest/v1/${p}`, { headers: { apikey: sbKey!, Authorization: `Bearer ${sbKey}` }, cache: "no-store" }).then(async r => (r.ok ? JSON.parse((await r.text()) || "[]") : []));

export async function POST() {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });

  const [blogTasks, brands, campaigns] = await Promise.all([
    rest("asana_tasks?select=name,completed&project_label=eq.Blogs&limit=200"),
    rest("brands?select=name,live"),
    rest(`campaigns?select=campaign,brand,status,key_date&status=in.(${encodeURIComponent('"Live","Build","Planned"')})&order=key_date.asc&limit=20`),
  ]);

  const userMsg = `You are the SEO content strategist for Coolkidz Australia (baby/nursery brands, Australian D2C). Suggest NEW blog topics for our Blogs board.

OUR HOUSE STYLE (follow exactly):
- Every blog is an SEO brief: question-led or how-to titles aimed at Australian parents, e.g. "Is the UPPAbaby VISTA V3 Worth It? An Honest Review for Australian Parents", "Are Nappy Bins Bad for the Environment? What Australian Parents Should Know", "How Nanit Takes the Guesswork Out of Nursery Temperature and Humidity".
- Each has a Category (Buying Guide / Comparison / Feature Education / Problem-Solving), a Customer Stage (Awareness → Consideration → Purchase), a primary keyword and 3-4 secondary keywords.
- Hero + cluster structure: a big "Hero" pillar piece with numbered "Cluster" support articles.
- Task names on the board use brand-code prefixes, e.g. "MM - When Should You Start Brushing Your Baby's Teeth? An Australian Parent's Guide", "CK/MM - Baby Teething, First Teeth & Oral Development (Hero #1)". Brand codes: UB=UPPAbaby, NAN=Nanit, FR=Frida, ST=SmarTrike, GB=Gaia Baby, WF=WonderFold, HN=Hannie, MG=Magic, MV=Mamave, MM=Matchstick Monkey, MIA=MiaMily, ZZ=Zazu, CK=Coolkidz.

ALREADY ON THE BOARD (do not duplicate these topics):
${blogTasks.map((t: any) => `- ${t.name}`).join("\n")}

LIVE BRANDS: ${brands.filter((b: any) => b.live).map((b: any) => b.name).join(", ")}

CURRENT/UPCOMING CAMPAIGNS (suggest blogs that support these where natural):
${campaigns.map((c: any) => `- ${c.campaign} (${c.brand}, launches ${c.key_date})`).join("\n")}

It is late July (winter in Australia; September school holidays and spring due-dates approaching).

Return ONLY a JSON array of 8 suggestions, spread across different brands, each object:
{"taskName": "<board-ready name with brand code prefix>", "brand": "<brand>", "title": "<full SEO title>", "primaryKeyword": "<keyword>", "category": "<category>", "stage": "<customer stage>", "angle": "<1 sentence on why this topic, tied to season/campaign/search demand>"}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 2500, messages: [{ role: "user", content: userMsg }] }),
  });
  const out = await res.json().catch(() => null);
  const text = out?.content?.map((c: any) => c.text ?? "").join("") ?? "";
  if (!res.ok || !text) return NextResponse.json({ ok: false, error: `AI: ${JSON.stringify(out?.error?.message ?? out).slice(0, 200)}` }, { status: 502 });
  let suggestions: any[] = [];
  try {
    const m = text.match(/\[[\s\S]*\]/);
    suggestions = m ? JSON.parse(m[0]) : [];
  } catch { return NextResponse.json({ ok: false, error: "Couldn't parse suggestions — try again" }, { status: 502 }); }
  return NextResponse.json({ ok: true, suggestions, blogsGid: process.env.ASANA_PROJECT_ID ?? null });
}
