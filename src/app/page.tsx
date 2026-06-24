import { redirect } from "next/navigation";
import { getDashboardData } from "@/lib/db";
import { getBoothFunnel } from "@/lib/booth";
import { getAccess } from "@/lib/access";
import { SyncStatus } from "@/components/SyncStatus";
import { DashboardTabs } from "@/components/DashboardTabs";
import { NotificationCenter } from "@/components/NotificationCenter";
import { AiInsightsPanel } from "@/components/AiInsightsPanel";
import { UserMenu } from "@/components/UserMenu";

export const revalidate = 0;

export default async function Dashboard() {
  const access = await getAccess();
  if (!access.user) redirect("/login");
  const isAdmin = access.role === "admin";
  if (access.role === "member" && access.allowedTabs.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-md text-center">
          <p className="text-gray-700 font-medium">No access yet</p>
          <p className="text-sm text-gray-400 mt-1">Your account ({access.user.email}) is signed in but hasn’t been granted any dashboard sections. Ask an admin to set your access.</p>
          <UserMenu email={access.user.email} role={access.role} minimal />
        </div>
      </div>
    );
  }
  const {
    brands, summaries, monthly, weekly, products,
    tradeshows, tradeshowBrands, tradeshowSales,
    weekLabels, lastSync, googleAds, metaAds, metaAdsPlatform,
    instagramOrganic, targets, klaviyo, ga4, marketingBudgets, marketingActuals, googleAdsCampaigns, calendarEvents, aiInsight,
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
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-200/70 sticky top-0 z-20 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
        <div className="max-w-screen-2xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <img src="/logos/Coolkidz Logo.png" alt="Coolkidz Australia" className="h-6 w-auto" />
            <div className="hidden sm:block pl-3.5 border-l border-gray-200">
              <h1 className="font-semibold text-gray-800 text-sm leading-tight">Brand Dashboard</h1>
              <p className="text-[11px] text-gray-400 leading-tight">{liveBrands.length} active brands</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <AiInsightsPanel insight={aiInsight} />
            <NotificationCenter
              brands={brands}
              summaries={summaries}
              googleAds={googleAds}
              metaAds={metaAds}
              targets={targets}
              marketingBudgets={isAdmin ? marketingBudgets : []}
              marketingActuals={isAdmin ? marketingActuals : []}
            />
            <SyncStatus lastSync={lastSync} isAdmin={isAdmin} />
            <UserMenu email={access.user.email} role={access.role!} />
          </div>
        </div>
      </header>

      <DashboardTabs
        role={access.role!}
        allowedTabs={access.allowedTabs}
        brands={brands}
        /* financial data withheld from non-admins (not just hidden — not sent) */
        summaries={summaries}
        monthly={monthly}
        weekly={weekly}
        products={products}
        tradeshows={tradeshows}
        tradeshowBrands={tradeshowBrands}
        tradeshowSales={tradeshowSales}
        weekLabels={weekLabels}
        googleAds={googleAds}
        metaAds={metaAds}
        metaAdsPlatform={metaAdsPlatform}
        instagramOrganic={instagramOrganic}
        targets={targets}
        klaviyo={klaviyo}
        ga4={ga4}
        marketingBudgets={isAdmin ? marketingBudgets : []}
        marketingActuals={isAdmin ? marketingActuals : []}
        googleAdsCampaigns={googleAdsCampaigns}
        calendarEvents={calendarEvents}
        boothFunnel={boothFunnel}
        kpis={kpis}
      />
    </div>
  );
}
