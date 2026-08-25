"use client";

// PUBLIC new-customer application form. Reached from a tracked Sales Hub form
// link (/hub/<token> redirects here). Loads brand list + any prefill from the
// linked prospect record, and posts the application back against the token.
import { use, useEffect, useState } from "react";

const STATES = ["VIC", "NSW", "QLD", "WA", "SA", "TAS", "ACT", "NT"];
const inp = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 bg-white outline-none focus:border-sky-400";
const lbl = "block text-[10.5px] font-bold text-slate-400 uppercase tracking-wide mb-1";

export default function ApplyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [state, setState] = useState<"loading" | "ready" | "invalid" | "done">("loading");
  const [brands, setBrands] = useState<string[]>([]);
  const [f, setF] = useState<any>({ store_name: "", legal_name: "", abn: "", contact_name: "", role: "", email: "", phone: "", website: "", address: "", state: "", postcode: "", store_count: "", brands: [] as string[], hear_about: "", message: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/hub-apply?token=${token}`).then(r => r.json()).then(d => {
      if (!d.ok) { setState("invalid"); return; }
      setBrands(d.brands || []);
      if (d.prefill) setF((prev: any) => ({ ...prev, ...Object.fromEntries(Object.entries(d.prefill).filter(([, v]) => v)) , brands: prev.brands }));
      setState("ready");
    }).catch(() => setState("invalid"));
  }, [token]);

  const set = (k: string) => (e: any) => setF((prev: any) => ({ ...prev, [k]: e.target.value }));
  const toggleBrand = (b: string) => setF((prev: any) => ({ ...prev, brands: prev.brands.includes(b) ? prev.brands.filter((x: string) => x !== b) : [...prev.brands, b] }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setBusy(true);
    const r = await fetch("/api/hub-apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, data: f }) }).then(x => x.json()).catch(() => ({ ok: false, error: "Something went wrong — please try again." }));
    setBusy(false);
    if (!r.ok) { setErr(r.error || "Something went wrong — please try again."); return; }
    setState("done");
  }

  if (state === "loading") return <Shellframe><p className="text-center text-slate-400 text-sm py-16">Loading…</p></Shellframe>;
  if (state === "invalid") return <Shellframe><div className="text-center py-16"><p className="text-3xl mb-2">🔗</p><h1 className="text-lg font-bold text-slate-800">This link isn't valid</h1><p className="text-sm text-slate-500 mt-1">Please contact the Coolkidz Australia team for a fresh application link.</p></div></Shellframe>;
  if (state === "done") return <Shellframe><div className="text-center py-16"><p className="text-3xl mb-2">🎉</p><h1 className="text-lg font-bold text-slate-800">Application received</h1><p className="text-sm text-slate-500 mt-2 max-w-sm mx-auto">Thanks — the Coolkidz Australia team will review your details and be in touch shortly to set up your account.</p></div></Shellframe>;

  return (
    <Shellframe>
      <div className="mb-6">
        <h1 className="text-xl font-extrabold text-slate-900">New Customer Application</h1>
        <p className="text-sm text-slate-500 mt-1">Tell us about your store and the brands you'd like to range — we'll set up your trade account from here.</p>
      </div>
      <form onSubmit={submit} className="space-y-5">
        <Section title="Your business">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2"><label className={lbl}>Store / trading name *</label><input required className={inp} value={f.store_name} onChange={set("store_name")} /></div>
            <div><label className={lbl}>Legal entity name</label><input className={inp} value={f.legal_name} onChange={set("legal_name")} /></div>
            <div><label className={lbl}>ABN</label><input className={inp} value={f.abn} onChange={set("abn")} /></div>
            <div><label className={lbl}>Website / Instagram</label><input className={inp} value={f.website} onChange={set("website")} /></div>
            <div><label className={lbl}>Number of stores</label><input className={inp} value={f.store_count} onChange={set("store_count")} placeholder="e.g. 1, 3, online only" /></div>
          </div>
        </Section>
        <Section title="Contact">
          <div className="grid sm:grid-cols-2 gap-3">
            <div><label className={lbl}>Contact name *</label><input required className={inp} value={f.contact_name} onChange={set("contact_name")} /></div>
            <div><label className={lbl}>Role</label><input className={inp} value={f.role} onChange={set("role")} placeholder="e.g. Owner, Buyer" /></div>
            <div><label className={lbl}>Email *</label><input required type="email" className={inp} value={f.email} onChange={set("email")} /></div>
            <div><label className={lbl}>Phone</label><input className={inp} value={f.phone} onChange={set("phone")} /></div>
          </div>
        </Section>
        <Section title="Store address">
          <div className="grid sm:grid-cols-4 gap-3">
            <div className="sm:col-span-2"><label className={lbl}>Address</label><input className={inp} value={f.address} onChange={set("address")} /></div>
            <div><label className={lbl}>State</label>
              <select className={inp} value={f.state} onChange={set("state")}><option value="">—</option>{STATES.map(s => <option key={s}>{s}</option>)}</select></div>
            <div><label className={lbl}>Postcode</label><input className={inp} value={f.postcode} onChange={set("postcode")} /></div>
          </div>
        </Section>
        <Section title="Brands you're interested in">
          <div className="flex flex-wrap gap-2">
            {brands.map(b => (
              <button type="button" key={b} onClick={() => toggleBrand(b)}
                className={`text-[13px] font-semibold rounded-full px-3.5 py-1.5 border transition-colors ${f.brands.includes(b) ? "bg-sky-500 border-sky-500 text-white" : "bg-white border-slate-200 text-slate-600 hover:border-sky-300"}`}>
                {b}
              </button>
            ))}
          </div>
        </Section>
        <Section title="Anything else">
          <div className="grid gap-3">
            <div><label className={lbl}>How did you hear about us?</label><input className={inp} value={f.hear_about} onChange={set("hear_about")} placeholder="e.g. Baby expo, rep visit, Instagram" /></div>
            <div><label className={lbl}>Message</label><textarea rows={3} className={inp} value={f.message} onChange={set("message")} /></div>
          </div>
        </Section>
        {err && <p className="text-sm text-rose-600">{err}</p>}
        <button type="submit" disabled={busy} className="w-full bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white font-bold text-sm rounded-xl py-3.5 transition-colors">
          {busy ? "Submitting…" : "Submit application →"}
        </button>
      </form>
    </Shellframe>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400 mb-3.5">{title}</h2>
      {children}
    </div>
  );
}

function Shellframe({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-[#132741] rounded-t-2xl px-6 py-5">
          <img src="/logos/coolkidz-logo.png" alt="Coolkidz Australia" className="h-8" />
        </div>
        <div className="bg-slate-50 border border-slate-200 border-t-0 rounded-b-2xl p-6">{children}</div>
        <p className="text-center text-[11px] text-slate-400 mt-4">Coolkidz Australia Pty Ltd · 1 Beyer Road, Braeside VIC 3195</p>
      </div>
    </div>
  );
}
