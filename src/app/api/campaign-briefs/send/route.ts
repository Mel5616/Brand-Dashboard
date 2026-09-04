import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { sendMail, shell } from "@/lib/agreementMail";

// Emails a campaign brief to selected influencers, one send per recipient
// (never a shared "to" list), from partnerships@coolkidz.com.au. Attaches
// the PDF if one was uploaded, otherwise the HTML brief as a file — this is
// a relationship email to external creators, not a Klaviyo marketing send,
// so it reuses the same Resend path as the agreement-signing emails.
export const revalidate = 0;
const fmtD = (s: string | null) => s ? new Date(s).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }) : null;

export async function POST(req: Request) {
  const access = await getAccess();
  if (access.role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const id = String(b.id || "");
  const handles = Array.isArray(b.handles) ? b.handles.map((h: any) => String(h).trim()).filter(Boolean) : [];
  if (!id || !handles.length) return NextResponse.json({ ok: false, error: "Brief and at least one influencer required" }, { status: 400 });

  const sb = await createClient();
  const { data: brief } = await sb.from("campaign_briefs").select("*").eq("id", id).single();
  if (!brief) return NextResponse.json({ ok: false, error: "Brief not found" }, { status: 404 });

  const { data: roster } = await sb.from("influencers").select("handle,name,contact").in("handle", handles);
  const byHandle = new Map((roster || []).map((r: any) => [r.handle, r]));

  let attachment: { filename: string; content: string } | null = null;
  if (brief.pdf_path) {
    const { data: file } = await sb.storage.from("campaign-briefs").download(brief.pdf_path);
    if (file) attachment = { filename: brief.pdf_name || "brief.pdf", content: Buffer.from(await file.arrayBuffer()).toString("base64") };
  } else if (brief.content_html) {
    attachment = { filename: `${brief.title.replace(/[^a-z0-9]+/gi, "-").slice(0, 60)}.html`, content: Buffer.from(brief.content_html).toString("base64") };
  }

  const live = fmtD(brief.live_date);
  const sent: string[] = [];
  const skipped: { handle: string; reason: string }[] = [];

  for (const handle of handles) {
    const r: any = byHandle.get(handle);
    const email = String(r?.contact || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { skipped.push({ handle, reason: "No email on file" }); continue; }
    const html = shell(`
      <p style="font-size:15px;margin:0 0 14px">Hi ${r?.name || "there"},</p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 14px">Your creator brief${brief.brand ? ` for ${brief.brand}` : ""} is ready — <strong>${brief.title}</strong>.${live ? ` Content should go live week commencing ${live}.` : ""}</p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 14px">${attachment ? "It's attached to this email — take a look through before you shoot." : "Reach out and we'll get the brief details over to you."}</p>
      <p style="font-size:15px;margin:0">Thanks,<br/>Coolkidz Partnerships</p>
    `);
    const res = await sendMail({ to: [email], subject: `Your brief — ${brief.title}`, html, attachments: attachment ? [attachment] : undefined });
    if (res.ok) sent.push(handle); else skipped.push({ handle, reason: res.error || "Send failed" });
  }

  if (sent.length) {
    const now = new Date().toISOString();
    await Promise.all(sent.map(handle => sb.from("campaign_brief_influencers").update({ emailed_at: now }).eq("brief_id", id).eq("handle", handle)));
  }
  return NextResponse.json({ ok: true, sent, skipped });
}
