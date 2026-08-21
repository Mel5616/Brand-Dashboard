"use client";

import { useEffect, useMemo, useState } from "react";

// Influencer Agreements — one register across all 12 brands, so two brand
// managers can't gift the same creator in the same month without seeing it.
// Coolkidz Australia Pty Ltd is the contracting party on every agreement,
// never the brand. Public signing at /agreement/[token], emailed from
// partnerships@coolkidz.com.au. See src/lib/agreementTemplate.ts for the
// clause text and src/app/api/influencer-agreements/route.ts for the API.

// Who can be the "Coolkidz Representative" on an agreement — marks who
// actually made it, so that name (not always Mel's) shows on the signed doc.
const REPRESENTATIVES = [
  { name: "Melanie Kingsford", position: "Marketing Director" },
  { name: "Nicky O'Brien", position: "Social" },
  { name: "Alicia Lambert", position: "Social" },
];

type Influencer = { id: string; full_name: string; email: string; phone: string | null; instagram_handle: string | null; tiktok_handle: string | null; address_line1: string | null; address_line2: string | null; suburb: string | null; state: string | null; postcode: string | null; is_po_box: boolean; abn: string | null };
type Product = { id?: string; product_name: string; variant: string | null; quantity: number; rrp: number | null; cost_price: number | null };
type Deliverable = {
  id?: string; deliverable_type: string; platform: string; quantity: number; due_date: string | null; status: string; live_url: string | null;
  reach: number | null; engagement: number | null; shares: number | null; saves: number | null; new_followers: number | null;
};
type Agreement = {
  id: string; reference: string; status: string; agreement_type: string; campaign_name: string | null;
  agreement_date: string | null; token: string; brand_id: number; brands: { id: number; name: string };
  influencers: Influencer; content_due_days: number; minimum_live_period_months: number;
  exclusivity_applies: boolean; exclusivity_category: string | null; exclusivity_months: number; exclusivity_end_date: string | null;
  usage_term_months: number; usage_paid_media: boolean; usage_retail_partners: boolean; usage_print: boolean; usage_original_files: boolean;
  discount_code: string | null; sent_at: string | null; signed_at: string | null; signed_name: string | null;
  order_sheet_approved_at: string | null; order_sheet_approved_by: string | null; order_sheet_sent_at: string | null;
  influencer_agreement_products: Product[]; influencer_agreement_deliverables: Deliverable[];
};
type ExclRow = { agreement_id: string; reference: string; influencer_id: string; full_name: string; instagram_handle: string | null; brand: string; exclusivity_category: string; exclusivity_end_date: string; days_remaining: number };
type OverdueRow = { id: string; reference: string; brand: string; full_name: string; email: string; deliverable_type: string; quantity: number; due_date: string; days_overdue: number };
type RoiRow = { brand: string; agreements: number; total_rrp_gifted: number; total_cost_gifted: number; total_reach: number; total_engagement: number; total_shares: number; total_saves: number; total_new_followers: number };
type BrandConfig = { brand_id: number; code: string; tier: string | null; instagram_handle: string | null; exclusivity_category: string | null; naming_rule: string | null };
type CatalogProduct = { style_code: string; product_name: string; brand: string; rrp: number | null };

const AGREEMENT_TYPES: Record<string, string> = { gifted_social: "Gifted collaboration", ugc_only: "UGC licence (no posting)", event_attendance: "Event attendance" };
const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-slate-100 text-slate-500" },
  sent: { label: "Sent", cls: "bg-sky-100 text-sky-700" },
  signed: { label: "Signed", cls: "bg-emerald-100 text-emerald-700" },
  terminated: { label: "Terminated", cls: "bg-rose-100 text-rose-600" },
};
const inp = "text-sm border border-gray-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400";
const fmtD = (s: string | null) => s ? new Date(s + (s.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "2-digit" }) : "—";
const fmtMoney = (n: number | null | undefined) => n == null ? "—" : `$${Number(n).toLocaleString("en-AU", { maximumFractionDigits: 0 })}`;

const emptyProduct: Product = { product_name: "", variant: "", quantity: 1, rrp: null, cost_price: null };
const emptyDeliverable: Deliverable = { deliverable_type: "grid post", platform: "Instagram", quantity: 1, due_date: null, status: "pending", live_url: null, reach: null, engagement: null, shares: null, saves: null, new_followers: null };
const emptyInfluencer = { full_name: "", email: "", phone: "", instagram_handle: "", tiktok_handle: "", address_line1: "", address_line2: "", suburb: "", state: "", postcode: "", is_po_box: false, abn: "" };
const emptyForm = {
  brand_id: "", agreement_type: "gifted_social", campaign_name: "", agreement_date: new Date().toISOString().slice(0, 10),
  content_due_days: 21, minimum_live_period_months: 6, exclusivity_applies: true, exclusivity_category: "", exclusivity_months: 6,
  usage_term_months: 12, usage_paid_media: false, usage_retail_partners: false, usage_print: false, usage_original_files: false,
  discount_code: "", discount_start: "", discount_end: "", representative_name: "Melanie Kingsford", representative_position: "Marketing Director",
};

