import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Email a brand's Monthly Snapshot. Admin-only. Sends via Resend (https://resend.com).
// Requires RESEND_API_KEY; the From address must be on a domain verified in Resend
// (set SNAPSHOT_FROM_EMAIL, e.g. "Coolkidz Reports <reports@coolkidz.com.au>").

export const revalidate = 0;

const KEY = process.env.RESEND_API_KEY;
const FROM = process.env.SNAPSHOT_FROM_EMAIL || "Coolkidz Reports <reports@coolkidz.com.au>";
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export async function POST(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, message: "Admins only" }, { status: 403 });
  if (!KEY) return NextResponse.json({ ok: false, needsSetup: true, message: "Email not configured. Add RESEND_API_KEY in Vercel and verify your sending domain in Resend." }, { status: 200 });

  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const { to, subject, html, fileName } = b;
  if (!to || !isEmail(String(to))) return NextResponse.json({ ok: false, message: "A valid recipient email is required" }, { status: 400 });
  if (!html) return NextResponse.json({ ok: false, message: "Nothing to send" }, { status: 400 });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM,
      to: [to],
      subject: subject || "Performance Snapshot",
      html,
      // Attach the same report as a self-contained .html file for full-fidelity viewing.
      attachments: fileName ? [{ filename: fileName, content: Buffer.from(String(html)).toString("base64") }] : undefined,
    }),
  });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, message: text.slice(0, 300) }, { status: 500 });
  return NextResponse.json({ ok: true });
}
