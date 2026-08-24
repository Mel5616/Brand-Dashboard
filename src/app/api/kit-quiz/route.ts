import { NextResponse } from "next/server";

// Public quiz submission for a Retailer Kit's training module. No session
// required — access is gated by knowing the kit's share_token, same as
// every other public share link in this app. Grading happens here so the
// public page never receives which option is correct.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hdr = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });

export async function POST(req: Request) {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const token = String(b.token || "");
  const name = String(b.respondent_name || "").trim();
  const answers: { question_id: string; selected: number }[] = Array.isArray(b.answers) ? b.answers : [];
  if (!token || !name || !answers.length) return NextResponse.json({ ok: false, error: "Name and answers required" }, { status: 400 });

  const kitRes = await fetch(`${sbUrl}/rest/v1/retailer_kits?share_token=eq.${encodeURIComponent(token)}&status=eq.published&select=id`, { headers: hdr(), cache: "no-store" });
  const kit = (await kitRes.json())?.[0];
  if (!kit) return NextResponse.json({ ok: false, error: "Kit not found" }, { status: 404 });

  const qRes = await fetch(`${sbUrl}/rest/v1/retailer_kit_quiz_questions?kit_id=eq.${kit.id}&select=id,options`, { headers: hdr(), cache: "no-store" });
  const questions: { id: string; options: { text: string; correct?: boolean }[] }[] = await qRes.json();
  const byId: Record<string, typeof questions[number]> = {};
  for (const q of questions) byId[q.id] = q;

  let score = 0;
  for (const a of answers) {
    const q = byId[a.question_id];
    if (q && q.options[a.selected]?.correct) score++;
  }
  const total = questions.length;

  const row = {
    kit_id: kit.id, respondent_name: name,
    respondent_email: b.respondent_email || null, respondent_company: b.respondent_company || null,
    score, total,
  };
  await fetch(`${sbUrl}/rest/v1/retailer_kit_quiz_attempts`, { method: "POST", headers: hdr({ Prefer: "return=minimal" }), body: JSON.stringify(row) }).catch(() => {});

  return NextResponse.json({ ok: true, score, total });
}
