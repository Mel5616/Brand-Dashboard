"use client";

import { useEffect, useMemo, useState } from "react";

// Media releases admin: create + track photography/media releases signed by
// guardians via the public /sign/[token] link. Admin-only tab.
type Release = {
  id: string; token: string; status: string; child_first_name: string;
  guardian_name: string; guardian_email: string; guardian_phone: string | null;
  guardian_relationship: string | null; brand: string; campaign: string | null;
  shoot_date: string | null; shoot_location: string | null; note: string | null;
  retail_partner_optin: boolean; terms_version: string; signed_name: string | null;
  pdf_path: string | null; signature_image_path: string | null;
  signed_at: string | null; withdrawn_at: string | null; expires_at: string; created_at: string;
};

const inp = "text-sm border border-gray-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400";
const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-slate-100 text-slate-500" },
  sent: { label: "Sent", cls: "bg-sky-100 text-sky-700" },
  signed: { label: "Signed", cls: "bg-emerald-100 text-emerald-700" },
  withdrawn: { label: "Withdrawn", cls: "bg-rose-100 text-rose-600" },
  expired: { label: "Expired", cls: "bg-amber-100 text-amber-700" },
};
const fmtD = (s: string | null) => s ? new Date(s).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "2-digit" }) : "—";

export function MediaReleases({ brands, admin = false }: { brands: { id: number; name: string }[]; admin?: boolean }) {
  const [rows, setRows] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [brandF, setBrandF] = useState("");
  const [statusF, setStatusF] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const empty = { child_first_name: "", guardian_name: "", guardian_email: "", brand: "", campaign: "", shoot_date: "", shoot_location: "", note: "" };
  const [f, setF] = useState<Record<string, string>>(empty);

  function load() {
    fetch("/api/releases").then(r => r.json()).then(d => {
      if (d?.needsSetup) setNeedsSetup(true);
      else if (d?.ok) setRows(d.releases ?? []);
    }).catch(() => {}).finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  const list = useMemo(() => rows.filter(r =>
    (!brandF || r.brand === brandF) && (!statusF || r.status === statusF)), [rows, brandF, statusF]);
  const qStart = useMemo(() => { const n = new Date(); const q = Math.floor(n.getMonth() / 3) * 3; return new Date(n.getFullYear(), q, 1).toISOString(); }, []);
  const kpis = {
    signedQ: rows.filter(r => r.status !== "withdrawn" && (r.signed_at ?? "") >= qStart).length,
    pending: rows.filter(r => r.status === "sent").length,
    active: rows.filter(r => r.status === "signed").length,
    withdrawn: rows.filter(r => r.status === "withdrawn").length,
  };

  async function create(draft: boolean) {
    setMsg("");
    const d = await fetch("/api/releases", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, draft }) }).then(r => r.json()).catch(() => null);
    if (d?.ok) {
      setShowForm(false); setF(empty); load();
      if (draft) setMsg("Saved as draft — nothing sent. Use 👁 Preview on the row, then Send link when you're happy.");
      else setMsg(d.emailed ? `Signing link emailed to ${d.release.guardian_email}.` : `Created, but the email failed (${d.emailError || "check RESEND_API_KEY"}) — use Resend on the row.`);
    } else setMsg(d?.error || "Couldn't create the release.");
  }
  async function act(id: string, action: string) {
    setBusyId(id);
    const d = await fetch("/api/releases", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action } ) }).then(r => r.json()).catch(() => null);
    setBusyId(null);
    if (d?.ok) { load(); if (action === "resend") setMsg(d.emailed ? "Fresh link emailed." : "Link refreshed but the email failed."); }
    else setMsg(d?.error || "Action failed.");
  }
  async function openFile(path: string | null) {
    if (!path) return;
    const d = await fetch(`/api/releases/file?path=${encodeURIComponent(path)}`).then(r => r.json()).catch(() => null);
    if (d?.ok) window.open(d.url, "_blank");
    else setMsg("Couldn't open the file.");
  }
  function exportCsv() {
    const cols = ["status", "child_first_name", "guardian_name", "guardian_email", "guardian_phone", "guardian_relationship", "brand", "campaign", "shoot_date", "shoot_location", "retail_partner_optin", "terms_version", "signed_name", "signed_at", "withdrawn_at", "created_at"];
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [cols.join(","), ...list.map(r => cols.map(c => esc((r as any)[c])).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `media-releases-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  if (loading) return <div className="p-6 text-center text-sm text-gray-400">Loading releases…</div>;
  if (needsSetup) return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center text-sm text-gray-500">Run <code className="bg-gray-100 px-1 rounded">supabase/add_media_releases.sql</code> to enable media releases.</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[["Signed this quarter", kpis.signedQ, "#10b981"], ["Awaiting signature", kpis.pending, "#0ea5e9"], ["Active releases", kpis.active, "#14b8a6"], ["Withdrawn", kpis.withdrawn, "#f43f5e"]].map(([l, v, c]) => (
          <div key={String(l)} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
            <p className="text-[11px] font-medium text-gray-400 flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: String(c) }} />{l}</p>
            <p className="text-2xl font-bold text-slate-800 mt-1 leading-none">{v as number}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setShowForm(v => !v)} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-4 py-2">{showForm ? "Close" : "+ New release"}</button>
        <select value={brandF} onChange={e => setBrandF(e.target.value)} className={inp}>
          <option value="">All brands</option>
          {[...new Set(rows.map(r => r.brand))].sort().map(b => <option key={b}>{b}</option>)}
        </select>
        <select value={statusF} onChange={e => setStatusF(e.target.value)} className={inp}>
          <option value="">All statuses</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button onClick={exportCsv} className="ml-auto text-[12.5px] font-semibold text-slate-500 hover:text-slate-700 border border-gray-200 rounded-lg px-3 py-2">⬇ Export CSV</button>
      </div>
      {msg && <p className="text-[13px] text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">{msg}</p>}

      {showForm && (
        <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-600 mb-3">New media release</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <input value={f.child_first_name} onChange={e => setF(p => ({ ...p, child_first_name: e.target.value }))} placeholder="Child first name * (first name only)" className={inp} />
            <input value={f.guardian_name} onChange={e => setF(p => ({ ...p, guardian_name: e.target.value }))} placeholder="Guardian full name *" className={inp} />
            <input value={f.guardian_email} onChange={e => setF(p => ({ ...p, guardian_email: e.target.value }))} placeholder="Guardian email *" className={inp} />
            <select value={f.brand} onChange={e => setF(p => ({ ...p, brand: e.target.value }))} className={inp}>
              <option value="">Brand *</option>
              {brands.map(b => <option key={b.id}>{b.name}</option>)}
              <option>Coolkidz</option>
            </select>
            <input value={f.campaign} onChange={e => setF(p => ({ ...p, campaign: e.target.value }))} placeholder="Campaign (optional)" className={inp} />
            <input type="date" value={f.shoot_date} onChange={e => setF(p => ({ ...p, shoot_date: e.target.value }))} className={inp} />
            <input value={f.shoot_location} onChange={e => setF(p => ({ ...p, shoot_location: e.target.value }))} placeholder="Shoot location" className={inp} />
            <input value={f.note} onChange={e => setF(p => ({ ...p, note: e.target.value }))} placeholder="Internal note (optional)" className={`${inp} sm:col-span-2`} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => create(true)} className="text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg px-5 py-2.5">Save as draft · preview first</button>
            <button onClick={() => create(false)} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-5 py-2.5">Create &amp; email signing link</button>
          </div>
          <p className="text-[11px] text-gray-400 mt-2">Draft = nothing is emailed; you can preview the exact page first, then Send link. The guardian&apos;s link is single-use and expires 14 days after sending. Terms are the standard versioned template — no per-release editing.</p>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                <th className="text-left px-5 py-2.5">Child / guardian</th>
                <th className="text-left px-3 py-2.5">Brand · campaign</th>
                <th className="text-left px-3 py-2.5">Shoot</th>
                <th className="text-left px-3 py-2.5">Status</th>
                <th className="text-right px-3 py-2.5">Executed</th>
                <th className="text-right px-5 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && <tr><td colSpan={6} className="px-5 py-10 text-center text-gray-300">No releases yet — create the first one above.</td></tr>}
              {list.map((r, i) => {
                const st = STATUS[r.status] ?? STATUS.draft;
                return (
                  <tr key={r.id} className={`border-b border-gray-50 last:border-0 ${i % 2 === 1 ? "bg-gray-50/50" : ""}`}>
                    <td className="px-5 py-2.5">
                      <p className="font-semibold text-slate-700">{r.child_first_name}{r.retail_partner_optin && <span title="Retail partner opt-in" className="ml-1.5 text-[9px] font-bold text-teal-700 bg-teal-50 rounded px-1 py-0.5 align-middle">RETAIL ✓</span>}</p>
                      <p className="text-[11.5px] text-gray-400">{r.guardian_name} · {r.guardian_email}</p>
                    </td>
                    <td className="px-3 py-2.5 text-[12.5px] text-slate-600">{[r.brand, r.campaign].filter(Boolean).join(" · ")}</td>
                    <td className="px-3 py-2.5 text-[12.5px] text-slate-600">{[fmtD(r.shoot_date), r.shoot_location].filter(x => x && x !== "—").join(" · ") || "—"}</td>
                    <td className="px-3 py-2.5">
                      <span className={`text-[10.5px] font-bold rounded-full px-2 py-0.5 ${st.cls}`}>{st.label}</span>
                      {r.status === "sent" && <p className="text-[10px] text-gray-400 mt-0.5">expires {fmtD(r.expires_at)}</p>}
                      {r.status === "withdrawn" && <p className="text-[10px] text-gray-400 mt-0.5">{fmtD(r.withdrawn_at)}</p>}
                    </td>
                    <td className="px-3 py-2.5 text-right text-[12px] text-gray-400">{fmtD(r.signed_at)}</td>
                    <td className="px-5 py-2.5 text-right whitespace-nowrap">
                      {r.status !== "signed" && r.status !== "withdrawn" && (
                        <>
                          <a href={`/sign/${r.token}`} target="_blank" rel="noreferrer" className="text-[12px] font-semibold text-violet-600 hover:underline mr-2.5">👁 View</a>
                          <button onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/sign/${r.token}`); setMsg("Signing link copied."); }}
                            className="text-[12px] font-semibold text-slate-500 hover:underline mr-2.5">⧉ Link</button>
                        </>
                      )}
                      {r.status === "signed" || r.status === "withdrawn"
                        ? (r.pdf_path
                          ? <button onClick={() => openFile(r.pdf_path)} className="text-[12px] font-semibold text-emerald-600 hover:underline mr-2.5">PDF</button>
                          : <a href={`/api/releases/pdf?id=${r.id}`} target="_blank" rel="noreferrer" className="text-[12px] font-semibold text-emerald-600 hover:underline mr-2.5">PDF</a>)
                        : <a href={`/api/releases/pdf?id=${r.id}`} target="_blank" rel="noreferrer" className="text-[12px] font-semibold text-emerald-600 hover:underline mr-2.5" title="Unsigned copy with a blank signature block">PDF</a>}
                      {r.status === "draft" && (
                        <button disabled={busyId === r.id} onClick={() => act(r.id, "resend")} className="text-[12px] font-semibold text-emerald-600 hover:underline mr-2.5 disabled:opacity-50">Send link</button>
                      )}
                      {(r.status === "sent" || r.status === "expired") && (
                        <>
                          <button disabled={busyId === r.id} onClick={() => act(r.id, "resend")} className="text-[12px] font-semibold text-sky-600 hover:underline mr-2.5 disabled:opacity-50">Resend</button>
                          {r.status === "sent" && <button disabled={busyId === r.id} onClick={() => act(r.id, "void")} className="text-[12px] font-semibold text-gray-400 hover:underline mr-2.5 disabled:opacity-50">Void</button>}
                        </>
                      )}
                      {r.status === "signed" && admin && (
                        <button disabled={busyId === r.id} onClick={() => { if (confirm(`Mark ${r.child_first_name}'s release as withdrawn? The signed record is kept.`)) act(r.id, "withdraw"); }}
                          className="text-[12px] font-semibold text-rose-500 hover:underline disabled:opacity-50">Withdraw</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[11px] text-gray-400">Only the child&apos;s first name is stored. Signatures and PDFs live in private storage — links here are short-lived signed URLs. Terms version {rows[0]?.terms_version ?? "2026-07-v1"} · legal review pending before first live signing.</p>
    </div>
  );
}
