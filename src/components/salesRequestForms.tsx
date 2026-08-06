"use client";

import { useEffect, useMemo, useState } from "react";

// Shared Sales Hub request forms, used both inside the dashboard
// (src/components/SalesHub.tsx, authenticated) and on the public no-login
// form (src/app/request/page.tsx, shared-key gated). Only the submit
// endpoint/headers/identity-collection differ between the two.

export type ReqType = "artwork" | "swatch" | "tune_up" | "product";

export const TYPE_META: Record<ReqType, { label: string; emoji: string; guide: string }> = {
  artwork: { label: "Artwork Request", emoji: "🎨", guide: "images" },
  swatch: { label: "Swatch / Sample", emoji: "🧵", guide: "images" },
  tune_up: { label: "Tune-Up Nomination", emoji: "🔧", guide: "tune-up-days" },
  product: { label: "Product / Gifting", emoji: "🎁", guide: "product-and-gifting" },
};
export const STATES = ["VIC", "NSW", "QLD", "WA", "SA", "TAS", "ACT", "NT"];
export const baloo = "font-[family-name:var(--font-baloo)]";
export const body = "font-[family-name:var(--font-manrope)]";
// Big touch targets throughout — this is filled out on a phone in-store, not a desktop.
export const inp = "text-[15px] font-semibold border-[1.5px] border-gray-200 rounded-xl px-4 py-3.5 min-h-[52px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#3EC0E4] focus:border-[#3EC0E4] w-full bg-white";
export const lbl = "text-[11.5px] font-bold text-slate-500 uppercase tracking-wide mb-1.5 block";

