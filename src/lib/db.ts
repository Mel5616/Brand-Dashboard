import { createClient } from "@/lib/supabase/server";

export type Brand = {
  id: number;
  name: string;
  color: string;
  init: string;
  live: boolean;
  synced_at: string | null;
};

export type BrandSummary = {
  brand_id: number;
  last_month_label: string;
  last_month_rev: number;
  mom_growth: number;
  yoy_growth: number;
  last_month_orders: number;
  aov: number;
  fy_revenue: number;
  currency: string;
  synced_at: string | null;
  fy_orders: number | null;
  unique_customers_fy: number | null;
  fy_refunds: number | null;
  last_month_refunds: number | null;
};

export type BrandMonthly = {
  brand_id: number;
  month_key: string;
  revenue: number;
  orders: number;
  prev_revenue: number;
};

export type BrandWeekly = {
  brand_id: number;
  week_start: string;
  revenue: number;
  orders: number;
};

export type BrandProduct = {
  brand_id: number;
  rank: number;
  title: string;
  gross_sales: number;
};

export type Tradeshow = {
  id: string;
  name: string;
  date_start: string;
  date_end: string;
  state: string;
  location: string;
};

export type TradeshowSale = {
  tradeshow_id: string;
  brand_id: number;
  revenue: number;
  orders: number;
};

export type WeekLabel = {
  week_start: string;
  label: string;
};

export type SyncLogEntry = {
  id: number;
  started_at: string;
  finished_at: string | null;
  brands_ok: number;
  brands_err: number;
  triggered_by: string;
};

export type GoogleAdsRow = {
  brand_id: number;
  month_key: string;
  spend: number;
  impressions: number;
  clicks: number;
  roas: number;
};

export type MetaAdsRow = {
  brand_id: number;
  month_key: string;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  purchases: number;
  revenue: number;
};

export type MetaAdsPlatformRow = {
  brand_id: number;
  month_key: string;
  platform: string;
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number;
  revenue: number;
};

export type InstagramOrganicRow = {
  brand_id: number;
  month_key: string;
  followers: number;
  reach: number;
  profile_views: number;
  accounts_engaged: number;
};

export type BrandTarget = {
  brand_id: number;
  month_key: string;
  revenue_target: number;
  google_spend_target: number;
  meta_spend_target: number;
};

export type KlaviyoRow = {
  brand_id: number;
  month_key: string;
  list_size: number;
  emails_sent: number;
  open_rate: number;
  click_rate: number;
  revenue: number;
  unsubscribes: number;
  bounces: number;
  spam_complaints: number;
  orders: number;
  flow_revenue: number;
  campaign_revenue: number;
};

export type GA4Row = {
  brand_id: number;
  month_key: string;
  sessions: number;
  organic_sessions: number;
  new_users: number;
  engagement_rate: number;
};

export type GoogleAdsCampaignRow = {
  brand_id: number;
  month_key: string;
  campaign_name: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conv_value: number;
};

export type MarketingBudget = {
  brand_id: number;
  channel: string;
  annual_budget: number;
  fy: string;
};

export type MarketingActual = {
  brand_id: number;
  month_key: string;
  channel: string;
  spend: number;
  note: string;
};

export type CalendarEvent = {
  uid: string;
  title: string;
  description: string;
  location: string;
  start_date: string;
  end_date: string | null;
  all_day: boolean;
  brand_id: number | null;
};

export type AiInsight = {
  id: number;
  generated_at: string;
  period_label: string | null;
  content: string;
  model: string | null;
};

