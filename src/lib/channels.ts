// Shared sales-by-channel rollup. Used by the Sales tab and the Overview so they
// always agree. Website Sales = live Shopify (less tradeshows and special sources);
// Tradeshows live; Faire → Partnerships; Baby Bunting → Marketplace; API → Marketplace;
// no-group Backend/Cloud → Website Sales; everything else keeps its customer group.

export type ChannelSaleRow = { month_key: string; brand: string; customer_group: string; register: string; value: number; is_online: boolean };
type Monthly = { brand_id: number; month_key: string; revenue: number };
type Tradeshow = { id: string; date_start: string };
type TradeshowSale = { tradeshow_id: string; brand_id: number; revenue: number };
type ShopifySource = { brand_id: number; month_key: string; source: string; revenue: number };
type BrandLite = { id: number; name: string };

export type Channel = { name: string; series: number[]; fy: number; latest: number };

export const SOURCE_CHANNEL: Record<string, string> = { "faire": "Partnerships", "Baby Bunting": "Marketplace" };
// Sources whose orders actually flow through the brand's OWN Shopify (so they must be
// carved out of Website Sales to avoid double-counting). Faire imports into Shopify;
// Baby Bunting is a separate retailer sell-through feed, NOT in the brand's Shopify.
const IN_SHOPIFY_SOURCES = new Set(["faire"]);
export const DIGITAL_CHANNELS = new Set(["Website Sales", "Marketplace", "Affiliates", "Online Only Stores"]);
const CHANNEL_MAP: Record<string, string> = {
  "Online Store": "Online Only Stores", "Affiliate": "Affiliates",
  "Coolkidz": "Website Sales", "Direct Customer": "Website Sales", "Tradeshow Sales": "Tradeshows",
};

// Muted, cohesive palette (cool teals/slates + warm terracotta/rose/ochre accents),
// inspired by the reference dashboard. Indexes map to CHANNEL_ORDER below, and this
// also drives the donut + legend so the whole Overview stays consistent.
export const CH_COLORS = ["#2f4858", "#4f9d86", "#cc7a57", "#5b86b0", "#8a79ad", "#c97f96", "#73a9a0", "#9c7c5e", "#7fae8a", "#6f7a87", "#b8954a", "#5f93a8"];
// Append-only: a channel's index here picks its colour, so inserting mid-list would
// recolour every channel after it. Pharmacy is offline retail (not a DIGITAL_CHANNEL).
const CHANNEL_ORDER = ["Baby Bunting", "Website Sales", "Wholesale", "Tradeshows", "New Zealand", "Amazon", "Online Only Stores", "Specialty", "Marketplace", "Partnerships", "Affiliates", "Pharmacy", "The Memo", "Online Wholesale"];
export const channelColor = (name: string) => { const i = CHANNEL_ORDER.indexOf(name); return CH_COLORS[(i >= 0 ? i : CHANNEL_ORDER.length + name.length) % CH_COLORS.length]; };

const sum = (a: number[]) => a.reduce((s, v) => s + (v || 0), 0);
const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
export const brandMatch = (dash: string, sheet: string) => {
  const a = norm(dash), b = norm(sheet);
  return !!a && !!b && (a === b || a.startsWith(b) || b.startsWith(a));
};

export type ChannelData = {
  brands: BrandLite[];
  channelSales: ChannelSaleRow[];
  monthly: Monthly[];
  tradeshows: Tradeshow[];
  tradeshowSales: TradeshowSale[];
  shopifySources: ShopifySource[];
  monthKeys: string[];
  latest: string;
};

// Display grouping: Website Sales + Tradeshows roll up under a "Direct Sales" parent
// (own-store sales, online plus at our booths) while still showing the split underneath.
export const DIRECT_SALES = ["Website Sales", "Tradeshows"];
export type ChannelRow = Channel & { isGroup?: boolean; kids?: Channel[] };

