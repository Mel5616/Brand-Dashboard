"use client";

import { useEffect, useMemo, useState } from "react";

// Nanit influencer tracker: the social team logs gifted collabs; Nanit fills in
// subscription codes via the public share link (admin mints/copies it here).
type Row = {
  id: string; month_key: string; name: string; handle: string; email: string; followers: string;
  platform: string; partnership_type: string; product_supplied: string; product_value: number | null;
  subscription_code: string; subscription_plan: string; code_added_at?: string | null; avatar_url?: string | null;
};
const inp = "w-full text-sm border border-gray-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400";
const monthShort = (k: string) => k ? new Date(k + "-01T00:00:00").toLocaleDateString("en-AU", { month: "short", year: "2-digit" }) : "";
const curMonth = () => new Date().toISOString().slice(0, 7);

function Avatar({ url, name, size = 38 }: { url?: string | null; name: string; size?: number }) {
  const initial = (name || "?").replace(/^@/, "")[0]?.toUpperCase() || "?";
  return url
    ? <img src={url} alt="" className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />
    : <div className="rounded-full bg-sky-100 text-sky-700 font-bold flex items-center justify-center shrink-0" style={{ width: size, height: size, fontSize: size * 0.4 }}>{initial}</div>;
}

export function NanitTracker({ admin }: { admin: boolean }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const blank = { month_key: curMonth(), name: "", handle: "", email: "", followers: "", platform: "IG", partnership_type: "Influencer collab (gifted)", product_supplied: "", product_value: "" };
  const [f, setF] = useState<any>(blank);

  useEffect(() => {
    fetch("/api/nanit").then(r => r.json()).then(d => {
      if (d.needsSetup) setNeedsSetup(true);
      else if (d.ok) { setRows(d.rows ?? []); setToken(d.share_token ?? null); }
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const post = (body: any) => fetch("/api/nanit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json());
  const pending = useMemo(() => rows.filter(r => !r.subscription_code).length, [rows]);
  const totalValue = useMemo(() => rows.reduce((s, r) => s + (Number(r.product_value) || 0), 0), [rows]);

  async function addRow() {
    if (!f.name.trim()) { setErr("Name required."); return; }
    setBusy(true); setErr("");
    const d = await post({ action: "row.save", ...f });
    setBusy(false);
    if (d.ok) { setRows(p => [d.item, ...p]); setF({ ...blank, month_key: f.month_key }); setShowAdd(false); }
    else setErr(d.error || "Couldn't save.");
  }
  async function delRow(id: string) {
    if (typeof window !== "undefined" && !window.confirm("Delete this influencer row?")) return;
    const d = await post({ action: "row.delete", id });
    if (d.ok) setRows(p => p.filter(r => r.id !== id));
  }
  // Photo uploads go to the shared influencer roster (by handle), so the same
  // avatar shows in the main gifting tracker too.
  async function uploadAvatar(r: Row, file: File) {
    if (!r.handle) { if (typeof window !== "undefined") window.alert("Add a handle first — photos are stored against the @handle."); return; }
    const fd = new FormData(); fd.set("handle", r.handle); fd.set("file", file);
    const d = await fetch("/api/influencer/avatar", { method: "POST", body: fd }).then(x => x.json()).catch(() => null);
    if (d?.ok) setRows(p => p.map(x => x.id === r.id ? { ...x, avatar_url: d.url } : x));
  }
  async function copyLink() {
    let t = token;
    if (!t) { const d = await post({ action: "share.mint" }); if (d.ok) { t = d.token; setToken(d.token); } }
    if (!t) return;
    const url = `${window.location.origin}/nanit/${t}`;
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
    window.open(url, "_blank");
  }

  if (needsSetup) return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-500">Run <code className="bg-gray-100 px-1 rounded">add_nanit_influencers.sql</code> in Supabase to enable the Nanit tracker.</div>;
  if (loading) return <div className="p-8 text-center text-sm text-gray-400">Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Nanit influencer tracker</h1>
          <p className="text-sm text-gray-400">Gifted collabs and their Nanit subscription codes. Send Nanit the code link — they fill codes in directly.</p>
        </div>
        <div className="flex items-center gap-2">
          {admin && <button onClick={copyLink} className="text-sm font-semibold text-white bg-sky-500 hover:bg-sky-600 rounded-lg px-4 py-2">{copied ? "Link copied ✓" : "Copy code link for Nanit"}</button>}
          <button onClick={() => setShowAdd(v => !v)} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-4 py-2">{showAdd ? "Cancel" : "+ Add influencer"}</button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4"><p className="text-[11px] uppercase tracking-wider text-gray-400">Influencers</p><p className="text-2xl font-bold text-slate-800">{rows.length}</p></div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4"><p className="text-[11px] uppercase tracking-wider text-gray-400">Awaiting code</p><p className={`text-2xl font-bold ${pending ? "text-amber-600" : "text-slate-800"}`}>{pending}</p></div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4"><p className="text-[11px] uppercase tracking-wider text-gray-400">Product value (RRP)</p><p className="text-2xl font-bold text-slate-800">${Math.round(totalValue).toLocaleString()}</p></div>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          <label className="flex flex-col"><span className="text-[9px] uppercase tracking-wider text-gray-400">Month</span><input type="month" value={f.month_key} onChange={e => setF({ ...f, month_key: e.target.value })} className={inp} /></label>
          <input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Full name" className={`${inp} self-end`} />
          <input value={f.handle} onChange={e => setF({ ...f, handle: e.target.value })} placeholder="@handle" className={`${inp} self-end`} />
          <input value={f.email} onChange={e => setF({ ...f, email: e.target.value })} placeholder="Email address" className={`${inp} self-end`} />
          <input value={f.followers} onChange={e => setF({ ...f, followers: e.target.value })} placeholder="Followers (e.g. 92.5k)" className={inp} />
          <input value={f.platform} onChange={e => setF({ ...f, platform: e.target.value })} placeholder="Platform" list="nanit-platforms" className={inp} />
          <input value={f.partnership_type} onChange={e => setF({ ...f, partnership_type: e.target.value })} placeholder="Partnership type" list="nanit-types" className={inp} />
          <div className="flex items-center border border-gray-200 rounded-lg px-2"><span className="text-gray-400 text-sm">$</span>
            <input type="number" value={f.product_value} onChange={e => setF({ ...f, product_value: e.target.value })} placeholder="Product value" className="w-full text-sm px-1 py-2 focus:outline-none" /></div>
          <input value={f.product_supplied} onChange={e => setF({ ...f, product_supplied: e.target.value })} placeholder="Product supplied (e.g. Pro camera + floor stand)" className={`${inp} sm:col-span-2 lg:col-span-3`} />
          <button onClick={addRow} disabled={busy} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-4 py-2 disabled:opacity-60">{busy ? "Saving…" : "Add"}</button>
          {err && <p className="text-sm text-rose-500 sm:col-span-2">{err}</p>}
          <datalist id="nanit-platforms"><option value="IG" /><option value="TT" /><option value="YT" /><option value="IG/TT" /><option value="IG/YT" /></datalist>
          <datalist id="nanit-types"><option value="Influencer collab (gifted)" /><option value="Paid partnership" /><option value="Ambassador" /></datalist>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-gray-400 bg-slate-50/70">
                {["Month", "Influencer", "Email", "Product supplied", "Value", "Code", "Plan", ""].map(h => (
                  <th key={h} className={`${h === "Value" ? "text-right" : "text-left"} font-semibold px-3 py-2 whitespace-nowrap`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map(r => (
                <tr key={r.id} className={`group ${r.subscription_code ? "" : "bg-amber-50/40"}`}>
                  <td className="px-3 py-2.5 whitespace-nowrap text-gray-500">{monthShort(r.month_key)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <label className="cursor-pointer shrink-0" title={r.avatar_url ? "Replace photo" : "Add photo"}>
                        <Avatar url={r.avatar_url} name={r.name || r.handle} />
                        <input type="file" accept="image/*" className="hidden" onChange={e => { const fl = e.target.files?.[0]; if (fl) uploadAvatar(r, fl); e.currentTarget.value = ""; }} />
                      </label>
                      <div><p className="font-semibold text-slate-800 whitespace-nowrap">{r.name}</p><p className="text-[11px] text-gray-400">{r.handle}{r.followers ? ` · ${r.followers}` : ""}{r.platform ? ` · ${r.platform}` : ""}</p></div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{r.email}</td>
                  <td className="px-3 py-2.5 text-slate-600 max-w-[220px]">{r.product_supplied}</td>
                  <td className="px-3 py-2.5 text-right font-semibold text-slate-700 tabular-nums whitespace-nowrap">{r.product_value != null ? `$${Math.round(Number(r.product_value)).toLocaleString()}` : "—"}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{r.subscription_code
                    ? <span className="font-mono font-semibold text-emerald-700 bg-emerald-50 rounded px-1.5 py-0.5">{r.subscription_code}</span>
                    : <span className="text-[11px] font-semibold text-amber-600">awaiting</span>}</td>
                  <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{r.subscription_plan || "—"}</td>
                  <td className="px-3 py-2.5 text-right">{admin && <button onClick={() => delRow(r.id)} className="text-gray-300 hover:text-rose-500 opacity-0 group-hover:opacity-100">✕</button>}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-300">No influencers yet — add the first above.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
