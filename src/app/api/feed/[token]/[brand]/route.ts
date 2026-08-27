import { NextResponse } from "next/server";

// Public, UNAUTHENTICATED feed Klaviyo fetches at send time (build brief §6).
// No dashboard auth here on purpose — Klaviyo cannot log in.
//
// Contract Klaviyo requires: always 2xx + valid JSON, or Klaviyo disables
// the feed entirely (which also stops flows/campaigns using it from
// sending — see the Feeds screen). So every branch below returns 200 with
// *some* valid payload; there is no error branch that reaches the response.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const rest = (p: string, init?: RequestInit) => fetch(`${sbUrl}/rest/v1/${p}`, { ...init, headers: h((init?.headers as any) || {}), cache: "no-store" });

const slugOf = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const EMPTY_PAYLOAD = { campaign_name: null, subject_options: [], preview_text: "", modules: [] };

export async function GET(req: Request, { params }: { params: Promise<{ token: string; brand: string }> }) {
  const { token, brand } = await params;
  const headers = { "Cache-Control": "no-store" };

  if (!sbUrl || !sbKey) return NextResponse.json(EMPTY_PAYLOAD, { headers });

  const bRes = await rest("brands?select=id,name,feed_token");
  const brands = bRes.ok ? JSON.parse((await bRes.text()) || "[]") : [];
  const match = brands.find((b: any) => slugOf(b.name) === brand.toLowerCase() && b.feed_token === token);

  // Wrong token/brand combo isn't Klaviyo's real feed URL — safe to 404
  // rather than honour the "always 2xx" contract, which only applies to
  // the one genuine feed URL configured in Klaviyo.
  if (!match) return NextResponse.json({ error: "Unknown feed" }, { status: 404, headers });

  // Log the fetch (best-effort — never let a logging failure break the feed).
  rest("email_feed_fetches", {
    method: "POST", headers: h({ Prefer: "return=minimal" }),
    body: JSON.stringify({ brand_id: match.id, ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null, user_agent: req.headers.get("user-agent") ?? null }),
  }).catch(() => {});

  // Prefer the nearest-future scheduled campaign; else the most recently sent one.
  const now = new Date().toISOString();
  const scheduledRes = await rest(`email_campaigns?brand_id=eq.${match.id}&status=eq.scheduled&scheduled_for=gte.${encodeURIComponent(now)}&order=scheduled_for.asc&limit=1&select=payload_json`);
  const scheduled = scheduledRes.ok ? JSON.parse((await scheduledRes.text()) || "[]") : [];
  if (scheduled[0]?.payload_json) return NextResponse.json(scheduled[0].payload_json, { headers });

  const sentRes = await rest(`email_campaigns?brand_id=eq.${match.id}&status=eq.sent&order=updated_at.desc&limit=1&select=payload_json`);
  const sent = sentRes.ok ? JSON.parse((await sentRes.text()) || "[]") : [];
  if (sent[0]?.payload_json) return NextResponse.json(sent[0].payload_json, { headers });

  // No campaigns exist yet for this brand — still a valid, harmless payload.
  return NextResponse.json(EMPTY_PAYLOAD, { headers });
}
