"use client";

import { useEffect, useMemo, useState } from "react";
import { INFLUENCER_FY_MONTHS } from "@/lib/influencerFy";
import { compactNum } from "@/lib/num";

// Standalone gift-logging form for the marketing team. Shows RRP only — never
// any cost. Cost is computed server-side when the entry is saved.

type Product = { style_code: string; product_name: string; brand: string; rrp: number | null };

// Months of the influencer gifting financial year (shared with the admin tracker).
const FY_MONTHS = INFLUENCER_FY_MONTHS;
const BRANDS = ["UPPAbaby", "Gaia", "WonderFold", "SmarTrike", "Frida", "Nanit", "Hannie", "Magic", "Mamave", "Matchstick Monkey", "Zazu", "MiaMily"];
const PLATFORMS = ["Instagram", "TikTok", "YouTube", "Multiple", "Other"];

export default function LogGift() {
  const [products, setProducts] = useState<Product[]>([]);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const [batch, setBatch] = useState(0); // products logged in this multi-product session

  const [f, setF] = useState<any>({ month_key: FY_MONTHS[0].key, platform: "Instagram" });
  const [oneOff, setOneOff] = useState(false);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Product | null>(null);
  const [influencers, setInfluencers] = useState<any[]>([]);
  const [hFocus, setHFocus] = useState(false);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));

  useEffect(() => {
    fetch("/api/influencer/products").then(r => r.json()).then(d => {
      setNeedsSetup(!!d.needsSetup); setProducts(d.products ?? []);
    }).catch(() => {});
    fetch("/api/influencer/roster").then(r => r.json()).then(d => setInfluencers(d.influencers ?? [])).catch(() => {});
  }, []);

  const handleMatches = useMemo(() => {
    const q = (f.handle || "").trim().toLowerCase();
    if (!q || !hFocus) return [];
    return influencers.filter((i: any) => (i.handle || "").toLowerCase().includes(q) || (i.name || "").toLowerCase().includes(q)).slice(0, 6);
  }, [f.handle, influencers, hFocus]);
  function pickInfluencer(i: any) {
    setF((p: any) => ({ ...p, handle: i.handle, name: i.name ?? p.name, platform: i.platform ?? p.platform, followers: i.followers ?? p.followers }));
    setHFocus(false);
  }

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || picked) return [];
    return products.filter(p =>
      p.product_name.toLowerCase().includes(q) || (p.style_code || "").toLowerCase().includes(q)
    ).slice(0, 8);
  }, [search, products, picked]);

  function choose(p: Product) {
    setPicked(p); setSearch(p.product_name);
    setF((prev: any) => ({ ...prev, style_code: p.style_code, brand: p.brand, product_name: p.product_name, rrp: p.rrp ?? prev.rrp }));
  }
  function clearPick() { setPicked(null); setSearch(""); setF((p: any) => ({ ...p, style_code: undefined, product_name: undefined })); }

  const valid = f.month_key && f.handle && f.brand && (f.rrp != null && f.rrp !== "");

  async function submit(addAnother = false) {
    if (!valid) return;
    setSaving(true); setErr("");
    const body = { ...f, rrp: Number(f.rrp), influencer_cost: f.influencer_cost ? Number(f.influencer_cost) : 0 };
    const res = await fetch("/api/influencer/entries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json()).catch(() => null);
    setSaving(false);
    if (res?.ok) {
      if (addAnother) {
        // Keep the influencer + month; clear just the product (and the cash fee, so it
        // isn't counted again for the same collaboration) so the next product is quick.
        setBatch(b => b + 1); setPicked(null); setSearch(""); setOneOff(false);
        setF((p: any) => ({ month_key: p.month_key, name: p.name, handle: p.handle, platform: p.platform, followers: p.followers, profile_url: p.profile_url, campaign: p.campaign }));
      } else setDone(true);
    }
    else if (res?.needsSetup) setNeedsSetup(true);
    else setErr("Couldn't save — please try again.");
  }

  const input = "mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-300";
  const label = "text-[12px] font-semibold text-gray-500";

  if (needsSetup) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 max-w-md text-center">
        <p className="text-gray-700 font-medium">Not set up yet</p>
        <p className="text-sm text-gray-400 mt-1">The influencer tracker tables haven’t been created. Ask the admin to finish setup.</p>
      </div>
    </div>
  );

  if (done) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-md text-center">
        <div className="text-4xl mb-2">✅</div>
        <p className="text-lg font-semibold text-gray-800">Influencer added</p>
        <p className="text-sm text-gray-400 mt-1">Thanks! Your entry has been recorded.</p>
        <button onClick={() => { setDone(false); setBatch(0); setPicked(null); setSearch(""); setF({ month_key: f.month_key, platform: "Instagram" }); }}
          className="mt-5 text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-5 py-2.5">Log another</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-md mx-auto">
        <h1 className="text-xl font-bold text-gray-800">Add an influencer</h1>
        <p className="text-sm text-gray-400 mt-0.5 mb-5">Add the influencer, the product gifted and its RRP.</p>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
          {/* Product picker */}
          {!oneOff ? (
            <div className="relative">
              <label className={label}>Product</label>
              <div className="flex gap-2 mt-1">
                <input value={search} onChange={e => { setSearch(e.target.value); if (picked) clearPick(); }} placeholder="Search name or SKU…"
                  className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                {picked && <button onClick={clearPick} className="text-xs text-gray-400 px-2">clear</button>}
              </div>
              {matches.length > 0 && (
                <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                  {matches.map(p => (
                    <button key={p.style_code} onClick={() => choose(p)} className="w-full text-left px-3 py-2 hover:bg-emerald-50 border-b border-gray-50 last:border-0">
                      <p className="text-sm text-slate-700">{p.product_name}</p>
                      <p className="text-[11px] text-gray-400">{p.brand} · {p.style_code}{p.rrp != null ? ` · RRP $${p.rrp}` : ""}</p>
                    </button>
                  ))}
                </div>
              )}
              {picked && <p className="text-[12px] text-gray-500 mt-1.5">{[picked.brand, `RRP $${picked.rrp ?? "—"}`].filter(Boolean).join(" · ")}</p>}
              {picked && !f.brand && (
                <div className="mt-2">
                  <label className={label}>Brand <span className="text-rose-400 font-normal">(needed to log)</span></label>
                  <select value={f.brand ?? ""} onChange={e => set("brand", e.target.value)} className={input}>
                    <option value="">Select brand…</option>
                    {BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              )}
              <button onClick={() => { setOneOff(true); clearPick(); }} className="text-[11px] text-emerald-600 hover:underline mt-2">Can’t find it? Enter manually</button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>Brand</label>
                <select value={f.brand ?? ""} onChange={e => set("brand", e.target.value)} className={input}>
                  <option value="">Select…</option>
                  {BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div className="flex items-end">
                <button onClick={() => { setOneOff(false); set("brand", undefined); }} className="text-[11px] text-emerald-600 hover:underline pb-3">Back to product search</button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>RRP (incl GST)</label>
              <input type="number" inputMode="decimal" value={f.rrp ?? ""} onChange={e => set("rrp", e.target.value)} placeholder="$" className={input} />
            </div>
            <div>
              <label className={label}>Month</label>
              <select value={f.month_key} onChange={e => set("month_key", e.target.value)} className={input}>
                {FY_MONTHS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Name</label>
              <input value={f.name ?? ""} onChange={e => set("name", e.target.value)} placeholder="e.g. Sarah Mum" className={input} />
            </div>
            <div className="relative">
              <label className={label}>Handle</label>
              <input value={f.handle ?? ""} onChange={e => { set("handle", e.target.value); setHFocus(true); }} onFocus={() => setHFocus(true)} onBlur={() => setTimeout(() => setHFocus(false), 150)} placeholder="@handle" className={input} />
              {handleMatches.length > 0 && (
                <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                  {handleMatches.map((i: any) => (
                    <button key={i.handle} onMouseDown={e => { e.preventDefault(); pickInfluencer(i); }} className="w-full text-left px-3 py-2 hover:bg-emerald-50 border-b border-gray-50 last:border-0">
                      <p className="text-sm text-slate-700">{i.handle}{i.name ? <span className="text-gray-400"> · {i.name}</span> : ""}</p>
                      {(i.platform || i.followers) && <p className="text-[11px] text-gray-400">{[i.platform, i.followers ? `${compactNum(Number(i.followers))} followers` : ""].filter(Boolean).join(" · ")}</p>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Platform</label>
              <select value={f.platform} onChange={e => set("platform", e.target.value)} className={input}>
                {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Followers</label>
              <input value={f.followers ?? ""} onChange={e => set("followers", e.target.value)} placeholder="e.g. 45,000 or 67.6K" className={input} />
            </div>
          </div>

          <div>
            <label className={label}>Instagram / profile URL <span className="text-gray-300 font-normal">(optional)</span></label>
            <input value={f.profile_url ?? ""} onChange={e => set("profile_url", e.target.value)} placeholder="https://instagram.com/handle" className={input} />
          </div>

          <div>
            <label className={label}>Campaign / note <span className="text-gray-300 font-normal">(optional)</span></label>
            <input value={f.campaign ?? ""} onChange={e => set("campaign", e.target.value)} placeholder="e.g. EOFY launch" className={input} />
          </div>

          <div>
            <label className={label}>Cash fee paid <span className="text-gray-300 font-normal">(optional, excl GST)</span></label>
            <input type="number" inputMode="decimal" value={f.influencer_cost ?? ""} onChange={e => set("influencer_cost", e.target.value)} placeholder="$0" className={input} />
          </div>

          {err && <p className="text-[12px] text-rose-500">{err}</p>}
          {batch > 0 && <p className="text-[12px] text-emerald-600 font-medium">✓ {batch} product{batch > 1 ? "s" : ""} logged{f.handle ? ` for ${f.handle}` : ""} — add another below or finish.</p>}
          <div className="flex gap-2">
            <button onClick={() => submit(true)} disabled={!valid || saving}
              className="flex-1 text-sm font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-40 rounded-lg py-3">
              + Add another product
            </button>
            <button onClick={() => submit(false)} disabled={!valid || saving}
              className="flex-1 text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 rounded-lg py-3">
              {saving ? "Saving…" : batch > 0 ? "Add & finish" : "Add influencer"}
            </button>
          </div>
          <p className="text-[11px] text-gray-300 text-center">Multiple products for one influencer? Use “Add another product”. Gift value is tracked for budgeting automatically.</p>
        </div>
      </div>
    </div>
  );
}
