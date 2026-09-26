import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { FLOW_TYPES } from "@/app/api/lifecycle-flows/route";

// Email Health Overview (Email Marketing > Lifecycle Flows) — composes the
// existing nightly-synced tables (lifecycle_flows, klaviyo_flow_metrics,
// klaviyo_metrics, klaviyo_campaigns) into one portfolio view: revenue,
// deliverability, flow coverage gaps and campaign cadence, ranked by
// revenue at stake. No live Klaviyo call — everything here already syncs
// nightly for other tabs. Built off the same read-only audit run 26 Sep
// 2026 (see audit/klaviyo-audit-2026-09-26.md), so Mel has this live on
// the dashboard instead of a one-off snapshot.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = { apikey: sbKey!, Authorization: `Bearer ${sbKey}` };
const missing = (s: number, b: string) => s === 404 || /PGRST205|does not exist|schema cache/i.test(b);

// Same lines as today.ts's own bounce alert, plus spam/unsub — brand-monthly
// averages, a coarser signal than the message-level thresholds used in the
// one-off audit (2%/0.1%/1% there too, just per-send rather than per-month).
const THRESHOLD = { bounce: 0.02, spam: 0.001, unsub: 0.01 };

async function fetchAll(table: string, query: string) {
  const res = await fetch(`${sbUrl}/rest/v1/${table}?${query}`, { headers: h, cache: "no-store" });
  const text = await res.text();
  if (!res.ok) return { ok: false, needsSetup: missing(res.status, text), items: [] as any[] };
  return { ok: true, items: JSON.parse(text || "[]") as any[] };
}

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });

  const [brandsRes, lifecycleRes, flowMetricsRes, klaviyoMetricsRes, campaignsRes] = await Promise.all([
    fetchAll("brands", "select=id,name,live"),
    fetchAll("lifecycle_flows", "select=*"),
    fetchAll("klaviyo_flow_metrics", "select=*&order=month_key.desc"),
    fetchAll("klaviyo_metrics", "select=brand_id,month_key,emails_sent,revenue,unsubscribes,bounces,spam_complaints,flow_revenue,campaign_revenue&order=month_key.desc"),
    fetchAll("klaviyo_campaigns", "select=brand_id,name,send_time,sent_at,revenue&order=send_time.desc.nullslast"),
  ]);
  const firstMissing = [brandsRes, lifecycleRes, flowMetricsRes, klaviyoMetricsRes, campaignsRes].find(r => (r as any).needsSetup);
  if (firstMissing) return NextResponse.json({ ok: true, needsSetup: true, brands: [] });

  const brands = (brandsRes.items || []).filter((b: any) => b.live !== false);
  const lifecycle = lifecycleRes.items || [];
  const flowMetrics = flowMetricsRes.items || [];
  const klaviyoMetrics = klaviyoMetricsRes.items || [];
  const campaigns = campaignsRes.items || [];

  const flowMonths = [...new Set(flowMetrics.map((r: any) => r.month_key))].sort().reverse();
  const currentFlowMonth = flowMonths[0];
  const kMonths = [...new Set(klaviyoMetrics.map((r: any) => r.month_key))].sort().reverse();
  const currentKMonth = kMonths[0];

  const flowLabel = new Map(FLOW_TYPES.map(f => [f.key, f.label]));

  const out = brands.map((b: any) => {
    const cov = lifecycle.filter((r: any) => r.brand_id === b.id);
    const missingFlows: string[] = [];
    const liveButSilent: string[] = [];
    const notBuiltOrPlanned: { key: string; label: string; status: string }[] = [];
    for (const f of FLOW_TYPES) {
      const row = cov.find((r: any) => r.flow_key === f.key);
      const status = row?.status ?? "not_built";
      if (status === "not_built") { missingFlows.push(f.label); notBuiltOrPlanned.push({ key: f.key, label: f.label, status }); continue; }
      if (status === "planned") notBuiltOrPlanned.push({ key: f.key, label: f.label, status });
      if (status === "live") {
        const sent = flowMetrics.some((m: any) => m.brand_id === b.id && m.flow_name && currentFlowMonth && m.month_key === currentFlowMonth &&
          (m.flow_name || "").toLowerCase() === (row?.note || "").toLowerCase());
        if (!sent && currentFlowMonth) liveButSilent.push(f.label);
      }
    }

    const kmThis = klaviyoMetrics.find((r: any) => r.brand_id === b.id && r.month_key === currentKMonth);
    const deliverFlags: { metric: string; value: number; threshold: number }[] = [];
    if (kmThis && kmThis.emails_sent >= 100) {
      const bounceRate = kmThis.bounces / kmThis.emails_sent, spamRate = kmThis.spam_complaints / kmThis.emails_sent, unsubRate = kmThis.unsubscribes / kmThis.emails_sent;
      if (bounceRate > THRESHOLD.bounce) deliverFlags.push({ metric: "bounce_rate", value: bounceRate, threshold: THRESHOLD.bounce });
      if (spamRate > THRESHOLD.spam) deliverFlags.push({ metric: "spam_complaint_rate", value: spamRate, threshold: THRESHOLD.spam });
      if (unsubRate > THRESHOLD.unsub) deliverFlags.push({ metric: "unsubscribe_rate", value: unsubRate, threshold: THRESHOLD.unsub });
    }

    const brandCampaigns = campaigns.filter((c: any) => c.brand_id === b.id).sort((a: any, c: any) => (c.send_time || c.sent_at || "").localeCompare(a.send_time || a.sent_at || ""));
    const lastSend = brandCampaigns[0]?.send_time || brandCampaigns[0]?.sent_at || null;
    const daysSinceLastSend = lastSend ? Math.round((Date.now() - new Date(lastSend).getTime()) / 86400000) : null;
    const last3 = brandCampaigns.slice(0, 3);
    const zeroRevenueStreak = last3.length >= 3 && last3.every((c: any) => !c.revenue || c.revenue === 0);

    const flowRevenue = kmThis?.flow_revenue ?? 0;
    const campaignRevenue = kmThis?.campaign_revenue ?? 0;

    return {
      id: b.id, name: b.name,
      month: currentKMonth || null,
      revenue: { flow: flowRevenue, campaign: campaignRevenue, total: Math.round((flowRevenue + campaignRevenue) * 100) / 100 },
      deliverability: { flags: deliverFlags, emails_sent: kmThis?.emails_sent ?? 0 },
      coverage: { missing: missingFlows, live_but_silent: liveButSilent, to_build: notBuiltOrPlanned },
      campaigns: { days_since_last_send: daysSinceLastSend, zero_revenue_streak: zeroRevenueStreak, recent_count: brandCampaigns.length },
    };
  });

  out.sort((a, b) => b.revenue.total - a.revenue.total);

  return NextResponse.json({ ok: true, currentFlowMonth: currentFlowMonth || null, currentKMonth: currentKMonth || null, brands: out, flowTypes: FLOW_TYPES.map(f => ({ key: f.key, label: flowLabel.get(f.key) })) });
}
