"use client";

import { useEffect, useState } from "react";

type Member = { id: string; email: string; role: string; allowed_tabs: string[] };

// Tabs an admin can grant to a member (budget + influencer are admin-only)
const ASSIGNABLE: { id: string; label: string }[] = [
  { id: "brands", label: "Overview" },
  { id: "shopify", label: "Shopify" },
  { id: "google-ads", label: "Google Ads" },
  { id: "meta-ads", label: "Meta Ads" },
  { id: "tradeshows", label: "Tradeshows" },
  { id: "calendar", label: "Calendar" },
  { id: "content", label: "Content" },
  { id: "gifting", label: "Gifting (team)" },
];

export function TeamPanel() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState("");
  const [newTabs, setNewTabs] = useState<string[]>(["content", "calendar"]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  function load() {
    fetch("/api/team").then(r => r.json()).then(d => { setMembers(d.members ?? []); setLoading(false); }).catch(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  async function invite() {
    if (!email.trim()) return;
    setBusy(true); setMsg("");
    const res = await fetch("/api/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim(), role: "member", allowed_tabs: newTabs }) }).then(r => r.json()).catch(() => null);
    setBusy(false);
    if (res?.ok) { setEmail(""); setAdding(false); setMsg("Invite sent ✓"); load(); }
    else setMsg(res?.error || "Couldn't invite — try again.");
  }
  async function toggleTab(m: Member, tab: string) {
    const tabs = m.allowed_tabs?.includes(tab) ? m.allowed_tabs.filter(t => t !== tab) : [...(m.allowed_tabs ?? []), tab];
    setMembers(prev => prev.map(x => x.id === m.id ? { ...x, allowed_tabs: tabs } : x));
    await fetch("/api/team", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: m.id, allowed_tabs: tabs }) });
  }
  async function setRole(m: Member, role: string) {
    setMembers(prev => prev.map(x => x.id === m.id ? { ...x, role } : x));
    await fetch("/api/team", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: m.id, role }) });
  }
  async function remove(m: Member) {
    if (!confirm(`Remove ${m.email}? They’ll lose access.`)) return;
    await fetch(`/api/team?id=${m.id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="max-w-screen-lg mx-auto px-6 py-8 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-semibold text-gray-800">Team &amp; Access</h2>
          <p className="text-xs text-gray-400 mt-0.5">Invite people and choose exactly which sections they can open. You (admin) and other admins see everything; Budget &amp; Influencer stay admin-only.</p>
        </div>
        <button onClick={() => setAdding(a => !a)} className="text-xs font-semibold text-white bg-indigo-500 hover:bg-indigo-600 rounded-lg px-3 py-2">+ Invite member</button>
      </div>

      {adding && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Email</label>
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="name@coolkidz.com.au" className="mt-1 w-full max-w-sm text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mt-4 mb-1.5">Can access</p>
          <div className="flex flex-wrap gap-2">
            {ASSIGNABLE.map(t => {
              const on = newTabs.includes(t.id);
              return (
                <button key={t.id} onClick={() => setNewTabs(p => on ? p.filter(x => x !== t.id) : [...p, t.id])}
                  className={`text-xs font-medium rounded-full px-3 py-1.5 border transition-colors ${on ? "bg-indigo-50 border-indigo-200 text-indigo-700" : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"}`}>
                  {on ? "✓ " : ""}{t.label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2 mt-4">
            <button disabled={busy || !email.trim()} onClick={invite} className="text-sm font-semibold text-white bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 rounded-lg px-4 py-2">{busy ? "Inviting…" : "Send invite"}</button>
            <button onClick={() => setAdding(false)} className="text-sm text-gray-400 hover:text-gray-600 px-2">Cancel</button>
            {msg && <span className="text-xs text-gray-500">{msg}</span>}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <p className="text-sm text-gray-400 py-8 text-center">Loading…</p>
        ) : members.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">No team members yet. Invite someone to get started.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {members.map(m => (
              <div key={m.id} className="p-4 flex items-start gap-4 flex-wrap">
                <div className="min-w-[180px]">
                  <p className="text-sm font-medium text-slate-700">{m.email}</p>
                  <select value={m.role} onChange={e => setRole(m, e.target.value)} className="mt-1 text-[11px] border border-gray-200 rounded px-1.5 py-0.5 text-gray-500 focus:outline-none">
                    <option value="member">Member</option>
                    <option value="admin">Admin (full access)</option>
                  </select>
                </div>
                <div className="flex-1 min-w-[260px]">
                  {m.role === "admin" ? (
                    <p className="text-xs text-gray-400 pt-1.5">Full access to all sections (incl. Budget &amp; Influencer).</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {ASSIGNABLE.map(t => {
                        const on = m.allowed_tabs?.includes(t.id);
                        return (
                          <button key={t.id} onClick={() => toggleTab(m, t.id)}
                            className={`text-[11px] font-medium rounded-full px-2.5 py-1 border transition-colors ${on ? "bg-indigo-50 border-indigo-200 text-indigo-700" : "bg-white border-gray-200 text-gray-400 hover:border-gray-300"}`}>
                            {on ? "✓ " : ""}{t.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <button onClick={() => remove(m)} className="text-[11px] text-rose-400 hover:text-rose-600">Remove</button>
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="text-[11px] text-gray-300">Members sign in with an email magic link. Budget &amp; Influencer cost data are never sent to non-admins.</p>
    </div>
  );
}
