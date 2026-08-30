import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { createDraftCampaign, scheduleSend, cancelCampaign, campaignStats, sendTestToSelf } from "@/lib/klaviyo";
import { klaviyoKeyForBrand } from "@/lib/klaviyoBrandKeys";

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
  const res = await rest("klaviyo_sends?select=id,campaign_id,subject,list_name,scheduled_at,status,created_by,created_at,brand_id&order=created_at.desc&limit=50");
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: true, needsSetup: /PGRST205|does not exist|schema cache/i.test(text), sends: [] });
  const sends = JSON.parse(text || "[]");
  const trackable = sends.filter((s: any) => s.status !== "draft" && s.status !== "cancelled");
  // Campaign ids are scoped to whichever Klaviyo account created them, so
  // stats must be fetched per brand's own key, not in one mixed batch.
  const byBrand = new Map<number | undefined, string[]>();
  for (const s of trackable) {
    const key = s.brand_id ?? undefined;
    byBrand.set(key, [...(byBrand.get(key) ?? []), s.campaign_id]);
  }
  const stats: Record<string, any> = {};
  for (const [brandId, ids] of byBrand) {
    try { Object.assign(stats, await campaignStats(ids, klaviyoKeyForBrand(brandId))); } catch { /* stats optional */ }
  }
  return NextResponse.json({ ok: true, sends: sends.map((s: any) => ({ ...s, stats: stats[s.campaign_id] ?? null })) });
}

export async function POST(req: Request) {
  const access = await getAccess();
  if (access.role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const brandId: number | undefined = b.brandId != null ? Number(b.brandId) : undefined;
  const apiKey = klaviyoKeyForBrand(brandId);
  if (!apiKey) return NextResponse.json({ ok: false, error: "KLAVIYO_API_KEY not configured" }, { status: 500 });

  if (b.action === "test") {
    const { subject, html } = b;
    if (!subject || !html) return NextResponse.json({ ok: false, error: "Missing subject or html" }, { status: 400 });
    if (!access.user?.email) return NextResponse.json({ ok: false, error: "No email on your account" }, { status: 400 });
    try {
      await sendTestToSelf({ subject, fromEmail: "hello@coolkidz.com.au", fromLabel: "Coolkidz Australia", html, testEmail: access.user.email }, apiKey);
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
      }, apiKey);
      const row = { campaign_id: campaignId, subject, list_id: includedIds[0], list_name: audienceName ?? listName ?? null, html, status: "draft", created_by: access.user?.email ?? null, brand_id: brandId ?? null };
      const ins = await rest("klaviyo_sends", { method: "POST", headers: h({ Prefer: "return=representation" }), body: JSON.stringify(row) });
      const text = await ins.text();
      if (!ins.ok) return NextResponse.json({ ok: false, error: /PGRST205|does not exist/i.test(text) ? "Run add_klaviyo_sends.sql first" : "Draft created in Klaviyo but failed to save locally", campaignId }, { status: 500 });
      return NextResponse.json({ ok: true, item: JSON.parse(text)[0] });
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e.message || "Klaviyo request failed" }, { status: 502 });
    }
  }

  // schedule/cancel/delete act on a campaign created earlier — re-resolve
  // its own brand_id from the stored row rather than trusting the request
  // body, since a campaign id is only valid against the account that made it.
  async function keyForRow(id: string): Promise<string | undefined> {
    if (brandId != null) return apiKey;
    const res = await rest(`klaviyo_sends?id=eq.${encodeURIComponent(id)}&select=brand_id`);
    const rows = await res.json().catch(() => []);
    return klaviyoKeyForBrand(rows?.[0]?.brand_id ?? undefined);
  }

  if (b.action === "schedule") {
    const { id, campaignId, datetimeIso } = b;
    if (!campaignId) return NextResponse.json({ ok: false, error: "Missing campaignId" }, { status: 400 });
    try {
      await scheduleSend(campaignId, datetimeIso || undefined, await keyForRow(id));
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
    try { await cancelCampaign(campaignId, await keyForRow(id)); } catch { /* may already be gone */ }
    await rest(`klaviyo_sends?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify({ status: "cancelled" }) });
    return NextResponse.json({ ok: true });
  }

  if (b.action === "delete") {
    // Removes the row from history entirely (unlike "cancel", which keeps a
    // record). Best-effort delete in Klaviyo too, in case it's still there.
    const { id, campaignId } = b;
    if (!id) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
    if (campaignId) { try { await cancelCampaign(campaignId, await keyForRow(id)); } catch { /* may already be gone */ } }
    await rest(`klaviyo_sends?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: h({ Prefer: "return=minimal" }) });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
}
