import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Read an invoice (PDF or image) with Claude and return { amount, supplier, date }.
// Used to pre-fill the expense form — the user still confirms before saving.
export const revalidate = 0;

export async function POST(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ error: "AI not configured" }, { status: 500 });

  let file: File | null = null;
  try { file = (await req.formData()).get("file") as File | null; } catch { /* ignore */ }
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: "File too large (max 15MB)" }, { status: 400 });

  const b64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const mime = file.type || "application/pdf";
  const source = mime.includes("pdf")
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }
    : { type: "image", source: { type: "base64", media_type: mime, data: b64 } };

  try {
    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6", max_tokens: 300,
        system: "You read supplier invoices. Return ONLY a JSON object: {\"amount\": number (the invoice grand total, GST-inclusive, no currency symbol), \"supplier\": string, \"date\": \"YYYY-MM-DD\"}. If a field is unclear use null.",
        messages: [{ role: "user", content: [source, { type: "text", text: "Extract the total amount, supplier and invoice date. Return only the JSON." }] }],
      }),
    });
    const j = await aiRes.json();
    if (!aiRes.ok) return NextResponse.json({ error: j?.error?.message || "AI request failed" }, { status: 502 });
    const text = (j.content?.[0]?.text || "").trim().replace(/^```json\s*|\s*```$/g, "");
    const parsed = JSON.parse(text);
    return NextResponse.json({ ok: true, amount: parsed.amount ?? null, supplier: parsed.supplier ?? null, date: parsed.date ?? null });
  } catch {
    return NextResponse.json({ error: "Couldn't read that invoice — enter the figures manually." }, { status: 502 });
  }
}
