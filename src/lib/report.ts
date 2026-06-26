// Per-brand (and portfolio) management report metrics.
// Formulas mirror the coolkidz-dashboard report so the numbers match exactly:
//   ROAS            = actual sales YTD / marketing spend YTD
//   Forecast (FY)   = actual sales YTD / fraction of FY elapsed
//   Share of portfolio = brand actual YTD / all-brands actual YTD
//   Momentum        = latest month vs previous month (sales)
//   Mktg % of sales = marketing budget FY / sales target FY
import type {
  Brand, BrandSummary, BrandMonthly, BrandTarget, MarketingBudget, MarketingActual,
} from "@/lib/db";

type AdRow = { brand_id: number; month_key: string; spend: number };

const GOOGLE = "Google Advertising";
const META   = "Social Media (Meta)";

export type ChannelSlice = { channel: string; value: number; pct: number };
export type ReportData = {
  label: string;            // brand name or "All Brands"
  color: string;
  // headline
  roas: number | null;
  forecast: number | null;
  forecastPctOfTarget: number | null;
  shareOfPortfolio: number; // 0..1
  momentumPct: number | null;
  momentumMonth: string | null;
  // kpis
  salesTargetFY: number;
  actualSalesYTD: number;
  marketingBudgetFY: number;
  spendYTD: number;
  pctToTarget: number;
  pctBudgetUsed: number;
  mktgPctOfSales: number;
  // series + breakdowns
  months: { label: string; sales: number; spend: number }[];
  budgetByChannel: ChannelSlice[];
  spendByChannel: ChannelSlice[];
  priorYearActual: number;  // 0 until last-year sales are synced
  elapsed: number;
};

const sum = (a: number[]) => a.reduce((s, v) => s + (v || 0), 0);

/** Fraction of the FY (Jul–Jun) elapsed as of `today`; 1 for a completed FY. */
export function fyElapsedFraction(fy: string, today = new Date()): number {
  const startYear = Number(fy.slice(0, 4));
  const start = new Date(startYear, 6, 1);          // 1 Jul
  const end   = new Date(startYear + 1, 5, 30);     // 30 Jun
  if (today <= start) return 0;
  if (today >= end) return 1;
  return (today.getTime() - start.getTime()) / (end.getTime() - start.getTime());
}

function pct(slices: { channel: string; value: number }[]): ChannelSlice[] {
  const total = sum(slices.map(s => s.value));
  return slices
    .filter(s => s.value > 0)
    .sort((a, b) => b.value - a.value)
    .map(s => ({ ...s, pct: total > 0 ? (s.value / total) * 100 : 0 }));
}

export function buildReport(
  scope: number | "all",
  d: {
    brands: Brand[];
    summaries: BrandSummary[];
    monthly: BrandMonthly[];
    targets: BrandTarget[];
    marketingBudgets: MarketingBudget[];
    marketingActuals: MarketingActual[];
    googleAds: AdRow[];
    metaAds: AdRow[];
    monthKeys: string[];
    monthLabels: string[];
    fy: string;
  },
): ReportData {
  const { brands, summaries, monthly, targets, marketingBudgets, marketingActuals, googleAds, metaAds, monthKeys, monthLabels, fy } = d;
  const ids = scope === "all" ? brands.map(b => b.id) : [scope];
  const inScope = <T extends { brand_id: number }>(rows: T[]) => rows.filter(r => ids.includes(r.brand_id));

  const actualSalesYTD    = sum(inScope(monthly).map(r => r.revenue));
  const salesTargetFY     = sum(inScope(targets).map(r => r.revenue_target));
  const marketingBudgetFY = sum(inScope(marketingBudgets).map(r => r.annual_budget));

  const googleSpend = sum(inScope(googleAds).map(r => r.spend));
  const metaSpend   = sum(inScope(metaAds).map(r => r.spend));
  // Non-Google/Meta actuals (Influencer, Shopify, Klaviyo, Giveaways, …)
  const otherActuals = inScope(marketingActuals).filter(a => a.channel !== GOOGLE && a.channel !== META);
  const spendYTD = googleSpend + metaSpend + sum(otherActuals.map(a => a.spend));

  // Portfolio actual for share-of-portfolio (always all brands, this FY)
  const portfolioActual = sum(monthly.map(r => r.revenue));

  // Monthly aligned series — sales + total marketing spend per month
  const months = monthKeys.map((mk, i) => {
    const sales = sum(inScope(monthly).filter(r => r.month_key === mk).map(r => r.revenue));
    const spend = sum(inScope(googleAds).filter(r => r.month_key === mk).map(r => r.spend))
                + sum(inScope(metaAds).filter(r => r.month_key === mk).map(r => r.spend))
                + sum(inScope(marketingActuals).filter(a => a.month_key === mk && a.channel !== GOOGLE && a.channel !== META).map(a => a.spend));
    return { label: monthLabels[i], sales, spend };
  });

  // Momentum — latest month with sales vs the previous one
  const withSales = months.filter(m => m.sales > 0);
  let momentumPct: number | null = null;
  let momentumMonth: string | null = null;
  if (withSales.length >= 1) {
    momentumMonth = withSales[withSales.length - 1].label;
    if (withSales.length >= 2) {
      const last = withSales[withSales.length - 1].sales;
      const prev = withSales[withSales.length - 2].sales;
      momentumPct = prev > 0 ? (last - prev) / prev : null;
    }
  }

  // Channel breakdowns
  const budgetChannels = [...new Set(inScope(marketingBudgets).map(b => b.channel))];
  const budgetByChannel = pct(budgetChannels.map(ch => ({
    channel: ch,
    value: sum(inScope(marketingBudgets).filter(b => b.channel === ch).map(b => b.annual_budget)),
  })));
  const otherChannels = [...new Set(otherActuals.map(a => a.channel))];
  const spendByChannel = pct([
    { channel: GOOGLE, value: googleSpend },
    { channel: META,   value: metaSpend },
    ...otherChannels.map(ch => ({ channel: ch, value: sum(otherActuals.filter(a => a.channel === ch).map(a => a.spend)) })),
  ]);

  const elapsed  = fyElapsedFraction(fy);
  const forecast = elapsed > 0.02 && actualSalesYTD > 0 ? actualSalesYTD / elapsed : null;

  return {
    label: scope === "all" ? "All Brands" : (brands.find(b => b.id === scope)?.name ?? "Brand"),
    color: scope === "all" ? "#1e293b" : (brands.find(b => b.id === scope)?.color ?? "#1e293b"),
    roas: spendYTD > 0 ? actualSalesYTD / spendYTD : null,
    forecast,
    forecastPctOfTarget: forecast != null && salesTargetFY > 0 ? forecast / salesTargetFY : null,
    shareOfPortfolio: portfolioActual > 0 ? actualSalesYTD / portfolioActual : 0,
    momentumPct,
    momentumMonth,
    salesTargetFY,
    actualSalesYTD,
    marketingBudgetFY,
    spendYTD,
    pctToTarget: salesTargetFY ? actualSalesYTD / salesTargetFY : 0,
    pctBudgetUsed: marketingBudgetFY ? spendYTD / marketingBudgetFY : 0,
    mktgPctOfSales: salesTargetFY ? marketingBudgetFY / salesTargetFY : 0,
    months,
    budgetByChannel,
    spendByChannel,
    priorYearActual: 0,
    elapsed,
  };
}
