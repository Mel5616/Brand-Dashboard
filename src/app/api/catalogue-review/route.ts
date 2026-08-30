import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { catalogueKeyOk } from "@/lib/catalogueKey";
import { sendMail } from "@/lib/agreementMail";

// Team-submitted catalogue/spec-sheet PDFs (via the public /catalogue-check
// form) get an automatic Claude first-pass for spelling and brand-name
// consistency before Mel does her own review. POST stores the file, runs
// the AI pass synchronously, and emails Mel once findings are ready. GET
// (admin-only) lists everything for the Team-tab review panel.
export const revalidate = 0;
export const maxDuration = 60;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const rest = (p: string, init?: RequestInit) => fetch(`${sbUrl}/rest/v1/${p}`, { ...init, headers: h((init?.headers as Record<string, string>) || {}), cache: "no-store" });
const BUCKET = "catalogue-reviews";
const APPROVER = "mel@coolkidz.com.au";

// Correct spellings — Claude is told to flag any near-miss against this list
// (e.g. "Uppababy", "Smartrike", "Wonderfold") as a brand-consistency issue.
const BRAND_NAMES = ["UPPAbaby", "Nanit", "Frida", "WonderFold", "SmarTrike", "Gaia Baby", "Hannie", "Magic", "Mamave", "Matchstick Monkey", "ZAZU", "MiaMily", "Coolkidz Australia"];

export async function GET() {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  const res = await rest("catalogue_reviews?select=*&order=created_at.desc&limit=100");
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: true, needsSetup: /PGRST205|does not exist/i.test(text), reviews: [] });
  return NextResponse.json({ ok: true, reviews: JSON.parse(text || "[]") });
}

export async function POST(req: Request) {
  if (!(await catalogueKeyOk(req))) return NextResponse.json({ ok: false, error: "No access" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return NextResponse.json({ ok: false, error: "AI not configured" }, { status: 500 });

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ ok: false, error: "No file" }, { status: 400 });
  if (file.size > 20 * 1024 * 1024) return NextResponse.json({ ok: false, error: "File over 20MB" }, { status: 400 });
  if (!file.type.includes("pdf")) return NextResponse.json({ ok: false, error: "PDF only" }, { status: 400 });

  const brand = String(form.get("brand") || "").slice(0, 60) || null;
  const uploadedBy = String(form.get("uploaded_by") || "").slice(0, 120) || null;
  const notes = String(form.get("notes") || "").slice(0, 500) || null;

  const sb = await createClient();
  await sb.storage.createBucket(BUCKET, { public: true }).catch(() => {});
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 100);
  const path = `${Date.now()}-${safeName}`;
  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, file, { contentType: "application/pdf", upsert: false });
  if (upErr) return NextResponse.json({ ok: false, error: upErr.message.slice(0, 150) }, { status: 500 });
  const pdfUrl = `${sbUrl}/storage/v1/object/public/${BUCKET}/${path}`;

  const row = { brand, file_name: file.name.slice(0, 200), pdf_url: pdfUrl, uploaded_by: uploadedBy, notes, status: "processing" };
  const ins = await rest("catalogue_reviews", { method: "POST", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(row) });
  const insText = await ins.text();
  if (!ins.ok) return NextResponse.json({ ok: false, error: /PGRST205|does not exist/i.test(insText) ? "Run add_catalogue_reviews.sql first" : "Saved the file but failed to record it" }, { status: 500 });
  const reviewId = JSON.parse(insText)[0].id;

  try {
    const b64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6", max_tokens: 4000,
        system: `You proofread marketing catalogues/spec sheets for a baby-products distributor. Check for two things only: (1) spelling mistakes and (2) brand-name inconsistencies against this exact list of correct spellings: ${BRAND_NAMES.join(", ")} — flag any near-miss (e.g. "Uppababy", "Smartrike", "Wonderfold", "Zazu" when it should be "ZAZU"). Do NOT flag style choices, grammar, or anything that isn't a clear spelling/brand-name error. Return ONLY a JSON object: {"summary": "one sentence", "findings": [{"page": number|null, "quote": "the exact text with the error", "issue": "what's wrong", "suggestion": "the fix"}]}. If nothing is wrong, return {"summary": "No spelling or brand-name issues found.", "findings": []}.`,
        messages: [{
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } },
            { type: "text", text: "Proofread this document for spelling and brand-name errors only. Return only the JSON." },
          ],
        }],
      }),
    });
    const aiJson = await aiRes.json();
    if (!aiRes.ok) throw new Error(aiJson?.error?.message || "AI request failed");
    const text = (aiJson.content?.[0]?.text || "").trim().replace(/^```json\s*|\s*```$/g, "");
    const parsed = JSON.parse(text);
    const findings = Array.isArray(parsed.findings) ? parsed.findings : [];
    const status = findings.length > 0 ? "pending_review" : "no_issues";
    await rest(`catalogue_reviews?id=eq.${reviewId}`, {
      method: "PATCH", headers: h({ Prefer: "return=minimal" }),
      body: JSON.stringify({ status, ai_summary: parsed.summary || null, ai_findings: findings }),
    });

    const mail = await sendMail({
      to: [APPROVER],
      subject: findings.length > 0 ? `${findings.length} issue${findings.length === 1 ? "" : "s"} found — ${file.name}` : `No issues found — ${file.name}`,
      html: `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:560px;margin:0 auto;color:#334155">
        <h2 style="margin:0 0 8px">${file.name}</h2>
        <p style="color:#64748b;margin:0 0 4px">${brand ? `${brand} · ` : ""}${uploadedBy ? `uploaded by ${uploadedBy}` : "uploaded by your team"}</p>
        <p style="margin:16px 0">${parsed.summary || (findings.length > 0 ? `${findings.length} possible issue(s) found.` : "No issues found.")}</p>
        ${findings.length > 0 ? `<ul style="padding-left:18px;color:#334155">${findings.map((f: { page?: number | null; quote: string; issue: string; suggestion: string }) =>
          `<li style="margin-bottom:8px"><strong>${f.quote}</strong>${f.page ? ` (page ${f.page})` : ""} — ${f.issue}. Suggested: <em>${f.suggestion}</em></li>`
        ).join("")}</ul>` : ""}
        <p style="margin:20px 0"><a href="${pdfUrl}" style="color:#0891b2">Open the PDF</a></p>
        <p style="color:#94a3b8;font-size:11px;margin-top:20px">Sent automatically by the brand dashboard's catalogue proofreader.</p>
      </div>`,
    });
    return NextResponse.json({ ok: true, id: reviewId, findings, mailSent: mail.ok });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "AI review failed";
    await rest(`catalogue_reviews?id=eq.${reviewId}`, { method: "PATCH", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify({ status: "error", error: message.slice(0, 300) }) });
    return NextResponse.json({ ok: true, id: reviewId, error: message, findings: [] });
  }
}

export async function PATCH(req: Request) {
  const acc = await getAccess();
  if (acc.role !== "admin") return NextResponse.json({ ok: false }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let b: { id?: string }; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  if (!b.id) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
  await rest(`catalogue_reviews?id=eq.${encodeURIComponent(b.id)}`, {
    method: "PATCH", headers: h({ Prefer: "return=minimal" }),
    body: JSON.stringify({ status: "reviewed", reviewed_at: new Date().toISOString(), reviewed_by: acc.user?.email ?? null }),
  });
  return NextResponse.json({ ok: true });
}
