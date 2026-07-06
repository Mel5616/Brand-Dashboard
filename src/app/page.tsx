import { redirect } from "next/navigation";
import { getDashboardData } from "@/lib/db";
import { getBoothFunnel } from "@/lib/booth";
import { getAccess, getAccessForUser } from "@/lib/access";
import { DashboardTabs } from "@/components/DashboardTabs";
import { NotificationCenter } from "@/components/NotificationCenter";
import { AiInsightsPanel } from "@/components/AiInsightsPanel";
import { UserMenu } from "@/components/UserMenu";

export const revalidate = 0;

export default async function Dashboard(props: { searchParams: Promise<{ preview?: string }> }) {
  const real = await getAccess();
  if (!real.user) redirect("/login");

  // Admin "View as": render exactly what a chosen user would see. Read-only, no
  // session change — non-admins can't preview (the param is ignored).
  const sp = await props.searchParams;
  const previewId = real.role === "admin" && sp.preview ? sp.preview : null;
  const access = previewId ? await getAccessForUser(previewId) : real;
  const previewing = previewId && access.user ? access.user.email : null;
  const isAdmin = access.role === "admin";

  if (!access.user || (access.role === "member" && access.allowedTabs.length === 0)) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-md text-center">
          <p className="text-gray-700 font-medium">No access yet</p>
          <p className="text-sm text-gray-400 mt-1">
            {previewing
              ? `${previewing} has no dashboard sections granted, so they'd see this screen.`
              : `Your account (${access.user?.email}) is signed in but hasn’t been granted any dashboard sections. Ask an admin to set your access.`}
          </p>
          {previewing
            ? <a href="/" className="inline-block mt-4 text-xs font-semibold text-emerald-600 hover:underline">← Exit preview</a>
            : <UserMenu email={access.user!.email} role={access.role!} minimal />}
        </div>
      </div>
    );
  }
  const {
    brands, summaries, monthly, weekly, brandDaily, products,
    tradeshows, tradeshowBrands, tradeshowSales,
    weekLabels, lastSync, googleAds, metaAds, pinterestAds, metaAdsPlatform,
    instagramOrganic, targets, klaviyo, ga4, marketingBudgets, marketingActuals, googleAdsCampaigns, calendarEvents, aiInsight,
    gscMetrics, gscQueries, gscInsights, semrushMetrics, semrushCompetitors,
    semrushKeywords, semrushPages, brandInsights, instagramMedia, channelSales, shopifySources, eventbriteEvents, asanaTasks, salesBudget,
  } = await getDashboardData();

  const boothFunnel = await getBoothFunnel();

  const liveBrands = brands.filter(b => b.live);
  const totalFY = summaries.reduce((s: number, b: any) => s + (b.fy_revenue ?? 0), 0);
  const totalOrders = summaries.reduce((s: number, b: any) => s + (b.last_month_orders ?? 0), 0);

  function fmt(n: number) {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n.toFixed(0)}`;
  }

  const kpis = [
    { label: "FY 2025–26 Revenue", value: fmt(totalFY), sub: "ex-GST, all brands" },
    { label: "Active Brands", value: liveBrands.length.toString(), sub: `of ${brands.length} total` },
    { label: "Last Month Orders", value: totalOrders.toLocaleString(), sub: summaries[0]?.last_month_label ?? "" },
    { label: "Tradeshows", value: tradeshows.length.toString(), sub: `${tradeshows.filter((t: any) => new Date() < new Date(t.date_start)).length} upcoming` },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100/60">
      <header className="bg-white border-b-2 border-slate-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-screen-2xl mx-auto pr-6 pl-16 lg:px-6 h-[68px] flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src="/logos/Coolkidz Logo.png" alt="Coolkidz Australia" className="h-8 w-auto" />
            <div className="hidden sm:block pl-4 border-l border-slate-200">
              <h1 className="font-bold text-slate-800 text-[15px] leading-tight">Marketing Dashboard</h1>
              <p className="text-[11px] text-slate-400 leading-tight">Coolkidz Australia</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && <AiInsightsPanel insight={aiInsight} />}
            {isAdmin && (
              <NotificationCenter
                brands={brands}
                summaries={summaries}
                googleAds={googleAds}
                metaAds={metaAds}
                targets={targets}
                marketingBudgets={marketingBudgets}
                marketingActuals={marketingActuals}
              />
            )}
            <UserMenu email={real.user.email} role={real.role!} />
          </div>
        </div>
      </header>

      {previewing && (
        <div className="bg-amber-100 border-b border-amber-200 text-amber-900 text-sm">
          <div className="max-w-screen-2xl mx-auto px-6 py-2 flex items-center justify-between">
            <span>👁️ Viewing as <strong>{previewing}</strong>{access.role === "admin" ? " (admin — full access)" : ` — ${access.allowedTabs.length} section${access.allowedTabs.length === 1 ? "" : "s"}`}. This is read-only.</span>
            <a href="/" className="font-semibold hover:underline whitespace-nowrap">Exit preview ✕</a>
          </div>
        </div>
      )}

      <DashboardTabs
        role={access.role!}
        allowedTabs={access.allowedTabs}
        currentEmail={access.user.email}
        lastSync={lastSync}
        brands={brands}
        /* financial data withheld from non-admins (not just hidden — not sent) */
        summaries={summaries}
        monthly={monthly}
        weekly={weekly}
        brandDaily={brandDaily}
        products={products}
        tradeshows={tradeshows}
        tradeshowBrands={tradeshowBrands}
        tradeshowSales={tradeshowSales}
        weekLabels={weekLabels}
        googleAds={googleAds}
        metaAds={metaAds}
        pinterestAds={pinterestAds}
        metaAdsPlatform={metaAdsPlatform}
        instagramOrganic={instagramOrganic}
        targets={targets}
        klaviyo={klaviyo}
        ga4={ga4}
        marketingBudgets={marketingBudgets}
        marketingActuals={marketingActuals}
        googleAdsCampaigns={googleAdsCampaigns}
        calendarEvents={calendarEvents}
        gscMetrics={gscMetrics}
        gscQueries={gscQueries}
        gscInsights={gscInsights}
        semrushMetrics={semrushMetrics}
        semrushCompetitors={semrushCompetitors}
        semrushKeywords={semrushKeywords}
        semrushPages={semrushPages}
        brandInsights={brandInsights}
        instagramMedia={instagramMedia}
        channelSales={channelSales}
        shopifySources={shopifySources}
        eventbriteEvents={eventbriteEvents}
        asanaTasks={asanaTasks}
        salesBudget={salesBudget}
        boothFunnel={boothFunnel}
        kpis={kpis}
      />
    </div>
  );
}
