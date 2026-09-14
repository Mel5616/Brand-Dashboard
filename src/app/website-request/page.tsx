"use client";

import { useEffect, useState } from "react";

// Public, no-login form — share this link (optionally with
// ?k=<WEBSITE_REQUEST_KEY>) with anyone who needs something changed on a
// brand website. Submissions land in the dashboard's Website Requests tab.
// Same shared-key pattern as /request (src/lib/salesRequestKey.ts) and
// /log-gift (src/lib/giftKey.ts).
const TYPES = [
  { value: "copy", label: "Copy / text change" },
  { value: "broken_link", label: "Broken link" },
  { value: "new_page", label: "New page" },
  { value: "image_banner", label: "Image / banner" },
  { value: "product_info", label: "Product information" },
  { value: "other", label: "Other" },
];

function requestKey(): string {
  if (typeof window === "undefined") return "";
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("k");
    if (fromUrl) { localStorage.setItem("websiteRequestKey", fromUrl); return fromUrl; }
    return localStorage.getItem("websiteRequestKey") || "";
  } catch { return ""; }
}

const inp = "w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-400";

export default function WebsiteRequestPage() {
  const [brands, setBrands] = useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [noKey, setNoKey] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const key = requestKey();
  const headers: Record<string, string> = key ? { "x-website-key": key } : {};

  const empty = { brand: "", page_url: "", change_type: "copy", description: "", requester_name: "", requester_email: "", priority: "normal" };
  const [f, setF] = useState(empty);

  useEffect(() => {
    fetch("/api/public-website-request", { headers }).then(r => {
      if (r.status === 403) { setNoKey(true); return { ok: false }; }
      return r.json();
    }).then((d: any) => { setNeedsSetup(!!d.needsSetup); setBrands(d.brands ?? []); }).catch(() => {}).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit() {
    setErr("");
    if (!f.brand || !f.requester_name.trim() || !f.requester_email.trim() || !f.description.trim()) {
      setErr("Brand, your name, email and a description are required."); return;
    }
    setBusy(true);
    const res = await fetch("/api/public-website-request", {
      method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(f),
    }).then(r => r.json()).catch(() => null);
    setBusy(false);
    if (res?.ok) setDone(true); else setErr(res?.error || "Something went wrong — try again.");
  }

  if (loading) return <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4"><p className="text-sm text-slate-400">Loading…</p></main>;

  if (noKey) return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 max-w-md text-center">
        <p className="text-lg font-semibold text-slate-800">This link needs its access key</p>
        <p className="text-sm text-slate-400 mt-1">You may have an old bookmark — ask Mel for the current website request link.</p>
      </div>
    </main>
  );

  if (needsSetup) return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 max-w-md text-center">
        <p className="text-slate-700 font-medium">Not set up yet</p>
        <p className="text-sm text-slate-400 mt-1">Ask the admin to finish setting this up.</p>
      </div>
    </main>
  );

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
        {done ? (
          <div className="text-center">
            <p className="text-lg font-semibold text-slate-800 mb-2">Request sent</p>
            <p className="text-sm text-slate-500 mb-6">Mel has been notified and it&apos;s in the queue.</p>
            <button onClick={() => { setF(empty); setDone(false); }} className="text-sm font-medium bg-emerald-600 text-white rounded-lg px-4 py-2.5 hover:bg-emerald-700">
              Submit another
            </button>
          </div>
        ) : (
          <>
            <p className="text-lg font-semibold text-slate-800 mb-1">Website change request</p>
            <p className="text-sm text-slate-500 mb-6">Tell us what needs to change on the website — this goes straight into the queue.</p>
            <div className="space-y-3">
              <select value={f.brand} onChange={e => setF({ ...f, brand: e.target.value })} className={inp}>
                <option value="">Brand *</option>
                {brands.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
              </select>
              <select value={f.change_type} onChange={e => setF({ ...f, change_type: e.target.value })} className={inp}>
                {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <input value={f.page_url} onChange={e => setF({ ...f, page_url: e.target.value })} placeholder="Page URL (if known)" className={inp} />
              <textarea value={f.description} onChange={e => setF({ ...f, description: e.target.value })} rows={5} placeholder="What needs to change? *" className={inp} />
              <select value={f.priority} onChange={e => setF({ ...f, priority: e.target.value })} className={inp}>
                <option value="low">Low priority</option>
                <option value="normal">Normal priority</option>
                <option value="urgent">Urgent</option>
              </select>
              <input value={f.requester_name} onChange={e => setF({ ...f, requester_name: e.target.value })} placeholder="Your name *" className={inp} />
              <input type="email" value={f.requester_email} onChange={e => setF({ ...f, requester_email: e.target.value })} placeholder="Your email *" className={inp} />
              {err && <p className="text-sm text-rose-500">{err}</p>}
              <button onClick={submit} disabled={busy} className="w-full text-sm font-medium bg-emerald-600 text-white rounded-lg px-4 py-3 hover:bg-emerald-700 disabled:opacity-60">
                {busy ? "Sending…" : "Submit request"}
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
