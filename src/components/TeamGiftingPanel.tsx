"use client";

import { useEffect, useState } from "react";

// Members-only influencer view for the social team. Shows budget pacing as
// percentages and gifts by RRP — never any cost. Mirrors how the team's
// spreadsheet tracks gifting by percentage.

type Brand = { brand: string; gifts: number; rrp_gifted: number; used_pct: number; left_pct: number };
type Gift = { month_key: string; handle: string | null; platform: string | null; brand: string | null; product_name: string | null; rrp: number | null };

const rrp = (n: number | null) => n == null ? "—" : "$" + Math.round(n).toLocaleString("en-AU");
const mon = (k: string) => new Date(k + "-01T00:00:00").toLocaleDateString("en-AU", { month: "short", year: "2-digit" });

const meterColor = (used: number) => used >= 100 ? "#ef4444" : used >= 80 ? "#f59e0b" : "#6366f1";

function Bar({ used }: { used: number }) {
  const u = Math.min(100, Math.max(0, used));
  return (
    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${u}%`, background: meterColor(used) }} />
    </div>
  );
}

// Circular budget meter — the ring depletes as budget is used (full ring = full budget).
function Ring({ used, size = 96 }: { used: number; size?: number }) {
  const u = Math.min(100, Math.max(0, used));
  const left = Math.max(0, 100 - Math.round(used));
  const r = size / 2 - 8, c = 2 * Math.PI * r, off = c * (u / 100);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef2f6" strokeWidth="8" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={meterColor(used)} strokeWidth="8" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={off} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x={size / 2} y={size / 2 - 1} textAnchor="middle" fontSize="20" fontWeight="800" fill="#1c2733">{left}%</text>
      <text x={size / 2} y={size / 2 + 14} textAnchor="middle" fontSize="9.5" fontWeight="600" fill="#9aa6b4">left</text>
    </svg>
  );
}

export function TeamGiftingPanel() {
  const [data, setData] = useState<{ fyLabel: string; overall: { used_pct: number; left_pct: number }; brands: Brand[]; gifts: Gift[] } | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "needsSetup" | "error">("loading");

  useEffect(() => {
    fetch("/api/influencer/team").then(r => r.json()).then(d => {
      if (d.needsSetup) setState("needsSetup");
      else if (d.ok) { setData(d); setState("ready"); }
      else setState("error");
    }).catch(() => setState("error"));
  }, []);

  if (state === "loading") return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">Loading…</div>;
  if (state === "needsSetup") return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">Gifting isn’t set up yet. Ask an admin.</div>;
  if (state === "error" || !data) return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">Couldn’t load gifting.</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-semibold text-gray-800">Influencer Gifting</h2>
          <p className="text-xs text-gray-400 mt-0.5">{data.fyLabel} · budget shown as % · gift value is RRP</p>
        </div>
        <a href="/log-gift" target="_blank" className="text-xs font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-3 py-2">Log a gift ↗</a>
      </div>

      {/* Overall budget left */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-baseline justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-700">Budget remaining</h3>
          <span className="text-2xl font-bold text-slate-800">{data.overall.left_pct}% <span className="text-sm font-medium text-gray-400">left</span></span>
        </div>
        <Bar used={data.overall.used_pct} />
        <p className="text-[11px] text-gray-400 mt-1.5">{data.overall.used_pct}% of the FY gifting budget used across all brands</p>
      </div>

      {/* Per brand — cards with a budget meter */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Budget by brand</h3>
        {data.brands.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">No gifts logged yet.</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {data.brands.map(b => (
              <div key={b.brand} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col items-center text-center">
                <p className="text-sm font-semibold text-slate-700 truncate w-full" title={b.brand}>{b.brand}</p>
                <div className="my-2"><Ring used={b.used_pct} /></div>
                <div className="flex items-center gap-1.5 text-[11px]">
                  <span className="font-semibold" style={{ color: meterColor(b.used_pct) }}>{b.used_pct}% used</span>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">{b.gifts} gift{b.gifts === 1 ? "" : "s"} · {rrp(b.rrp_gifted)} RRP</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent gifts — RRP only */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Recent gifts</h3>
        {data.gifts.length === 0 ? (
          <p className="text-sm text-gray-400 py-3 text-center">No gifts logged yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400">
                  {["Month", "Influencer", "Brand", "Product", "RRP"].map(h => (
                    <th key={h} className={`${h === "RRP" ? "text-right" : "text-left"} font-semibold uppercase tracking-wide text-[10px] py-2 px-2`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.gifts.map((g, i) => (
                  <tr key={i} className="border-t border-gray-50">
                    <td className="py-1.5 px-2 text-gray-500">{mon(g.month_key)}</td>
                    <td className="py-1.5 px-2 text-slate-700">{g.handle}{g.platform ? <span className="text-gray-400"> · {g.platform}</span> : ""}</td>
                    <td className="py-1.5 px-2 text-slate-600">{g.brand ?? "—"}</td>
                    <td className="py-1.5 px-2 text-slate-600 max-w-[220px] truncate" title={g.product_name ?? ""}>{g.product_name ?? "—"}</td>
                    <td className="py-1.5 px-2 text-right font-semibold text-slate-800">{rrp(g.rrp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
