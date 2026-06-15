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
};

export type GA4Row = {
  brand_id: number;
  month_key: string;
  sessions: number;
  organic_sessions: number;
  new_users: number;
  engagement_rate: number;
};

export type MarketingBudget = {
  brand_id: number;
  channel: string;
  annual_budget: number;
  fy: string;
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
  };
}
