import { fmtFull } from "@/lib/format";
import type { GoogleAdsCampaignRow } from "@/lib/db";

// Per-campaign Google Ads breakdown for one brand + month. Shared by the brand
// drill-down and the Google Ads tab so they never drift.
export function GoogleCampaignsTable({ campaigns, latest, prev }: {
  campaigns: GoogleAdsCampaignRow[]; latest: string; prev?: string;
}) {
  const campLatest = campaigns.filter(c => c.month_key === latest).sort((a, b) => b.spend - a.spend);
  const campPrev = prev ? campaigns.filter(c => c.month_key === prev) : [];
  if (campLatest.length === 0) return null;
  const prevLbl = prev ? new Date(prev + "-01T00:00:00").toLocaleDateString("en-AU", { month: "short" }) : "prev";

  return (
    <div className="bg-white border-b border-gray-100 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr style={{ background: "#f8fafc" }}>
            {["Campaign", "Spend", `vs ${prevLbl}`, "Clicks", "Conversions", "Conv Value", "ROAS"].map(h => (
              <th key={h} className={`${h === "Campaign" ? "text-left" : "text-right"} px-5 py-3 text-[10px] uppercase tracking-[0.15em] text-gray-400 font-semibold`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {campLatest.map(c => {
            const prevC    = campPrev.find(p => p.campaign_name === c.campaign_name);
            const spendChg = prevC && prevC.spend > 0 ? ((c.spend - prevC.spend) / prevC.spend) * 100 : null;
            const roas     = c.spend > 0 ? c.conv_value / c.spend : 0;
            return (
              <tr key={c.campaign_name} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-5 py-2.5 text-slate-700 font-medium max-w-xs truncate">{c.campaign_name}</td>
                <td className="px-5 py-2.5 text-right text-slate-600 whitespace-nowrap">{fmtFull(c.spend)}</td>
                <td className="px-5 py-2.5 text-right whitespace-nowrap">
                  {spendChg !== null ? (
                    <span className={`text-xs font-semibold ${spendChg >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                      {spendChg >= 0 ? "+" : ""}{spendChg.toFixed(1)}%
                    </span>
                  ) : <span className="text-gray-300 text-xs">—</span>}
                </td>
                <td className="px-5 py-2.5 text-right text-slate-600">{c.clicks.toLocaleString()}</td>
                <td className="px-5 py-2.5 text-right text-slate-600">{c.conversions > 0 ? c.conversions.toFixed(1) : "—"}</td>
                <td className="px-5 py-2.5 text-right text-slate-600 whitespace-nowrap">{c.conv_value > 0 ? fmtFull(c.conv_value) : "—"}</td>
                <td className="px-5 py-2.5 text-right font-semibold text-slate-700">{roas > 0 ? `${roas.toFixed(1)}×` : "—"}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gray-200">
            <td className="px-5 pt-2 pb-3 text-xs font-semibold text-gray-500">Total</td>
            <td className="px-5 pt-2 pb-3 text-right font-bold text-slate-800 whitespace-nowrap">{fmtFull(campLatest.reduce((s, c) => s + c.spend, 0))}</td>
            <td />
            <td className="px-5 pt-2 pb-3 text-right font-bold text-slate-800">{campLatest.reduce((s, c) => s + c.clicks, 0).toLocaleString()}</td>
            <td className="px-5 pt-2 pb-3 text-right font-bold text-slate-800">{campLatest.reduce((s, c) => s + c.conversions, 0).toFixed(1)}</td>
            <td className="px-5 pt-2 pb-3 text-right font-bold text-slate-800 whitespace-nowrap">{fmtFull(campLatest.reduce((s, c) => s + c.conv_value, 0))}</td>
            <td className="px-5 pt-2 pb-3 text-right font-bold text-slate-800">
              {(() => { const s = campLatest.reduce((a, c) => a + c.spend, 0); const v = campLatest.reduce((a, c) => a + c.conv_value, 0); return s > 0 ? `${(v / s).toFixed(1)}×` : "—"; })()}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