export function RuleCard({ children }: { children: React.ReactNode }) {
  return <div className="bg-[#EAF4F8] border-l-[3px] border-[#1E9DC2] rounded-xl px-4 py-3.5 text-[13.5px] text-[#152A3B] leading-relaxed mb-4">{children}</div>;
}
export function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return <div><span className={lbl}>{label}{required && <span className="text-rose-500"> *</span>}</span>{children}</div>;
}
// Big tappable chips instead of tiny radio buttons — this is filled out on a phone.
export function ChipGroup<T extends string | boolean>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T | undefined; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {options.map(o => (
        <button key={String(o.value)} type="button" onClick={() => onChange(o.value)}
          className={`text-[13px] font-bold rounded-xl px-4 py-3 min-h-[48px] border-[1.5px] transition ${value === o.value ? "bg-[#3EC0E4] border-[#3EC0E4] text-white" : "bg-white border-gray-200 text-slate-600 hover:border-[#3EC0E4]"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
export function AckBox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2.5 text-[13px] text-slate-600 mt-4 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="mt-0.5 w-[18px] h-[18px] accent-[#1E9DC2] shrink-0" />
      <span>{label}</span>
    </label>
  );
}

// Picks the request type, collects identity (public form only), routes to
// the right type-specific form, and posts to whichever endpoint the caller
// wants (dashboard vs public).
export function RequestFormPicker({ type, setType, brands, onCreated, onCancel, endpoint = "/api/sales-requests", uploadEndpoint = "/api/sales-requests/upload", extraHeaders = {}, showIdentityFields = false }: {
  type: ReqType; setType: (t: ReqType) => void; brands: { name: string }[]; onCreated: (id: string) => void; onCancel?: () => void;
  endpoint?: string; uploadEndpoint?: string; extraHeaders?: Record<string, string>; showIdentityFields?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ack, setAck] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [f, setF] = useState<any>({});
  const [identity, setIdentity] = useState({ name: "", email: "" });
  useEffect(() => { setF({}); setAck(false); setErr(""); setFile(null); }, [type]);

  async function submit(payload: { title: string; brand?: string; retailer?: string; store?: string; state?: string; end_use: string; needed_by?: string; brief: any }) {
    if (!ack) { setErr("Please confirm you've read the rules first."); return; }
    if (showIdentityFields && (!identity.name.trim() || !identity.email.trim())) { setErr("Your name and email are required."); return; }
    setBusy(true); setErr("");
    const body: any = { request_type: type, ...payload };
    if (showIdentityFields) { body.requester_name = identity.name.trim(); body.requester_email = identity.email.trim(); }
    const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", ...extraHeaders }, body: JSON.stringify(body) }).then(r => r.json()).catch(() => ({ ok: false }));
    if (!res.ok) { setBusy(false); setErr(res.error || "Couldn't submit."); return; }
    if (file) {
      const fd = new FormData();
      fd.append("request_id", res.item.id); fd.append("kind", "attachment"); fd.append("file", file);
      if (showIdentityFields) fd.append("uploader", identity.name.trim() || identity.email.trim());
      await fetch(uploadEndpoint, { method: "POST", headers: extraHeaders, body: fd }).catch(() => {});
    }
    setBusy(false);
    onCreated(res.item.id);
  }

  return (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-5 max-w-3xl ${body}`}>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex gap-2 flex-wrap">
          {(Object.keys(TYPE_META) as ReqType[]).map(t => (
            <button key={t} onClick={() => setType(t)} className={`text-[12.5px] font-bold rounded-full px-4 py-2.5 transition ${type === t ? "bg-[#1E9DC2] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>{TYPE_META[t].emoji} {TYPE_META[t].label}</button>
          ))}
        </div>
        {onCancel && <button onClick={onCancel} className="text-sm text-gray-400 hover:text-gray-600">Cancel</button>}
      </div>

      {showIdentityFields && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 bg-slate-50 rounded-xl p-3">
          <Field label="Your name" required><input className={inp} value={identity.name} onChange={e => setIdentity({ ...identity, name: e.target.value })} /></Field>
          <Field label="Your email" required><input type="email" className={inp} value={identity.email} onChange={e => setIdentity({ ...identity, email: e.target.value })} /></Field>
        </div>
      )}

      {type === "artwork" && <ArtworkForm brands={brands} f={f} setF={setF} file={file} setFile={setFile} ack={ack} setAck={setAck} onSubmit={submit} />}
      {type === "swatch" && <SwatchForm brands={brands} f={f} setF={setF} ack={ack} setAck={setAck} onSubmit={submit} />}
      {type === "tune_up" && <TuneUpForm f={f} setF={setF} file={file} setFile={setFile} ack={ack} setAck={setAck} onSubmit={submit} />}
      {type === "product" && <ProductForm brands={brands} f={f} setF={setF} ack={ack} setAck={setAck} onSubmit={submit} />}

      {err && <p className="text-sm text-rose-600 mt-3">{err}</p>}
      <div className="mt-4 flex justify-end">
        <button disabled={busy} onClick={() => (document.getElementById(`submit-${type}`) as HTMLButtonElement)?.click()} className="hidden" />
      </div>
    </div>
  );
}

export function ArtworkForm({ brands, f, setF, file, setFile, ack, setAck, onSubmit }: any) {
  const [busy, setBusy] = useState(false);
  const isResize = f.artworkRequestType === "resize";
  async function go() {
    setBusy(true);
    await onSubmit({
      title: `Artwork · ${f.brand ?? "brand TBC"} · ${f.artworkRequestType === "resize" ? "resize" : f.artworkRequestType === "copy_update" ? "copy update" : "new asset"}`,
      brand: f.brand, retailer: f.retailer, end_use: f.whereAppears || "Not specified",
      needed_by: f.live_date,
      brief: { artworkRequestType: f.artworkRequestType, whereAppears: f.whereAppears, specs: f.specs, copy: f.copy, hasPrice: f.hasPrice, rrp: f.rrp, promoApprovedBy: f.promoApprovedBy, promoStart: f.promoStart, promoEnd: f.promoEnd, liveDate: f.live_date, inMarketUntil: f.inMarketUntil },
    });
    setBusy(false);
  }
  return (
    <div className="space-y-3">
      <RuleCard>Lead time depends on the type of request below, a resize of existing approved artwork is fastest. Artwork showing a price needs an approved promotion (confirmed RRP + sign-off + dates). We cannot turn artwork around same day.</RuleCard>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Brand" required><select className={inp} value={f.brand ?? ""} onChange={e => setF({ ...f, brand: e.target.value })}><option value="">Select…</option>{brands.map((b: any) => <option key={b.name} value={b.name}>{b.name}</option>)}</select></Field>
        <Field label="Retailer / store" required><input className={inp} value={f.retailer ?? ""} onChange={e => setF({ ...f, retailer: e.target.value })} /></Field>
      </div>
      <Field label="Request type" required>
        <ChipGroup value={f.artworkRequestType} onChange={(v: string) => setF({ ...f, artworkRequestType: v })}
          options={[{ value: "new", label: "New artwork" }, { value: "resize", label: "Resize of existing" }, { value: "copy_update", label: "Copy update only" }]} />
      </Field>
      <Field label="Where will it appear" required>
        <select className={inp} value={f.whereAppears ?? ""} onChange={e => setF({ ...f, whereAppears: e.target.value })}>
          <option value="">Select…</option>
          {["In-store POS", "Retailer EDM", "Retailer social", "Catalogue or brochure", "Event", "Other"].map(o => <option key={o}>{o}</option>)}
        </select>
      </Field>
      {!isResize && <Field label="Specs required" required><textarea className={inp} rows={2} placeholder="Format, width x height, unit (mm/px), file type, one per line" value={f.specs ?? ""} onChange={e => setF({ ...f, specs: e.target.value })} /></Field>}
      {isResize && <Field label="Which existing artwork + new size" required><textarea className={inp} rows={2} value={f.specs ?? ""} onChange={e => setF({ ...f, specs: e.target.value })} /></Field>}
      {!isResize && <Field label="Copy required"><textarea className={inp} rows={2} value={f.copy ?? ""} onChange={e => setF({ ...f, copy: e.target.value })} /></Field>}
      <Field label="Does it include a price?" required>
        <ChipGroup value={f.hasPrice} onChange={(v: boolean) => setF({ ...f, hasPrice: v })} options={[{ value: true, label: "Yes" }, { value: false, label: "No" }]} />
      </Field>
      {f.hasPrice && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-amber-50 border border-amber-100 rounded-xl p-3">
          <Field label="RRP" required><input className={inp} value={f.rrp ?? ""} onChange={e => setF({ ...f, rrp: e.target.value })} /></Field>
          <Field label="Who approved this promotion" required><input className={inp} value={f.promoApprovedBy ?? ""} onChange={e => setF({ ...f, promoApprovedBy: e.target.value })} /></Field>
          <Field label="Promo start / end" required><div className="flex gap-1"><input type="date" className={inp} value={f.promoStart ?? ""} onChange={e => setF({ ...f, promoStart: e.target.value })} /><input type="date" className={inp} value={f.promoEnd ?? ""} onChange={e => setF({ ...f, promoEnd: e.target.value })} /></div></Field>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Live date" required><input type="date" className={inp} value={f.live_date ?? ""} onChange={e => setF({ ...f, live_date: e.target.value })} /></Field>
        <Field label="In-market until"><input type="date" className={inp} value={f.inMarketUntil ?? ""} onChange={e => setF({ ...f, inMarketUntil: e.target.value })} /></Field>
      </div>
      <Field label="Retailer spec sheet"><input type="file" onChange={e => setFile(e.target.files?.[0] ?? null)} className="text-sm" /></Field>
      <AckBox label="I have read the Artwork and Image rules." checked={ack} onChange={setAck} />
      <button id="submit-artwork" disabled={busy || !f.brand || !f.artworkRequestType || !f.whereAppears || f.hasPrice === undefined || !f.live_date} onClick={go} className="text-[15px] font-bold text-white bg-[#FF6B4A] hover:bg-[#E85536] disabled:opacity-40 rounded-2xl px-6 py-4 mt-2 w-full sm:w-auto shadow-[0_8px_20px_-6px_rgba(255,107,74,0.55)] font-[family-name:var(--font-baloo)]">{busy ? "Submitting…" : "Submit request"}</button>
    </div>
  );
}

export function SwatchForm({ brands, f, setF, ack, setAck, onSubmit }: any) {
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    await onSubmit({
      title: `Swatch · ${f.brand ?? "brand TBC"} · ${f.range ?? ""}`, brand: f.brand,
      end_use: f.purpose || "Not specified", needed_by: f.needed_by,
      brief: { range: f.range, colourways: f.colourways, quantity: f.quantity, purpose: f.purpose, shipName: f.shipName, shipPhone: f.shipPhone, shipAddress: f.shipAddress },
    });
    setBusy(false);
  }
  return (
    <div className="space-y-3">
      <RuleCard>Swatches are stock dependent and not guaranteed. If you need full product, use the Product Request form instead, this one is for swatches and fabric samples only.</RuleCard>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Brand" required><select className={inp} value={f.brand ?? ""} onChange={e => setF({ ...f, brand: e.target.value })}><option value="">Select…</option>{brands.map((b: any) => <option key={b.name} value={b.name}>{b.name}</option>)}</select></Field>
        <Field label="Range" required><input className={inp} value={f.range ?? ""} onChange={e => setF({ ...f, range: e.target.value })} /></Field>
      </div>
      <Field label="Colourways required" required><input className={inp} placeholder="Comma separated" value={f.colourways ?? ""} onChange={e => setF({ ...f, colourways: e.target.value })} /></Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Quantity" required><input className={inp} value={f.quantity ?? ""} onChange={e => setF({ ...f, quantity: e.target.value })} /></Field>
        <Field label="Purpose" required><select className={inp} value={f.purpose ?? ""} onChange={e => setF({ ...f, purpose: e.target.value })}><option value="">Select…</option>{["Store display", "Retailer sample", "Photography", "Other"].map(o => <option key={o}>{o}</option>)}</select></Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Ship to, contact" required><input className={inp} value={f.shipName ?? ""} onChange={e => setF({ ...f, shipName: e.target.value })} /></Field>
        <Field label="Phone" required><input className={inp} value={f.shipPhone ?? ""} onChange={e => setF({ ...f, shipPhone: e.target.value })} /></Field>
        <Field label="Needed by" required><input type="date" className={inp} value={f.needed_by ?? ""} onChange={e => setF({ ...f, needed_by: e.target.value })} /></Field>
      </div>
      <Field label="Address" required><input className={inp} value={f.shipAddress ?? ""} onChange={e => setF({ ...f, shipAddress: e.target.value })} /></Field>
      <AckBox label="I have read the Artwork and Image rules." checked={ack} onChange={setAck} />
      <button id="submit-swatch" disabled={busy || !f.brand || !f.range || !f.colourways || !f.quantity || !f.purpose || !f.shipName || !f.shipPhone || !f.shipAddress || !f.needed_by} onClick={go} className="text-[15px] font-bold text-white bg-[#FF6B4A] hover:bg-[#E85536] disabled:opacity-40 rounded-2xl px-6 py-4 mt-2 w-full sm:w-auto shadow-[0_8px_20px_-6px_rgba(255,107,74,0.55)] font-[family-name:var(--font-baloo)]">{busy ? "Submitting…" : "Submit request"}</button>
    </div>
  );
}

export function TuneUpForm({ f, setF, file, setFile, ack, setAck, onSubmit }: any) {
  const [busy, setBusy] = useState(false);
  const months = useMemo(() => Array.from({ length: 6 }, (_, i) => { const d = new Date(); d.setMonth(d.getMonth() + i + 1); return d.toLocaleDateString("en-AU", { month: "long", year: "numeric" }); }), []);
  async function go() {
    setBusy(true);
    await onSubmit({
      title: `Tune-Up nomination · ${f.retailer ?? ""} ${f.store ?? ""}`, retailer: f.retailer, store: f.store, state: f.state,
      end_use: "Tune-Up Day at store", needed_by: undefined,
      brief: { storeContact: f.storeContact, storeMobile: f.storeMobile, whyStore: f.whyStore, spaceAvailable: f.spaceAvailable, preferredMonth: f.preferredMonth, storeConfirmed: f.storeConfirmed },
    });
    setBusy(false);
  }
  return (
    <div className="space-y-3">
      <RuleCard>
        Non-negotiables: once an event is published on Eventbrite and promoted, times cannot be changed, stores must confirm timing before go-live. The $20 refundable booking fee stays. Stores must be approved by Baby Bunting or the independent retailer before publishing.
        Nominations are reviewed in a batch when the next six-month schedule is built.
      </RuleCard>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="State" required><select className={inp} value={f.state ?? ""} onChange={e => setF({ ...f, state: e.target.value })}><option value="">Select…</option>{STATES.map(s => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Retailer" required><input className={inp} value={f.retailer ?? ""} onChange={e => setF({ ...f, retailer: e.target.value })} /></Field>
        <Field label="Store" required><input className={inp} value={f.store ?? ""} onChange={e => setF({ ...f, store: e.target.value })} /></Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Store contact name" required><input className={inp} value={f.storeContact ?? ""} onChange={e => setF({ ...f, storeContact: e.target.value })} /></Field>
        <Field label="Store contact mobile" required><input className={inp} value={f.storeMobile ?? ""} onChange={e => setF({ ...f, storeMobile: e.target.value })} /></Field>
      </div>
      <Field label="Why this store" required><textarea className={inp} rows={2} placeholder="Customer requests received, pram sales last 12 months, prior Tune-Up attendance if any" value={f.whyStore ?? ""} onChange={e => setF({ ...f, whyStore: e.target.value })} /></Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Space for a 2.4m folding table + service area?" required>
          <ChipGroup value={f.spaceAvailable} onChange={(v: boolean) => setF({ ...f, spaceAvailable: v })} options={[{ value: true, label: "Yes" }, { value: false, label: "No" }]} />
        </Field>
        <Field label="Photo of the space"><input type="file" onChange={e => setFile(e.target.files?.[0] ?? null)} className="text-sm" /></Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Preferred month" required><select className={inp} value={f.preferredMonth ?? ""} onChange={e => setF({ ...f, preferredMonth: e.target.value })}><option value="">Select…</option>{months.map(m => <option key={m}>{m}</option>)}</select></Field>
        <Field label="Store has confirmed date and time availability" required>
          <ChipGroup value={f.storeConfirmed} onChange={(v: boolean) => setF({ ...f, storeConfirmed: v })} options={[{ value: true, label: "Yes" }, { value: false, label: "No" }]} />
        </Field>
      </div>
      <p className="text-xs text-gray-400">Nominations are reviewed when the next six-month schedule is built (per the manual, the second-half schedule is built toward the end of May), you won't hear back immediately.</p>
      <AckBox label="I have read the Tune-Up Day non-negotiables." checked={ack} onChange={setAck} />
      <button id="submit-tune_up" disabled={busy || !f.state || !f.retailer || !f.store || !f.storeContact || !f.storeMobile || !f.whyStore || f.spaceAvailable === undefined || !f.preferredMonth || f.storeConfirmed === undefined} onClick={go} className="text-[15px] font-bold text-white bg-[#FF6B4A] hover:bg-[#E85536] disabled:opacity-40 rounded-2xl px-6 py-4 mt-2 w-full sm:w-auto shadow-[0_8px_20px_-6px_rgba(255,107,74,0.55)] font-[family-name:var(--font-baloo)]">{busy ? "Submitting…" : "Submit nomination"}</button>
    </div>
  );
}

export function ProductForm({ brands, f, setF, ack, setAck, onSubmit }: any) {
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    await onSubmit({
      title: `Product/gifting · ${f.brand ?? ""} · ${f.sku ?? ""}`, brand: f.brand,
      end_use: f.purpose || "Not specified", needed_by: f.needed_by,
      brief: { sku: f.sku, quantity: f.quantity, approxRrpValue: f.approxRrpValue, purpose: f.purpose, fundedBy: f.fundedBy, whatWeGet: f.whatWeGet },
    });
    setBusy(false);
  }
  return (
    <div className="space-y-3">
      <RuleCard>
        Free product for giveaways, competitions, retailer incentives and staff seeding is a <strong>sales and trade spend decision, not a marketing budget line</strong>. This request goes to your Sales Manager. Marketing is notified for awareness only.
      </RuleCard>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Brand" required><select className={inp} value={f.brand ?? ""} onChange={e => setF({ ...f, brand: e.target.value })}><option value="">Select…</option>{brands.map((b: any) => <option key={b.name} value={b.name}>{b.name}</option>)}</select></Field>
        <Field label="SKU or product" required><input className={inp} value={f.sku ?? ""} onChange={e => setF({ ...f, sku: e.target.value })} /></Field>
        <Field label="Quantity" required><input className={inp} value={f.quantity ?? ""} onChange={e => setF({ ...f, quantity: e.target.value })} /></Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Approx. RRP value" required><input className={inp} value={f.approxRrpValue ?? ""} onChange={e => setF({ ...f, approxRrpValue: e.target.value })} /></Field>
        <Field label="Purpose" required><select className={inp} value={f.purpose ?? ""} onChange={e => setF({ ...f, purpose: e.target.value })}><option value="">Select…</option>{["Retailer competition", "Store staff incentive", "Customer giveaway", "Display", "Other"].map(o => <option key={o}>{o}</option>)}</select></Field>
        <Field label="Who is funding it" required><select className={inp} value={f.fundedBy ?? ""} onChange={e => setF({ ...f, fundedBy: e.target.value })}><option value="">Select…</option>{["Retailer", "Coolkidz trade spend", "To be discussed"].map(o => <option key={o}>{o}</option>)}</select></Field>
      </div>
      <Field label="What Coolkidz gets in return" required><textarea className={inp} rows={2} placeholder="Placement, posts, staff training, sell-through commitment…" value={f.whatWeGet ?? ""} onChange={e => setF({ ...f, whatWeGet: e.target.value })} /></Field>
      <Field label="Needed by" required><input type="date" className={inp} value={f.needed_by ?? ""} onChange={e => setF({ ...f, needed_by: e.target.value })} /></Field>
      <AckBox label="I have read the Free Product, Samples & Gifting rules." checked={ack} onChange={setAck} />
      <button id="submit-product" disabled={busy || !f.brand || !f.sku || !f.quantity || !f.approxRrpValue || !f.purpose || !f.fundedBy || !f.whatWeGet || !f.needed_by} onClick={go} className="text-[15px] font-bold text-white bg-[#FF6B4A] hover:bg-[#E85536] disabled:opacity-40 rounded-2xl px-6 py-4 mt-2 w-full sm:w-auto shadow-[0_8px_20px_-6px_rgba(255,107,74,0.55)] font-[family-name:var(--font-baloo)]">{busy ? "Submitting…" : "Submit request"}</button>
    </div>
  );
}