export function groupDirect(channels: Channel[]): ChannelRow[] {
  const kids = channels.filter(c => DIRECT_SALES.includes(c.name));
  if (kids.length < 2) return channels;
  const others = channels.filter(c => !DIRECT_SALES.includes(c.name));
  const group: ChannelRow = {
    name: "Direct Sales", isGroup: true,
    fy: sum(kids.map(c => c.fy)), latest: sum(kids.map(c => c.latest)),
    series: kids[0].series.map((_, i) => sum(kids.map(c => c.series[i]))),
    kids: [...kids].sort((a, b) => DIRECT_SALES.indexOf(a.name) - DIRECT_SALES.indexOf(b.name)),
  };
  return [...others, group].sort((a, b) => b.fy - a.fy);
}

// Month-on-month change for a channel's series at the given month index.
// null when there is no prior month or the prior month was zero (avoids divide-by-zero noise).
export function momPct(series: number[], idx: number): number | null {
  if (idx <= 0) return null;
  const prev = series[idx - 1], cur = series[idx] ?? 0;
  return prev > 0 ? ((cur - prev) / prev) * 100 : null;
}

export function buildChannels(scope: number | "all", d: ChannelData): Channel[] {
  const { brands, channelSales, monthly, tradeshows, tradeshowSales, shopifySources, monthKeys, latest } = d;
  const showMonth = Object.fromEntries(tradeshows.map(t => [t.id, (t.date_start || "").slice(0, 7)]));
  const channelOf = (r: ChannelSaleRow) =>
    r.register === "API" ? "Marketplace"
    : (!r.customer_group || r.customer_group === "Other") ? "Website Sales"
    : (CHANNEL_MAP[r.customer_group] ?? r.customer_group);

  const offline = (scope === "all" ? channelSales : channelSales.filter(r => brandMatch(brands.find(b => b.id === scope)?.name ?? "", r.brand))).filter(r => !r.is_online);
  const live = scope === "all" ? monthly : monthly.filter(m => m.brand_id === scope);
  const srcIn = shopifySources.filter(x => scope === "all" || x.brand_id === scope);
  const ts = (mk: string) => sum(tradeshowSales.filter(x => showMonth[x.tradeshow_id] === mk && (scope === "all" || x.brand_id === scope)).map(x => x.revenue));
  const srcCh = (mk: string, ch: string) => sum(srcIn.filter(x => x.month_key === mk && SOURCE_CHANNEL[x.source] === ch).map(x => x.revenue));
  const inShopSrc = (mk: string) => sum(srcIn.filter(x => x.month_key === mk && IN_SHOPIFY_SOURCES.has(x.source)).map(x => x.revenue));
  const vOf = (ch: string, mk: string) => {
    const fileSum = sum(offline.filter(r => channelOf(r) === ch && r.month_key === mk).map(r => r.value));
    if (ch === "Tradeshows") return ts(mk) + fileSum;
    // Website Sales = the brand's own Shopify minus what else runs through that Shopify:
    // tradeshow booth orders (rung up on the brand's store) and Faire imports. Baby Bunting
    // is a separate retailer feed (NOT in the brand's Shopify), so it is not subtracted. Floored at 0.
    const base = ch === "Website Sales" ? Math.max(0, sum(live.filter(m => m.month_key === mk).map(m => m.revenue)) - ts(mk) - inShopSrc(mk)) : 0;
    return base + srcCh(mk, ch) + fileSum;
  };
  const names = new Set<string>(["Website Sales", "Tradeshows", ...Object.values(SOURCE_CHANNEL), ...offline.map(channelOf)]);
  return [...names].map(name => {
    const series = monthKeys.map(mk => vOf(name, mk));
    return { name, series, fy: sum(series), latest: vOf(name, latest) };
  }).filter(c => Math.abs(c.fy) > 0.5).sort((a, b) => b.fy - a.fy);
}
