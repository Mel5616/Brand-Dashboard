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
export const DIGITAL_CHANNELS = new Set(["Website Sales", "Marketplace", "Affiliates", "Online Only Stores"]);
const CHANNEL_MAP: Record<string, string> = {
  "Online Store": "Online Only Stores", "Affiliate": "Affiliates",
  "Coolkidz": "Website Sales", "Direct Customer": "Website Sales", "Tradeshow Sales": "Tradeshows",
};

export const CH_COLORS = ["#1e3a5f", "#10b981", "#f97316", "#3b82f6", "#a855f7", "#ec4899", "#14b8a6", "#92400e", "#22c55e", "#64748b", "#eab308", "#0ea5e9"];
const CHANNEL_ORDER = ["Baby Bunting", "Website Sales", "Wholesale", "Tradeshows", "New Zealand", "Amazon", "Online Only Stores", "Specialty", "Marketplace", "Partnerships", "Affiliates"];
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
  const allSrc = (mk: string) => sum(srcIn.filter(x => x.month_key === mk).map(x => x.revenue));
  const vOf = (ch: string, mk: string) => {
    const fileSum = sum(offline.filter(r => channelOf(r) === ch && r.month_key === mk).map(r => r.value));
    if (ch === "Tradeshows") return ts(mk) + fileSum;
    const base = ch === "Website Sales" ? sum(live.filter(m => m.month_key === mk).map(m => m.revenue)) - ts(mk) - allSrc(mk) : 0;
    return base + srcCh(mk, ch) + fileSum;
  };
  const names = new Set<string>(["Website Sales", "Tradeshows", ...Object.values(SOURCE_CHANNEL), ...offline.map(channelOf)]);
  return [...names].map(name => {
    const series = monthKeys.map(mk => vOf(name, mk));
    return { name, series, fy: sum(series), latest: vOf(name, latest) };
  }).filter(c => Math.abs(c.fy) > 0.5).sort((a, b) => b.fy - a.fy);
}