export function InfluencerAgreements({ brands: brandsIn, admin = false }: { brands: { id: number; name: string }[]; admin?: boolean }) {
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [overdue, setOverdue] = useState<OverdueRow[]>([]);
  const [exclusivity, setExclusivity] = useState<ExclRow[]>([]);
  const [roi, setRoi] = useState<RoiRow[]>([]);
  const [brandConfig, setBrandConfig] = useState<BrandConfig[]>([]);
  const brands = useMemo(() => brandsIn.map(b => {
    const c = brandConfig.find(x => x.brand_id === b.id);
    return { ...b, tier: c?.tier ?? undefined, exclusivity_category: c?.exclusivity_category ?? undefined, instagram_handle: c?.instagram_handle ?? undefined, naming_rule: c?.naming_rule ?? undefined };
  }), [brandsIn, brandConfig]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [resultsOpenId, setResultsOpenId] = useState<string | null>(null);
  const [resultsDraft, setResultsDraft] = useState<{ reach: string; engagement: string; shares: string; saves: string; new_followers: string }>({ reach: "", engagement: "", shares: "", saves: "", new_followers: "" });
  const [brandF, setBrandF] = useState("");
  const [statusF, setStatusF] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [panel, setPanel] = useState<"agreements" | "exclusivity" | "overdue" | "roi">("agreements");

  const [infl, setInfl] = useState(emptyInfluencer);
  const [inflPick, setInflPick] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [products, setProducts] = useState<Product[]>([{ ...emptyProduct }]);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([{ ...emptyDeliverable }]);
  const [editId, setEditId] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [openProductRow, setOpenProductRow] = useState<number | null>(null);

  function load() {
    fetch("/api/influencer-agreements").then(r => r.json()).then(d => {
      if (d?.needsSetup) setNeedsSetup(true);
      else if (d?.ok) { setAgreements(d.agreements ?? []); setInfluencers(d.influencers ?? []); setOverdue(d.overdue ?? []); setExclusivity(d.exclusivity ?? []); setRoi(d.roi ?? []); setBrandConfig(d.brandConfig ?? []); }
    }).catch(() => {}).finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);
  // The real product catalogue (same list the gift-log form uses) — lets the
  // product field autocomplete with a real RRP instead of being typed blind.
  useEffect(() => { fetch("/api/influencer/products").then(r => r.json()).then(d => setCatalog(d?.products ?? [])).catch(() => {}); }, []);
  const catalogMatches = (q: string, brandName?: string) => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    const inBrand = brandName ? catalog.filter(p => p.brand?.toLowerCase() === brandName.toLowerCase()) : catalog;
    const pool = inBrand.length ? inBrand : catalog; // fall back to the full catalogue if this brand has no matches
    return pool.filter(p => p.product_name.toLowerCase().includes(s) || p.style_code.toLowerCase().includes(s)).slice(0, 8);
  };

  const selectedBrand = brands.find(b => String(b.id) === form.brand_id);
  // Brand-select prefills exclusivity category + a tier-based month suggestion
  // (README recommendation: 90 days Tier C, 6 months A/B — a starting point,
  // not enforced).
  function pickBrand(id: string) {
    const b = brands.find(x => String(x.id) === id);
    setForm(f => ({ ...f, brand_id: id, exclusivity_category: b?.exclusivity_category ?? "", exclusivity_months: b?.tier === "C" ? 3 : 6 }));
  }
  function pickInfluencer(id: string) {
    setInflPick(id);
    if (!id) { setInfl(emptyInfluencer); return; }
    const i = influencers.find(x => x.id === id);
    if (i) setInfl({ full_name: i.full_name, email: i.email, phone: i.phone ?? "", instagram_handle: i.instagram_handle ?? "", tiktok_handle: i.tiktok_handle ?? "", address_line1: i.address_line1 ?? "", address_line2: i.address_line2 ?? "", suburb: i.suburb ?? "", state: i.state ?? "", postcode: i.postcode ?? "", is_po_box: i.is_po_box, abn: i.abn ?? "" });
  }

  // Conflict check: same influencer already locked into an overlapping
  // category elsewhere — warns, never blocks (a call the admin can make).
  const conflicts = useMemo(() => {
    if (!inflPick || !form.exclusivity_category) return [];
    return exclusivity.filter(x => x.influencer_id === inflPick && x.exclusivity_category.toLowerCase() === form.exclusivity_category.toLowerCase());
  }, [inflPick, form.exclusivity_category, exclusivity]);

  function resetForm() {
    setInfl(emptyInfluencer); setInflPick(""); setForm(emptyForm); setEditId(null);
    setProducts([{ ...emptyProduct }]); setDeliverables([{ ...emptyDeliverable }]);
  }

  function startEdit(a: Agreement) {
    const i = a.influencers;
    setInfl({ full_name: i.full_name, email: i.email, phone: i.phone ?? "", instagram_handle: i.instagram_handle ?? "", tiktok_handle: i.tiktok_handle ?? "", address_line1: i.address_line1 ?? "", address_line2: i.address_line2 ?? "", suburb: i.suburb ?? "", state: i.state ?? "", postcode: i.postcode ?? "", is_po_box: i.is_po_box, abn: i.abn ?? "" });
    setInflPick(i.id);
    setForm({
      brand_id: String(a.brand_id), agreement_type: a.agreement_type, campaign_name: a.campaign_name ?? "",
      agreement_date: (a.agreement_date ?? "").slice(0, 10) || new Date().toISOString().slice(0, 10),
      content_due_days: a.content_due_days, minimum_live_period_months: a.minimum_live_period_months,
      exclusivity_applies: a.exclusivity_applies, exclusivity_category: a.exclusivity_category ?? "", exclusivity_months: a.exclusivity_months,
      usage_term_months: a.usage_term_months, usage_paid_media: a.usage_paid_media, usage_retail_partners: a.usage_retail_partners, usage_print: a.usage_print, usage_original_files: a.usage_original_files,
      discount_code: a.discount_code ?? "", discount_start: "", discount_end: "",
      representative_name: "", representative_position: "",
    });
    setProducts(a.influencer_agreement_products?.length ? a.influencer_agreement_products.map(p => ({ ...p })) : [{ ...emptyProduct }]);
    setDeliverables(a.influencer_agreement_deliverables?.length ? a.influencer_agreement_deliverables.map(d => ({ ...d, due_date: (d.due_date ?? "").slice(0, 10) || null })) : [{ ...emptyDeliverable }]);
    setEditId(a.id);
    setShowForm(true);
    setExpanded(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveEdit() {
    setMsg("");
    if (!form.brand_id) return setMsg("Pick a brand.");
    if (!infl.full_name.trim() || !infl.email.trim()) return setMsg("Influencer name and email are required.");
    const body = { id: editId, action: "update", influencer: infl, ...form, products, deliverables: deliverables.map(d => ({ ...d, due_date: d.due_date || null })) };
    const d = await fetch("/api/influencer-agreements", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json()).catch(() => null);
    if (d?.ok) { setShowForm(false); resetForm(); load(); setMsg("Draft updated."); }
    else setMsg(d?.error || "Couldn't save changes.");
  }

  async function create(draft: boolean) {
    setMsg("");
    if (!form.brand_id) return setMsg("Pick a brand.");
    if (!infl.full_name.trim() || !infl.email.trim()) return setMsg("Influencer name and email are required.");
    if (!draft && form.agreement_type !== "ugc_only" && form.exclusivity_applies && !form.exclusivity_category.trim())
      return setMsg("Exclusivity category is required before sending (or turn exclusivity off for this agreement).");
    const body = { draft, influencer: infl, ...form, products, deliverables: deliverables.map(d => ({ ...d, due_date: d.due_date || null })) };
    const d = await fetch("/api/influencer-agreements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json()).catch(() => null);
    if (d?.ok) {
      setShowForm(false); resetForm(); load();
      if (draft) setMsg("Saved as draft — nothing sent yet. Open it and hit Send when you're happy.");
      else setMsg(d.emailed ? `Signing link emailed to ${infl.email}.` : `Created, but the email failed (${d.emailError || "check RESEND_API_KEY"}) — use Resend on the row.`);
    } else setMsg(d?.error || "Couldn't create the agreement.");
  }
  async function act(id: string, action: string) {
    setBusyId(id);
    const d = await fetch("/api/influencer-agreements", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }) }).then(r => r.json()).catch(() => null);
    setBusyId(null);
    if (d?.ok) { load(); if (action === "send" || action === "resend") setMsg(d.emailed ? "Signing link emailed." : `Email failed (${d.emailError || "check RESEND_API_KEY"}).`); }
    else setMsg(d?.error || "Action failed.");
  }
  async function updateDeliverable(agreementId: string, deliverableId: string, fields: Record<string, any>) {
    await fetch("/api/influencer-agreements", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: agreementId, action: "deliverable", deliverable_id: deliverableId, ...fields }) });
    load();
  }

  const list = useMemo(() => agreements.filter(a => (!brandF || String(a.brand_id) === brandF) && (!statusF || a.status === statusF)), [agreements, brandF, statusF]);
  const kpis = {
    active: agreements.filter(a => a.status === "signed").length,
    awaiting: agreements.filter(a => a.status === "sent").length,
    overdue: overdue.length,
    locked: exclusivity.length,
  };

  if (loading) return <div className="p-6 text-center text-sm text-gray-400">Loading agreements…</div>;
  if (needsSetup) return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center text-sm text-gray-500">Run <code className="bg-gray-100 px-1 rounded">supabase/add_influencer_agreements.sql</code> to enable Influencer Agreements.</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[["Active agreements", kpis.active, "#10b981"], ["Awaiting signature", kpis.awaiting, "#0ea5e9"], ["Overdue content", kpis.overdue, "#f43f5e"], ["Exclusivity locks live", kpis.locked, "#f59e0b"]].map(([l, v, c]) => (
          <div key={String(l)} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
            <p className="text-[11px] font-medium text-gray-400 flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: String(c) }} />{l}</p>
            <p className="text-2xl font-bold text-slate-800 mt-1 leading-none">{v as number}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setShowForm(v => !v)} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-4 py-2">{showForm ? "Close" : "+ New agreement"}</button>
        {(["agreements", "exclusivity", "overdue", ...(admin ? (["roi"] as const) : [])] as const).map(p => (
          <button key={p} onClick={() => setPanel(p)} className={`text-[12.5px] font-semibold rounded-lg px-3 py-2 ${panel === p ? "bg-slate-800 text-white" : "bg-white border border-gray-200 text-slate-500 hover:border-slate-300"}`}>
            {p === "agreements" ? "Agreements" : p === "exclusivity" ? `Exclusivity locks (${exclusivity.length})` : p === "overdue" ? `Overdue (${overdue.length})` : "Gifting ROI"}
          </button>
        ))}
      </div>
      {msg && <p className="text-[13px] text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">{msg}</p>}

      {showForm && (
        <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm p-5 space-y-4">
          {editId && <p className="text-sm font-bold text-amber-600">Editing draft {agreements.find(a => a.id === editId)?.reference}</p>}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-600 mb-2">Influencer</p>
            <div className="grid sm:grid-cols-3 gap-2 mb-2">
              <select value={inflPick} onChange={e => pickInfluencer(e.target.value)} className={`${inp} sm:col-span-3`}>
                <option value="">— New influencer, or pick an existing one —</option>
                {influencers.map(i => <option key={i.id} value={i.id}>{i.full_name} · {i.email}{i.instagram_handle ? ` · @${i.instagram_handle}` : ""}</option>)}
              </select>
            </div>
            <div className="grid sm:grid-cols-3 gap-2">
              <input value={infl.full_name} onChange={e => setInfl(p => ({ ...p, full_name: e.target.value }))} placeholder="Full name *" className={inp} />
              <input value={infl.email} onChange={e => setInfl(p => ({ ...p, email: e.target.value }))} placeholder="Email *" className={inp} />
              <input value={infl.phone} onChange={e => setInfl(p => ({ ...p, phone: e.target.value }))} placeholder="Phone" className={inp} />
              <input value={infl.instagram_handle} onChange={e => setInfl(p => ({ ...p, instagram_handle: e.target.value }))} placeholder="Instagram handle" className={inp} />
              <input value={infl.tiktok_handle} onChange={e => setInfl(p => ({ ...p, tiktok_handle: e.target.value }))} placeholder="TikTok handle" className={inp} />
              <input value={infl.abn} onChange={e => setInfl(p => ({ ...p, abn: e.target.value }))} placeholder="ABN (if any)" className={inp} />
              <input value={infl.address_line1} onChange={e => setInfl(p => ({ ...p, address_line1: e.target.value }))} placeholder="Address line 1" className={`${inp} sm:col-span-2`} />
              <input value={infl.address_line2} onChange={e => setInfl(p => ({ ...p, address_line2: e.target.value }))} placeholder="Address line 2" className={inp} />
              <input value={infl.suburb} onChange={e => setInfl(p => ({ ...p, suburb: e.target.value }))} placeholder="Suburb" className={inp} />
              <input value={infl.state} onChange={e => setInfl(p => ({ ...p, state: e.target.value }))} placeholder="State" className={inp} />
              <input value={infl.postcode} onChange={e => setInfl(p => ({ ...p, postcode: e.target.value }))} placeholder="Postcode" className={inp} />
            </div>
            <label className="flex items-center gap-2 mt-2 text-[12.5px] text-amber-600">
              <input type="checkbox" checked={infl.is_po_box} onChange={e => setInfl(p => ({ ...p, is_po_box: e.target.checked }))} className="accent-amber-500" />
              This is a PO Box (can&apos;t ship — flag before sending)
            </label>
          </div>

          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-600 mb-2">Brand &amp; agreement</p>
            <div className="grid sm:grid-cols-3 gap-2">
              <select value={form.brand_id} onChange={e => pickBrand(e.target.value)} className={inp}>
                <option value="">Brand *</option>
                {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <select value={form.agreement_type} onChange={e => setForm(p => ({ ...p, agreement_type: e.target.value }))} className={inp}>
                {Object.entries(AGREEMENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <input value={form.campaign_name} onChange={e => setForm(p => ({ ...p, campaign_name: e.target.value }))} placeholder="Campaign (optional)" className={inp} />
              <input type="date" value={form.agreement_date} onChange={e => setForm(p => ({ ...p, agreement_date: e.target.value }))} className={inp} />
              <label className="flex items-center gap-1.5 text-[12.5px] text-slate-600">Content due <input type="number" min={1} value={form.content_due_days} onChange={e => setForm(p => ({ ...p, content_due_days: Number(e.target.value) }))} className={`${inp} w-16`} /> days</label>
              <label className="flex items-center gap-1.5 text-[12.5px] text-slate-600">Live for <input type="number" min={1} value={form.minimum_live_period_months} onChange={e => setForm(p => ({ ...p, minimum_live_period_months: Number(e.target.value) }))} className={`${inp} w-16`} /> months</label>
            </div>
            {selectedBrand?.instagram_handle && <p className="text-[11px] text-gray-400 mt-1.5">Tag {selectedBrand.instagram_handle} · {(selectedBrand as any).naming_rule ?? ""}</p>}
          </div>

          {AGREEMENT_TYPES[form.agreement_type] && form.agreement_type !== "ugc_only" && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-600 mb-2">Exclusivity</p>
              <label className="flex items-center gap-2 text-[12.5px] text-slate-600 mb-2">
                <input type="checkbox" checked={form.exclusivity_applies} onChange={e => setForm(p => ({ ...p, exclusivity_applies: e.target.checked }))} className="accent-emerald-500" />
                Applies to this agreement
              </label>
              {form.exclusivity_applies && (
                <div className="grid sm:grid-cols-3 gap-2">
                  <input value={form.exclusivity_category} onChange={e => setForm(p => ({ ...p, exclusivity_category: e.target.value }))} placeholder="Category *" className={`${inp} sm:col-span-2`} />
                  <label className="flex items-center gap-1.5 text-[12.5px] text-slate-600">Months <input type="number" min={1} value={form.exclusivity_months} onChange={e => setForm(p => ({ ...p, exclusivity_months: Number(e.target.value) }))} className={`${inp} w-16`} /></label>
                </div>
              )}
              {conflicts.length > 0 && (
                <div className="mt-2 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-[12.5px] text-rose-700">
                  ⚠ Conflict — {infl.full_name || "this influencer"} is already locked into <strong>{conflicts[0].exclusivity_category}</strong> for <strong>{conflicts[0].brand}</strong> until {fmtD(conflicts[0].exclusivity_end_date)} ({conflicts.length > 1 ? `+${conflicts.length - 1} more` : conflicts[0].reference}). You can still proceed — check with the other brand manager first.
                </div>
              )}
            </div>
          )}

          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-600 mb-2">Usage rights &amp; discount</p>
            <div className="flex flex-wrap gap-4 mb-2">
              <label className="flex items-center gap-1.5 text-[12.5px] text-slate-600">Licence term <input type="number" min={1} value={form.usage_term_months} onChange={e => setForm(p => ({ ...p, usage_term_months: Number(e.target.value) }))} className={`${inp} w-16`} /> months</label>
              <label className="flex items-center gap-1.5 text-[12.5px] text-slate-600 cursor-pointer"><input type="checkbox" checked={form.usage_paid_media} onChange={e => setForm(p => ({ ...p, usage_paid_media: e.target.checked }))} className="accent-emerald-500" />Paid amplification</label>
              <label className="flex items-center gap-1.5 text-[12.5px] text-slate-600 cursor-pointer"><input type="checkbox" checked={form.usage_retail_partners} onChange={e => setForm(p => ({ ...p, usage_retail_partners: e.target.checked }))} className="accent-emerald-500" />Trade and retail use</label>
              <label className="flex items-center gap-1.5 text-[12.5px] text-slate-600 cursor-pointer"><input type="checkbox" checked={form.usage_print} onChange={e => setForm(p => ({ ...p, usage_print: e.target.checked }))} className="accent-emerald-500" />Print rights</label>
              <label className="flex items-center gap-1.5 text-[12.5px] text-slate-600 cursor-pointer"><input type="checkbox" checked={form.usage_original_files} onChange={e => setForm(p => ({ ...p, usage_original_files: e.target.checked }))} className="accent-emerald-500" />Supply of original files</label>
            </div>
            <div className="grid sm:grid-cols-3 gap-2">
              <input value={form.discount_code} onChange={e => setForm(p => ({ ...p, discount_code: e.target.value }))} placeholder="Discount code (optional)" className={inp} />
              {form.discount_code && <>
                <input type="date" value={form.discount_start} onChange={e => setForm(p => ({ ...p, discount_start: e.target.value }))} className={inp} />
                <input type="date" value={form.discount_end} onChange={e => setForm(p => ({ ...p, discount_end: e.target.value }))} className={inp} />
              </>}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-600">Products gifted</p>
              <button onClick={() => setProducts(p => [...p, { ...emptyProduct }])} className="text-[12px] font-semibold text-emerald-600">+ Add product</button>
            </div>
            <div className="space-y-2">
              {products.map((p, i) => {
                const matches = openProductRow === i ? catalogMatches(p.product_name, selectedBrand?.name) : [];
                return (
                <div key={i} className="grid grid-cols-[1fr_1fr_60px_90px_90px_24px] gap-2 items-center relative">
                  <div className="relative">
                    <input value={p.product_name}
                      onChange={e => { setProducts(ps => ps.map((x, j) => j === i ? { ...x, product_name: e.target.value } : x)); setOpenProductRow(i); }}
                      onFocus={() => setOpenProductRow(i)} onBlur={() => setTimeout(() => setOpenProductRow(o => o === i ? null : o), 150)}
                      placeholder="Product * — search the catalogue" className={inp} autoComplete="off" />
                    {matches.length > 0 && (
                      <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                        {matches.map(m => (
                          <button key={m.style_code} type="button"
                            onMouseDown={() => { setProducts(ps => ps.map((x, j) => j === i ? { ...x, product_name: m.product_name, rrp: m.rrp } : x)); setOpenProductRow(null); }}
                            className="w-full text-left px-3 py-2 text-[12.5px] hover:bg-emerald-50 border-b border-gray-50 last:border-0">
                            <div className="font-semibold text-slate-700">{m.product_name}</div>
                            <div className="text-gray-400 text-[11px]">{m.brand} · {m.style_code} · RRP {m.rrp != null ? `$${m.rrp}` : "—"}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <input value={p.variant ?? ""} onChange={e => setProducts(ps => ps.map((x, j) => j === i ? { ...x, variant: e.target.value } : x))} placeholder="Variant" className={inp} />
                  <input type="number" min={1} value={p.quantity} onChange={e => setProducts(ps => ps.map((x, j) => j === i ? { ...x, quantity: Number(e.target.value) } : x))} className={inp} />
                  <input type="number" value={p.rrp ?? ""} onChange={e => setProducts(ps => ps.map((x, j) => j === i ? { ...x, rrp: e.target.value === "" ? null : Number(e.target.value) } : x))} placeholder="RRP" className={inp} />
                  {admin && <input type="number" value={p.cost_price ?? ""} onChange={e => setProducts(ps => ps.map((x, j) => j === i ? { ...x, cost_price: e.target.value === "" ? null : Number(e.target.value) } : x))} placeholder="Cost" className={inp} title="Admin only, never shown to the influencer" />}
                  {products.length > 1 && <button onClick={() => setProducts(ps => ps.filter((_, j) => j !== i))} className="text-gray-300 hover:text-rose-500">✕</button>}
                </div>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-600">Deliverables</p>
              <button onClick={() => setDeliverables(d => [...d, { ...emptyDeliverable }])} className="text-[12px] font-semibold text-emerald-600">+ Add deliverable</button>
            </div>
            <div className="space-y-2">
              {deliverables.map((d, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_60px_130px_24px] gap-2 items-center">
                  <input value={d.deliverable_type} onChange={e => setDeliverables(ds => ds.map((x, j) => j === i ? { ...x, deliverable_type: e.target.value } : x))} placeholder="e.g. reel, grid post *" className={inp} />
                  <select value={d.platform} onChange={e => setDeliverables(ds => ds.map((x, j) => j === i ? { ...x, platform: e.target.value } : x))} className={inp}>
                    {["Instagram", "TikTok", "YouTube", "delivered to Coolkidz"].map(p => <option key={p}>{p}</option>)}
                  </select>
                  <input type="number" min={1} value={d.quantity} onChange={e => setDeliverables(ds => ds.map((x, j) => j === i ? { ...x, quantity: Number(e.target.value) } : x))} className={inp} />
                  <input type="date" value={d.due_date ?? ""} onChange={e => setDeliverables(ds => ds.map((x, j) => j === i ? { ...x, due_date: e.target.value } : x))} placeholder="Due (default per above)" className={inp} />
                  {deliverables.length > 1 && <button onClick={() => setDeliverables(ds => ds.filter((_, j) => j !== i))} className="text-gray-300 hover:text-rose-500">✕</button>}
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-600 mb-2">Signed on Coolkidz&apos;s behalf by</p>
            <div className="grid sm:grid-cols-2 gap-2">
              <select
                value={REPRESENTATIVES.some(r => r.name === form.representative_name) ? form.representative_name : "__other__"}
                onChange={e => {
                  const rep = REPRESENTATIVES.find(r => r.name === e.target.value);
                  if (rep) setForm(p => ({ ...p, representative_name: rep.name, representative_position: rep.position }));
                  else setForm(p => ({ ...p, representative_name: "" }));
                }}
                className={inp}
              >
                {REPRESENTATIVES.map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
                <option value="__other__">Other…</option>
              </select>
              <input value={form.representative_position} onChange={e => setForm(p => ({ ...p, representative_position: e.target.value }))} placeholder="Position" className={inp} />
            </div>
            {!REPRESENTATIVES.some(r => r.name === form.representative_name) && (
              <input value={form.representative_name} onChange={e => setForm(p => ({ ...p, representative_name: e.target.value }))} placeholder="Representative name" className={`${inp} mt-2`} />
            )}
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {editId ? (
              <button onClick={saveEdit} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-5 py-2.5">Save changes</button>
            ) : (
              <>
                <button onClick={() => create(true)} className="text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg px-5 py-2.5">Save as draft · preview first</button>
                <button onClick={() => create(false)} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-5 py-2.5">Create &amp; email agreement</button>
              </>
            )}
            <button onClick={() => { setShowForm(false); resetForm(); }} className="text-sm font-semibold text-gray-400 hover:text-gray-600 rounded-lg px-3 py-2.5">Cancel</button>
          </div>
        </div>
      )}

      {panel === "agreements" && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <select value={brandF} onChange={e => setBrandF(e.target.value)} className={inp}>
              <option value="">All brands</option>
              {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <select value={statusF} onChange={e => setStatusF(e.target.value)} className={inp}>
              <option value="">All statuses</option>
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                    <th className="text-left px-5 py-2.5">Reference</th>
                    <th className="text-left px-3 py-2.5">Influencer</th>
                    <th className="text-left px-3 py-2.5">Brand · type</th>
                    <th className="text-left px-3 py-2.5">Status</th>
                    <th className="text-right px-3 py-2.5">Sent / Signed</th>
                    <th className="text-right px-5 py-2.5">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {list.length === 0 && <tr><td colSpan={6} className="px-5 py-10 text-center text-gray-300">No agreements yet — create the first one above.</td></tr>}
                  {list.map((a, i) => {
                    const st = STATUS[a.status] ?? STATUS.draft;
                    const isOpen = expanded === a.id;
                    return (
                      <>
                        <tr key={a.id} className={`border-b border-gray-50 last:border-0 cursor-pointer ${i % 2 === 1 ? "bg-gray-50/50" : ""}`} onClick={() => setExpanded(isOpen ? null : a.id)}>
                          <td className="px-5 py-2.5 font-semibold text-slate-700">{a.reference}</td>
                          <td className="px-3 py-2.5 text-[12.5px] text-slate-600">{a.influencers?.full_name}<p className="text-[11px] text-gray-400">{a.influencers?.email}</p></td>
                          <td className="px-3 py-2.5 text-[12.5px] text-slate-600">{a.brands?.name}<p className="text-[11px] text-gray-400">{AGREEMENT_TYPES[a.agreement_type]}{a.campaign_name ? ` · ${a.campaign_name}` : ""}</p></td>
                          <td className="px-3 py-2.5"><span className={`text-[10.5px] font-bold rounded-full px-2 py-0.5 ${st.cls}`}>{st.label}</span></td>
                          <td className="px-3 py-2.5 text-right text-[12px] text-gray-400">{fmtD(a.signed_at || a.sent_at)}</td>
                          <td className="px-5 py-2.5 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                            {a.status === "draft" && <button disabled={busyId === a.id} onClick={() => act(a.id, "send")} className="text-[12px] font-semibold text-emerald-600 hover:underline mr-2.5 disabled:opacity-50">Send</button>}
                            {a.status === "draft" && <button onClick={() => startEdit(a)} className="text-[12px] font-semibold text-amber-600 hover:underline mr-2.5">Edit</button>}
                            {a.status === "sent" && <button disabled={busyId === a.id} onClick={() => act(a.id, "resend")} className="text-[12px] font-semibold text-sky-600 hover:underline mr-2.5 disabled:opacity-50">Resend</button>}
                            {(a.status === "draft" || a.status === "sent") && <a href={`/agreement/${a.token}`} target="_blank" rel="noreferrer" className="text-[12px] font-semibold text-violet-600 hover:underline mr-2.5">👁 View</a>}
                            {a.status === "sent" && <button onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/agreement/${a.token}`); setMsg("Signing link copied."); }} className="text-[12px] font-semibold text-slate-500 hover:underline mr-2.5">⧉ Link</button>}
                            {(a.status === "draft" || a.status === "sent") && <button disabled={busyId === a.id} onClick={() => act(a.id, "void")} className="text-[12px] font-semibold text-gray-400 hover:underline mr-2.5 disabled:opacity-50">Void</button>}
                            {a.status === "signed" && admin && <button disabled={busyId === a.id} onClick={() => { if (confirm(`Terminate ${a.reference}? The signed record is kept.`)) act(a.id, "terminate"); }} className="text-[12px] font-semibold text-rose-500 hover:underline disabled:opacity-50 mr-2.5">Terminate</button>}
                            <a href={`/api/influencer-agreements/order-sheet?id=${a.id}`} target="_blank" rel="noreferrer" className="text-[12px] font-semibold text-teal-600 hover:underline mr-2.5" title="Printable order sheet — name, delivery address, products, for invoicing or Shopify entry">🖨 Order sheet</a>
                            {a.status === "signed" && (a.order_sheet_approved_at
                              ? <span className="text-[11px] font-semibold text-emerald-600" title={`Approved by ${a.order_sheet_approved_by || "—"}`}>✓ Sent to Accounts {fmtD(a.order_sheet_sent_at)}</span>
                              : admin
                                ? <button disabled={busyId === a.id} onClick={() => { if (confirm(`Approve the gift order sheet for ${a.reference} and email it to orders@coolkidz.com.au?`)) act(a.id, "approve_order_sheet"); }} className="text-[12px] font-semibold text-white bg-amber-500 hover:bg-amber-600 rounded-md px-2 py-1 disabled:opacity-50">Approve & send</button>
                                : <span className="text-[11px] font-semibold text-amber-600">⏳ Awaiting approval</span>)}
                          </td>
                        </tr>
                        {isOpen && (
                          <tr key={`${a.id}-detail`} className="bg-slate-50/70">
                            <td colSpan={6} className="px-6 py-4">
                              <div className="grid sm:grid-cols-2 gap-4 text-[12.5px]">
                                <div>
                                  <p className="font-bold text-slate-600 mb-1">Products</p>
                                  {a.influencer_agreement_products?.length ? a.influencer_agreement_products.map((p, j) => (
                                    <p key={j} className="text-slate-600">{p.quantity} x {p.product_name}{p.variant ? ` (${p.variant})` : ""} — RRP {fmtMoney(p.rrp)}{admin && p.cost_price != null ? ` · cost ${fmtMoney(p.cost_price)}` : ""}</p>
                                  )) : <p className="text-gray-400">—</p>}
                                  {a.exclusivity_applies && <p className="text-slate-600 mt-2"><strong>Exclusivity:</strong> {a.exclusivity_category} until {fmtD(a.exclusivity_end_date)}</p>}
                                  <p className="text-slate-600 mt-1"><strong>Usage rights:</strong> {a.usage_term_months}mo · {[a.usage_paid_media && "paid amplification", a.usage_retail_partners && "trade/retail", a.usage_print && "print", a.usage_original_files && "original files"].filter(Boolean).join(", ") || "organic only"}</p>
                                  {a.signed_name && <p className="text-slate-600 mt-1"><strong>Signed by:</strong> {a.signed_name}</p>}
                                </div>
                                <div>
                                  <p className="font-bold text-slate-600 mb-1">Deliverables</p>
                                  {a.influencer_agreement_deliverables?.length ? a.influencer_agreement_deliverables.map(d => {
                                    const hasResults = [d.reach, d.engagement, d.shares, d.saves, d.new_followers].some(v => v != null);
                                    const isOpenR = resultsOpenId === d.id;
                                    return (
                                    <div key={d.id} className="mb-1.5">
                                      <div className="flex items-center gap-2">
                                        <select value={d.status} onChange={e => updateDeliverable(a.id, d.id!, { status: e.target.value })} className="text-[11px] border border-gray-200 rounded px-1.5 py-1">
                                          {["pending", "submitted", "live", "overdue", "waived"].map(s => <option key={s}>{s}</option>)}
                                        </select>
                                        <span className="text-slate-600">{d.quantity} x {d.deliverable_type} · {d.platform} · due {fmtD(d.due_date)}</span>
                                        {d.live_url && <a href={d.live_url} target="_blank" rel="noreferrer" className="text-emerald-600 hover:underline">link</a>}
                                        <button
                                          onClick={() => {
                                            if (isOpenR) { setResultsOpenId(null); return; }
                                            setResultsOpenId(d.id!);
                                            setResultsDraft({
                                              reach: d.reach?.toString() ?? "", engagement: d.engagement?.toString() ?? "",
                                              shares: d.shares?.toString() ?? "", saves: d.saves?.toString() ?? "", new_followers: d.new_followers?.toString() ?? "",
                                            });
                                          }}
                                          className={`text-[11px] font-semibold ${hasResults ? "text-slate-500" : "text-emerald-600"} hover:underline`}
                                        >
                                          {hasResults ? "results" : "+ results"}
                                        </button>
                                      </div>
                                      {isOpenR && (
                                        <div className="flex flex-wrap items-end gap-2 mt-1.5 ml-1 p-2 bg-white border border-gray-100 rounded-lg">
                                          {([["reach", "Reach"], ["engagement", "Engagement"], ["shares", "Shares"], ["saves", "Saves"], ["new_followers", "New followers"]] as const).map(([key, label]) => (
                                            <label key={key} className="text-[10px] text-gray-400">
                                              {label}
                                              <input
                                                type="number" inputMode="numeric" value={resultsDraft[key]}
                                                onChange={e => setResultsDraft(p => ({ ...p, [key]: e.target.value }))}
                                                className="block w-20 mt-0.5 text-[12px] border border-gray-200 rounded px-1.5 py-1"
                                              />
                                            </label>
                                          ))}
                                          <button
                                            onClick={() => { updateDeliverable(a.id, d.id!, resultsDraft); setResultsOpenId(null); }}
                                            className="text-[11px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded px-2.5 py-1.5"
                                          >
                                            Save
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  );
                                  }) : <p className="text-gray-400">—</p>}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {panel === "exclusivity" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100"><th className="text-left px-5 py-2.5">Influencer</th><th className="text-left px-3 py-2.5">Brand</th><th className="text-left px-3 py-2.5">Category</th><th className="text-right px-5 py-2.5">Until</th></tr></thead>
            <tbody>
              {exclusivity.length === 0 && <tr><td colSpan={4} className="px-5 py-10 text-center text-gray-300">No active exclusivity locks.</td></tr>}
              {exclusivity.map(x => (
                <tr key={x.agreement_id} className="border-b border-gray-50 last:border-0">
                  <td className="px-5 py-2.5 text-slate-700">{x.full_name}{x.instagram_handle && <span className="text-gray-400"> · @{x.instagram_handle}</span>}</td>
                  <td className="px-3 py-2.5 text-slate-600">{x.brand}</td>
                  <td className="px-3 py-2.5 text-slate-600">{x.exclusivity_category}</td>
                  <td className="px-5 py-2.5 text-right text-slate-600">{fmtD(x.exclusivity_end_date)} <span className="text-gray-400">({x.days_remaining}d)</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {panel === "overdue" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100"><th className="text-left px-5 py-2.5">Influencer</th><th className="text-left px-3 py-2.5">Brand · reference</th><th className="text-left px-3 py-2.5">Deliverable</th><th className="text-right px-5 py-2.5">Overdue</th></tr></thead>
            <tbody>
              {overdue.length === 0 && <tr><td colSpan={4} className="px-5 py-10 text-center text-gray-300">Nothing overdue.</td></tr>}
              {overdue.map(o => (
                <tr key={o.id} className="border-b border-gray-50 last:border-0">
                  <td className="px-5 py-2.5 text-slate-700">{o.full_name}<p className="text-[11px] text-gray-400">{o.email}</p></td>
                  <td className="px-3 py-2.5 text-slate-600">{o.brand} · {o.reference}</td>
                  <td className="px-3 py-2.5 text-slate-600">{o.quantity} x {o.deliverable_type}</td>
                  <td className="px-5 py-2.5 text-right font-semibold text-rose-500">{o.days_overdue}d</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {panel === "roi" && admin && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100"><th className="text-left px-5 py-2.5">Brand</th><th className="text-right px-3 py-2.5">Agreements</th><th className="text-right px-3 py-2.5">RRP gifted</th><th className="text-right px-3 py-2.5">Cost gifted</th><th className="text-right px-3 py-2.5">Reach</th><th className="text-right px-3 py-2.5">Engagement</th><th className="text-right px-3 py-2.5">Shares</th><th className="text-right px-3 py-2.5">Saves</th><th className="text-right px-5 py-2.5">New followers</th></tr></thead>
            <tbody>
              {roi.length === 0 && <tr><td colSpan={9} className="px-5 py-10 text-center text-gray-300">No delivered content yet.</td></tr>}
              {roi.map(r => (
                <tr key={r.brand} className="border-b border-gray-50 last:border-0">
                  <td className="px-5 py-2.5 font-semibold text-slate-700">{r.brand}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600">{r.agreements}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600">{fmtMoney(r.total_rrp_gifted)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600">{fmtMoney(r.total_cost_gifted)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600">{(r.total_reach ?? 0).toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600">{(r.total_engagement ?? 0).toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600">{(r.total_shares ?? 0).toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600">{(r.total_saves ?? 0).toLocaleString()}</td>
                  <td className="px-5 py-2.5 text-right text-slate-600">{(r.total_new_followers ?? 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-5 py-2 text-[11px] text-gray-400">Cost price is admin-only, same restriction as the existing gifting budget tracker.</p>
        </div>
      )}
    </div>
  );
}