export async function getDashboardData() {
  const db = await createClient();

  const [
    { data: brands },
    { data: summaries },
    { data: monthly },
    { data: weekly },
    { data: products },
    { data: tradeshows },
    { data: tradeshowBrands },
    { data: tradeshowSales },
    { data: weekLabels },
    { data: syncLog },
    { data: googleAds },
    { data: metaAds },
    { data: metaAdsPlatform },
    { data: instagramOrganic },
    { data: targets },
    { data: klaviyo },
    { data: ga4 },
    { data: marketingBudgets },
    { data: marketingActuals },
    { data: googleAdsCampaigns },
    { data: calendarEvents },
    { data: aiInsights },
    { data: gscMetrics },
    { data: gscQueries },
    { data: gscInsights },
    { data: semrushMetrics },
    { data: semrushCompetitors },
    { data: semrushKeywords },
    { data: semrushPages },
    { data: brandInsights },
    { data: instagramMedia },
    { data: channelSales },
    { data: shopifySources },
    { data: eventbriteEvents },
    { data: asanaTasks },
  ] = await Promise.all([
    db.from("brands").select("*").order("id"),
    db.from("brand_summary").select("*"),
    db.from("brand_monthly").select("*").order("month_key"),
    db.from("brand_weekly").select("*").order("week_start"),
    db.from("brand_products").select("*").order("rank"),
    db.from("tradeshows").select("*").order("date_start"),
    db.from("tradeshow_brands").select("*"),
    db.from("tradeshow_sales").select("*"),
    db.from("week_labels").select("*").order("week_start"),
    db.from("sync_log").select("*").order("started_at", { ascending: false }).limit(1),
    db.from("google_ads").select("*").order("month_key"),
    db.from("meta_ads").select("*").order("month_key"),
    db.from("meta_ads_platform").select("brand_id,month_key,platform,spend,impressions,clicks,purchases,revenue,reach").order("month_key"),
    db.from("instagram_organic").select("brand_id,month_key,followers,reach,profile_views,accounts_engaged").order("month_key"),
    db.from("brand_targets").select("*").order("month_key"),
    db.from("klaviyo_metrics").select("*").order("month_key"),
    db.from("ga4_metrics").select("*").order("month_key"),
    db.from("marketing_budgets").select("*"),
    db.from("marketing_actuals").select("*").order("month_key"),
    db.from("google_ads_campaigns").select("*").order("month_key"),
    db.from("calendar_events").select("*").order("start_date"),
    db.from("ai_insights").select("*").order("generated_at", { ascending: false }).limit(1),
    db.from("gsc_metrics").select("*").order("month_key"),
    db.from("gsc_queries").select("*"),
    db.from("gsc_insights").select("*"),
    db.from("semrush_metrics").select("*").order("month_key"),
    db.from("semrush_competitors").select("*"),
    db.from("semrush_keywords").select("*"),
    db.from("semrush_pages").select("*"),
    db.from("brand_insights").select("*"),
    db.from("instagram_media").select("*").order("posted_at", { ascending: false }),
    db.from("channel_sales").select("*"),
    db.from("shopify_source_sales").select("*"),
    db.from("eventbrite_events").select("*").order("start_at", { ascending: false }),
    db.from("asana_tasks").select("*").order("due_on", { ascending: true }),
  ]);

  return {
    brands: (brands ?? []) as Brand[],
    summaries: (summaries ?? []) as BrandSummary[],
    monthly: (monthly ?? []) as BrandMonthly[],
    weekly: (weekly ?? []) as BrandWeekly[],
    products: (products ?? []) as BrandProduct[],
    tradeshows: (tradeshows ?? []) as Tradeshow[],
    tradeshowBrands: (tradeshowBrands ?? []) as { tradeshow_id: string; brand_id: number }[],
    tradeshowSales: (tradeshowSales ?? []) as TradeshowSale[],
    weekLabels: (weekLabels ?? []) as WeekLabel[],
    lastSync: syncLog?.[0] ?? null,
    googleAds: (googleAds ?? []) as GoogleAdsRow[],
    metaAds: (metaAds ?? []) as MetaAdsRow[],
    metaAdsPlatform: (metaAdsPlatform ?? []) as MetaAdsPlatformRow[],
    instagramOrganic: (instagramOrganic ?? []) as InstagramOrganicRow[],
    targets: (targets ?? []) as BrandTarget[],
    klaviyo: (klaviyo ?? []) as KlaviyoRow[],
    ga4: (ga4 ?? []) as GA4Row[],
    marketingBudgets: (marketingBudgets ?? []) as MarketingBudget[],
    marketingActuals: (marketingActuals ?? []) as MarketingActual[],
    googleAdsCampaigns: (googleAdsCampaigns ?? []) as GoogleAdsCampaignRow[],
    calendarEvents: (calendarEvents ?? []) as CalendarEvent[],
    aiInsight: (aiInsights?.[0] ?? null) as AiInsight | null,
    gscMetrics: (gscMetrics ?? []) as GscMetricRow[],
    gscQueries: (gscQueries ?? []) as GscQueryRow[],
    gscInsights: (gscInsights ?? []) as GscInsight[],
    semrushMetrics: (semrushMetrics ?? []) as SemrushMetricRow[],
    semrushCompetitors: (semrushCompetitors ?? []) as SemrushCompetitorRow[],
    semrushKeywords: (semrushKeywords ?? []) as SemrushKeywordRow[],
    semrushPages: (semrushPages ?? []) as SemrushPageRow[],
    brandInsights: (brandInsights ?? []) as BrandInsightRow[],
    instagramMedia: (instagramMedia ?? []) as InstagramMediaRow[],
    channelSales: (channelSales ?? []) as ChannelSaleRow[],
    shopifySources: (shopifySources ?? []) as ShopifySourceRow[],
    eventbriteEvents: (eventbriteEvents ?? []) as EventbriteEvent[],
    asanaTasks: (asanaTasks ?? []) as AsanaTask[],
  };
}

export type AsanaTask = { gid: string; name: string | null; notes: string | null; assignee: string | null; due_on: string | null; completed: boolean; completed_at: string | null; section: string | null; status: string | null; priority: string | null; project_gid: string | null; project_label: string | null; permalink_url: string | null; modified_at: string | null; brand_id: number | null };

export type EventbriteEvent = { event_id: string; name: string | null; start_at: string | null; end_at: string | null; venue: string | null; state: string | null; status: string | null; url: string | null; capacity: number | null; tickets_sold: number; gross_revenue: number; currency: string | null; brand_id: number | null };

export type ChannelSaleRow = { month_key: string; brand: string; customer_group: string; register: string; value: number; is_online: boolean };
export type ShopifySourceRow = { brand_id: number; month_key: string; source: string; revenue: number };

export type InstagramMediaRow = { brand_id: number; media_id: string; caption: string | null; media_type: string | null; permalink: string | null; posted_at: string | null; like_count: number; comments_count: number; image_url: string | null };

export type SemrushKeywordRow = { brand_id: number; month_key: string; phrase: string; position: number; search_volume: number; cpc: number; traffic_pct: number; url: string };
export type SemrushPageRow = { brand_id: number; month_key: string; url: string; keywords: number; traffic: number };
export type BrandInsightRow = { brand_id: number; generated_at: string; content: string };

export type GscMetricRow = { brand_id: number; month_key: string; clicks: number; impressions: number; ctr: number; position: number };
export type GscQueryRow = { brand_id: number; month_key: string; query: string; clicks: number; impressions: number; ctr: number; position: number };
export type GscInsight = { brand_id: number; generated_at: string; content: string };
export type SemrushMetricRow = { brand_id: number; month_key: string; organic_keywords: number; organic_traffic: number; traffic_value: number; semrush_rank: number };
export type SemrushCompetitorRow = { brand_id: number; month_key: string; competitor: string; relevance: number; common_keywords: number; organic_keywords: number; organic_traffic: number };
