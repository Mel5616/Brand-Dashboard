"use client";

import { useEffect, useMemo, useState } from "react";
import { fmtFull } from "@/lib/format";

type Code = {
  brand_id: number; code: string; usage_count: number; value_type: string | null; value: number | null;
  starts_at: string | null; ends_at: string | null; status: "active" | "expired" | "scheduled";
};
type Brand = { id: number; name: string };

const dMY = (s: string | null) => s ? new Date(s + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "—";
const STATUS_CLS: Record<Code["status"], string> = {
  active: "bg-emerald-100 text-emerald-700", expired: "bg-gray-100 text-gray-500", scheduled: "bg-amber-100 text-amber-700",
};
const PER_BRAND = 8;

export function DiscountCodesTab({ brands }: { brands: Brand[] }) {
  const [codes, setCodes] = useState<Code[] | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "all">("active");

  useEffect(() => {
    fetch("/api/discount-codes", { cache: "no-store" }).then(r => r.json()).then(d => {
      if (d.needsSetup) setNeedsSetup(true); else if (d.ok) setCodes(d.codes ?? []);
    }).catch(() => {});
  }, []);

  const byBrand = useMemo(() => {
    if (!codes) return [];
    return brands.map(b => {
      const list = codes
        .filter(c => c.brand_id === b.id)
        .filter(c => statusFilter === "all" || c.status !== "expired")
        .filter(c => !q || c.code.toLowerCase().includes(q.toLowerCase()))
        // Used codes first (most-used at top) — an active code nobody's
        // used yet isn't wrong to show, just not worth leading with.
        .sort((a, b2) => b2.usage_count - a.usage_count)
        .slice(0, PER_BRAND);
      return { brand: b, list };
    }).filter(g => g.list.length > 0);
  }, [codes, brands, statusFilter, q]);

  if (needsSetup) return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-500">
      Run <code className="bg-gray-100 px-1 rounded">add_shop_discount_codes_classification.sql</code> in Supabase, then the next sync fills this in.
    </div>
  );
  if (codes === null) return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Discount codes</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Main promotional codes only, top {PER_BRAND} per brand by usage — individual/one-off, bulk-affiliate and tradeshow codes are excluded.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setStatusFilter("active")} className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${statusFilter === "active" ? "bg-slate-800 text-white border-slate-800" : "bg-white text-gray-500 border-gray-200"}`}>Active only</button>
            <button onClick={() => setStatusFilter("all")} className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${statusFilter === "all" ? "bg-slate-800 text-white border-slate-800" : "bg-white text-gray-500 border-gray-200"}`}>Include expired</button>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search a code…" className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-300" />
          </div>
        </div>
      </div>

      {byBrand.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">No {statusFilter === "active" ? "active " : ""}main codes found.</div>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {byBrand.map(({ brand, list }) => (
            <div key={brand.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-600 mb-2">{brand.name}</p>
              <div className="divide-y divide-gray-50">
                {list.map(c => (
                  <div key={c.code} className="flex items-center gap-2 py-1.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[12px] font-semibold text-slate-700 truncate" title={c.code}>{c.code}</span>
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${STATUS_CLS[c.status]}`}>{c.status}</span>
                      </div>
                      <p className="text-[10.5px] text-gray-400">
                        {c.value ? (c.value_type === "percentage" ? `${Math.round(c.value)}% off` : `${fmtFull(c.value)} off`) : "—"} · ends {dMY(c.ends_at)}
                      </p>
                    </div>
                    <span className="text-[12px] font-bold text-slate-700 shrink-0 text-right" title="Uses">{c.usage_count.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
