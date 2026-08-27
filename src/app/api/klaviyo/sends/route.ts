import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { createDraftCampaign, scheduleSend, cancelCampaign, campaignStats, sendTestToSelf } from "@/lib/klaviyo";

// Tracks + drives Klaviyo sends pushed from the dashboard (currently the OOS
// Report). POST action="create" only ever creates a Draft in Klaviyo — never
// sends. POST action="schedule" is the sole action that actually queues a
// real send, and is admin-only. GET returns history with live open/click
// stats merged in for anything past draft.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const rest = (p: string, init?: RequestInit) => fetch(`${sbUrl}/rest/v1/${p}`, { ...init, headers: h((init?.headers as any) || {}), cache: "no-store" });

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  const res = await rest("klaviyo_sends?select=id,campaign_id,subject,list_name,scheduled_at,status,created_by,created_at&order=created_at.desc&limit=50");
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: true, needsSetup: /PGRST205|does not exist|schema cache/i.test(text), sends: [] });
  const sends = JSON.parse(text || "[]");
  const trackable = sends.filter((s: any) => s.status !== "draft" && s.status !== "cancelled").map((s: any) => s.campaign_id);
  let stats: Record<string, any> = {};
  try { stats = await campaignStats(trackable); } catch { /* stats optional */ }
  return NextResponse.json({ ok: true, sends: sends.map((s: any) => ({ ...s, stats: stats[s.campaign_id] ?? null })) });
}

export async function POST(req: Request) {
  const access = await getAccess();
  if (access.role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  if (!process.env.KLAVIYO_API_KEY) return NextResponse.json({ ok: false, error: "KLAVIYO_API_KEY not configured" }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }

  if (b.action === "test") {
    const { subject, html } = b;
    if (!subject || !html) return NextResponse.json({ ok: false, error: "Missing subject or html" }, { status: 400 });
    if (!access.user?.email) return NextResponse.json({ ok: false, error: "No email on your account" }, { status: 400 });
    try {
      await sendTestToSelf({ subject, fromEmail: "hello@coolkidz.com.au", fromLabel: "Coolkidz Australia", html, testEmail: access.user.email });
      return NextResponse.json({ ok: true, sentTo: access.user.email });
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e.message || "Klaviyo request failed" }, { status: 502 });
    }
  }

  if (b.action === "create") {
    const { subject, listId, listName, included, excluded, audienceName, html } = b;
    const includedIds: string[] = included ?? (listId ? [listId] : []);
    if (!subject || includedIds.length === 0 || !html) return NextResponse.json({ ok: false, error: "Missing subject, audience or html" }, { status: 400 });
    try {
      const { campaignId } = await createDraftCampaign({
        name: `${subject} — ${new Date().toLocaleDateString("en-AU")}`,
        included: includedIds, excluded, subject, fromEmail: "hello@coolkidz.com.au", fromLabel: "Coolkidz Australia", html,
      });
      const row = { campaign_id: campaignId, subject, list_id: includedIds[0], list_name: audienceName ?? listName ?? null, html, status: "draft", created_by: access.user?.email ?? null };
      const ins = await rest("klaviyo_sends", { method: "POST", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(row) });
      const text = await ins.text();
      if (!ins.ok) return NextResponse.json({ ok: false, error: /PGRST205|does not exist/i.test(text) ? "Run add_klaviyo_sends.sql first" : "Draft created in Klaviyo but failed to save locally", campaignId }, { status: 500 });
      return NextResponse.json({ ok: true, item: JSON.parse(text)[0] });
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e.message || "Klaviyo request failed" }, { status: 502 });
    }
  }

  if (b.action === "schedule") {
    const { id, campaignId, datetimeIso } = b;
    if (!campaignId) return NextResponse.json({ ok: false, error: "Missing campaignId" }, { status: 400 });
    try {
      await scheduleSend(campaignId, datetimeIso || undefined);
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e.message || "Klaviyo request failed" }, { status: 502 });
    }
    await rest(`klaviyo_sends?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH", headers: h({ Prefer: "return=minimal" }),
      body: JSON.stringify({ status: datetimeIso ? "scheduled" : "sent", scheduled_at: datetimeIso || null }),
    });
    return NextResponse.json({ ok: true });
  }

  if (b.action === "cancel") {
    const { id, campaignId } = b;
    if (!campaignId) return NextResponse.json({ ok: false, error: "Missing campaignId" }, { status: 400 });
    try { await cancelCampaign(campaignId); } catch { /* may already be gone */ }
    await rest(`klaviyo_sends?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify({ status: "cancelled" }) });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
}
