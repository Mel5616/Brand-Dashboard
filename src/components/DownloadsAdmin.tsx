"use client";

import { useEffect, useState } from "react";

type Dl = { id: string; brand_id: number; slug: string; title: string; description: string | null; file_url: string; file_name: string | null; klaviyo_list_id: string | null; active: boolean; created_at: string; signups: number; consented: number; last7: number };
type Brand = { id: number; name: string };
type Signup = { id: string; email: string; first_name: string | null; consent: boolean; source: string | null; klaviyo_status: string | null; created_at: string };

const BASE = "https://marketing.coolkidz.com.au/download";
const inp = "text-sm border border-gray-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-pink-400 w-full";
const lbl = "text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1";
const fmtD = (s: string) => new Date(s).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "2-digit" });
const SOURCES = ["instagram", "facebook", "email", "qr", "tradeshow", "website", "blog"];

export function DownloadsAdmin({ brands }: { brands: Brand[] }) {
  const [items, setItems] = useState<Dl[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "needsSetup">("loading");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [signups, setSignups] = useState<Signup[]>([]);
  const [form, setForm] = useState({ brand_id: "", title: "", description: "", klaviyo_list_id: "" });
  const [file, setFile] = useState<File | null>(null);
  const [lists, setLists] = useState<{ id: string; name: string }[]>([]);
  const [copied, setCopied] = useState("");

  function load() {
    fetch("/api/downloads").then(r => r.json()).then(d => { setItems(d.items || []); setState(d.needsSetup ? "needsSetup" : "ready"); }).catch(() => setState("ready"));
  }
  useEffect(load, []);
  useEffect(() => {
    setLists([]); setForm(f => ({ ...f, klaviyo_list_id: "" }));
    if (!form.brand_id) return;
    fetch(`/api/downloads/klaviyo-lists?brand_id=${form.brand_id}`).then(r => r.json()).then(d => setLists(d.lists || [])).catch(() => {});
  }, [form.brand_id]);

  const brandName = (id: number) => brands.find(b => b.id === id)?.name ?? "—";

  async function create() {
    setMsg("");
    if (!form.brand_id || !form.title.trim() || !file) { setMsg("Pick a brand, add a title and choose the file."); return; }
    setBusy(true);
    const fd = new FormData();
    fd.append("file", file); fd.append("title", form.title); fd.append("brand_id", form.brand_id);
    fd.append("brand_name", brandName(Number(form.brand_id))); fd.append("description", form.description); fd.append("klaviyo_list_id", form.klaviyo_list_id);
    const d = await fetch("/api/downloads", { method: "POST", body: fd }).then(r => r.json()).catch(() => null);
    setBusy(false);
    if (d?.ok) { setMsg("Created. Copy the link below to share it."); setForm({ brand_id: form.brand_id, title: "", description: "", klaviyo_list_id: "" }); setFile(null); load(); }
    else setMsg(d?.error || "Couldn't create that download.");
  }
  async function patch(id: string, body: object) {
    await fetch("/api/downloads", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...body }) });
    load();
  }
  async function remove(d: Dl) {
    if (!confirm(`Delete "${d.title}" and its ${d.signups} signups? The public link will stop working.`)) return;
    await fetch(`/api/downloads?id=${d.id}`, { method: "DELETE" });
    if (openId === d.id) setOpenId(null);
    load();
  }
  async function open(d: Dl) {
    if (openId === d.id) { setOpenId(null); return; }
    setOpenId(d.id); setSignups([]);
    const r = await fetch(`/api/downloads/signups?download_id=${d.id}`).then(x => x.json()).catch(() => ({ items: [] }));
    setSignups(r.items || []);
  }
  async function copy(text: string, key: string) {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(""), 2000); } catch { setMsg("Couldn't copy. Select the link and copy it."); }
  }

  if (state === "loading") return <p className="text-sm text-slate-400 py-8 text-center">Loading…</p>;
  if (state === "needsSetup") return <div className="text-sm text-slate-500 bg-white rounded-xl border border-gray-100 p-6">Digital downloads aren&apos;t set up yet. Run <code className="text-xs bg-slate-100 px-1 rounded">supabase/add_digital_downloads.sql</code> in Supabase.</div>;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-pink-100 shadow-sm p-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-pink-600 mb-1">New digital download</p>
        <p className="text-xs text-gray-400 mb-3">Upload the file, get a signup page. People enter their email, get the file straight away, and land in the brand&apos;s Klaviyo.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><div className={lbl}>Brand *</div>
            <select value={form.brand_id} onChange={e => setForm(f => ({ ...f, brand_id: e.target.value }))} className={inp}><option value="">Choose…</option>{brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
          <div><div className={lbl}>Title *</div><input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Hospital bag checklist" className={inp} /></div>
          <div className="sm:col-span-2"><div className={lbl}>Short description (shown on the page)</div><input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="A practical, mum-first checklist for the first week." className={inp} /></div>
          <div><div className={lbl}>File (PDF) *</div><input type="file" accept=".pdf,application/pdf,image/*" onChange={e => setFile(e.target.files?.[0] ?? null)} className="text-sm" /></div>
          <div><div className={lbl}>Subscribe consenting signups to (Klaviyo list)</div>
            <select value={form.klaviyo_list_id} onChange={e => setForm(f => ({ ...f, klaviyo_list_id: e.target.value }))} className={inp} disabled={!form.brand_id}>
              <option value="">Don&apos;t subscribe, just add the profile</option>{lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
        </div>
        {msg && <p className="text-[13px] text-slate-500 mt-2">{msg}</p>}
        <button onClick={create} disabled={busy} className="mt-3 text-sm font-semibold text-white bg-pink-500 hover:bg-pink-600 rounded-lg px-5 py-2.5 disabled:opacity-60">{busy ? "Uploading…" : "Create download"}</button>
      </div>

      {items.length === 0 ? <p className="text-sm text-gray-400 text-center py-10">No downloads yet.</p> : (
        <div className="space-y-3">
          {items.map(d => {
            const link = `${BASE}/${d.slug}`;
            return (
              <div key={d.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 flex items-center gap-3 flex-wrap">
                  <button onClick={() => open(d)} className="text-left min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-700 truncate">{d.title} {!d.active && <span className="ml-1 text-[10px] font-bold uppercase bg-gray-100 text-gray-400 rounded-full px-2 py-0.5">Off</span>}</p>
                    <p className="text-[12px] text-gray-400">{brandName(d.brand_id)} · {fmtD(d.created_at)}</p>
                  </button>
                  <div className="flex gap-4 text-center">
                    <div><div className="text-lg font-extrabold text-slate-800 tabular-nums">{d.signups}</div><div className="text-[10px] uppercase font-bold text-gray-400">Signups</div></div>
                    <div><div className="text-lg font-extrabold text-slate-800 tabular-nums">{d.consented}</div><div className="text-[10px] uppercase font-bold text-gray-400">Opted in</div></div>
                    <div><div className="text-lg font-extrabold text-slate-800 tabular-nums">{d.last7}</div><div className="text-[10px] uppercase font-bold text-gray-400">Last 7d</div></div>
                  </div>
                </div>
                {openId === d.id && (
                  <div className="border-t border-gray-100 px-5 py-4 space-y-3">
                    <div>
                      <div className={lbl}>Share link</div>
                      <div className="flex gap-2 flex-wrap items-center">
                        <input readOnly value={link} className={inp + " flex-1 min-w-[260px]"} onFocus={e => e.target.select()} />
                        <button onClick={() => copy(link, d.id)} className="text-sm font-semibold text-pink-700 bg-pink-50 border border-pink-200 hover:bg-pink-100 rounded-lg px-4 py-2">{copied === d.id ? "Copied ✓" : "Copy"}</button>
                        <a href={link} target="_blank" rel="noreferrer" className="text-sm font-semibold text-gray-500 hover:text-slate-700 px-2">Open page ↗</a>
                      </div>
                      <div className="flex gap-1.5 flex-wrap mt-2">
                        <span className="text-[11px] text-gray-400 self-center">Tagged links:</span>
                        {SOURCES.map(s => <button key={s} onClick={() => copy(`${link}?src=${s}`, d.id + s)} className="text-[11px] font-semibold bg-gray-100 text-gray-500 hover:bg-gray-200 rounded-full px-2.5 py-1">{copied === d.id + s ? "Copied ✓" : s}</button>)}
                      </div>
                    </div>
                    <div>
                      <div className={lbl}>Embed on a brand website (iframe)</div>
                      <div className="flex gap-2 flex-wrap items-center">
                        <input readOnly value={`<iframe src="${link}?embed=1" width="100%" height="520" style="border:0" title="${d.title}"></iframe>`} className={inp + " flex-1 min-w-[260px] font-mono text-xs"} onFocus={e => e.target.select()} />
                        <button onClick={() => copy(`<iframe src="${link}?embed=1" width="100%" height="520" style="border:0" title="${d.title}"></iframe>`, d.id + "e")} className="text-sm font-semibold text-pink-700 bg-pink-50 border border-pink-200 hover:bg-pink-100 rounded-lg px-4 py-2">{copied === d.id + "e" ? "Copied ✓" : "Copy"}</button>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <a href={`/api/downloads/signups?download_id=${d.id}&format=csv`} className="text-sm font-semibold text-slate-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg px-3.5 py-2">Download signups (CSV)</a>
                      <a href={d.file_url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-slate-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg px-3.5 py-2">View file</a>
                      <button onClick={() => patch(d.id, { active: !d.active })} className="text-sm font-semibold text-slate-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg px-3.5 py-2">{d.active ? "Turn off" : "Turn on"}</button>
                      <button onClick={() => remove(d)} className="text-sm font-semibold text-gray-400 hover:text-rose-500 px-3 py-2">Delete</button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><tr className="text-left text-[11px] font-bold text-gray-400 uppercase tracking-wide border-b border-gray-100"><th className="py-2 pr-3">Name</th><th className="py-2 pr-3">Email</th><th className="py-2 pr-3">Opted in</th><th className="py-2 pr-3">Source</th><th className="py-2 pr-3">Klaviyo</th><th className="py-2">Date</th></tr></thead>
                        <tbody>
                          {signups.slice(0, 50).map(s => (
                            <tr key={s.id} className="border-b border-gray-50 last:border-0">
                              <td className="py-2 pr-3">{s.first_name || "—"}</td><td className="py-2 pr-3">{s.email}</td>
                              <td className="py-2 pr-3">{s.consent ? "Yes" : "No"}</td><td className="py-2 pr-3 text-gray-500">{s.source || "—"}</td>
                              <td className="py-2 pr-3 text-[12px]" title={s.klaviyo_status ?? ""}>{s.klaviyo_status === "ok" ? "✓" : (s.klaviyo_status || "—").slice(0, 24)}</td>
                              <td className="py-2 text-gray-400">{fmtD(s.created_at)}</td>
                            </tr>
                          ))}
                          {!signups.length && <tr><td colSpan={6} className="py-6 text-center text-gray-400">No signups yet.</td></tr>}
                        </tbody>
                      </table>
                      {signups.length > 50 && <p className="text-[11px] text-gray-400 mt-2">Showing the latest 50. Download the CSV for all {signups.length}.</p>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
