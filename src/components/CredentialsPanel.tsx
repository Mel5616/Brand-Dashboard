"use client";

import { useEffect, useState } from "react";

// Operations > Passwords — a simple encrypted credential store, admin-only
// (enforced server-side in /api/credentials regardless of this UI). List
// never carries a password; "Show" decrypts one entry on demand and hides
// it again after a few seconds.
type Item = {
  id: string; name: string; url: string | null; username: string | null; notes: string | null;
  created_by: string | null; updated_by: string | null; created_at: string; updated_at: string;
};

const inp = "text-sm border border-gray-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 w-full";
const lbl = "text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1";
const empty = { name: "", url: "", username: "", password: "", notes: "" };

export function CredentialsPanel() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [keyConfigured, setKeyConfigured] = useState(true);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealBusy, setRevealBusy] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  async function load() {
    const res = await fetch("/api/credentials").then(r => r.json()).catch(() => ({ ok: false }));
    if (res.ok) { setItems(res.items || []); setNeedsSetup(!!res.needsSetup); setKeyConfigured(res.keyConfigured !== false); }
    else setMsg(res?.error || "Couldn't load.");
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function save() {
    if (!form.name.trim() || !form.password.trim()) { setMsg("Name and password are required."); return; }
    setBusy(true); setMsg("");
    const url = editingId ? "/api/credentials" : "/api/credentials";
    const method = editingId ? "PATCH" : "POST";
    const body = editingId ? { id: editingId, action: "edit", ...form } : form;
    const d = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json()).catch(() => null);
    setBusy(false);
    if (d?.ok) { setForm(empty); setAdding(false); setEditingId(null); load(); } else setMsg(d?.error || "Couldn't save.");
  }

  function startEdit(it: Item) {
    setEditingId(it.id); setAdding(true);
    setForm({ name: it.name, url: it.url || "", username: it.username || "", password: "", notes: it.notes || "" });
    setMsg("Leave password blank to keep the current one.");
  }

  function cancelForm() { setAdding(false); setEditingId(null); setForm(empty); setMsg(""); }

  async function reveal(id: string) {
    if (revealed[id]) { setRevealed(r => { const n = { ...r }; delete n[id]; return n; }); return; }
    setRevealBusy(id);
    const d = await fetch("/api/credentials", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action: "reveal" }) }).then(r => r.json()).catch(() => null);
    setRevealBusy(null);
    if (d?.ok) {
      setRevealed(r => ({ ...r, [id]: d.password }));
      setTimeout(() => setRevealed(r => { const n = { ...r }; delete n[id]; return n; }), 10000);
    } else setMsg(d?.error || "Couldn't reveal password.");
  }

  async function copyPassword(id: string) {
    const pw = revealed[id];
    if (!pw) return;
    try { await navigator.clipboard.writeText(pw); setMsg("Password copied."); }
    catch { setMsg("Couldn't copy — select and copy it manually."); }
  }

  async function remove(id: string) {
    if (confirmDeleteId !== id) { setConfirmDeleteId(id); return; }
    setConfirmDeleteId(null);
    await fetch(`/api/credentials?id=${id}`, { method: "DELETE" });
    load();
  }

  const rows = items.filter(i => !search.trim() || [i.name, i.url, i.username, i.notes].join(" ").toLowerCase().includes(search.trim().toLowerCase()));

  if (loading) return <p className="text-sm text-slate-400 py-8 text-center">Loading…</p>;
  if (needsSetup) {
    return (
      <div className="text-sm text-slate-500 bg-white rounded-xl border border-gray-100 p-6">
        Passwords isn&apos;t set up yet — run <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">supabase/add_credentials.sql</code> in Supabase.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!keyConfigured && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-700">
          CREDENTIALS_ENCRYPTION_KEY isn&apos;t configured on the server — passwords can be viewed but not added or edited until that&apos;s set.
        </div>
      )}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Passwords</p>
            <p className="text-xs text-gray-400 mt-0.5">Stored encrypted. Admins only — click &quot;Show&quot; to reveal one password at a time.</p>
          </div>
          {!adding && <button onClick={() => setAdding(true)} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-4 py-2">+ Add password</button>}
        </div>

        {adding && (
          <div className="border border-gray-200 rounded-xl p-4 mb-4 grid sm:grid-cols-2 gap-3">
            <div><div className={lbl}>Name *</div><input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Filecamp" className={inp} /></div>
            <div><div className={lbl}>URL</div><input value={form.url} onChange={e => setForm(p => ({ ...p, url: e.target.value }))} placeholder="https://…" className={inp} /></div>
            <div><div className={lbl}>Username / email</div><input value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value }))} className={inp} /></div>
            <div><div className={lbl}>Password {editingId ? "(leave blank to keep current)" : "*"}</div><input type="text" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} className={inp + " font-mono"} /></div>
            <div className="sm:col-span-2"><div className={lbl}>Notes</div><textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} className={inp} /></div>
            <div className="sm:col-span-2 flex gap-2">
              <button onClick={save} disabled={busy} className="text-sm font-semibold text-white bg-slate-800 hover:bg-slate-900 rounded-lg px-4 py-2 disabled:opacity-60">{busy ? "Saving…" : editingId ? "Save changes" : "Add password"}</button>
              <button onClick={cancelForm} className="text-sm font-semibold text-gray-500 rounded-lg px-3 py-2">Cancel</button>
            </div>
          </div>
        )}

        {msg && <p className="text-[13px] text-slate-500 mb-3">{msg}</p>}

        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className={inp + " mb-3 max-w-xs"} />

        {rows.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Nothing here yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                  <th className="text-left font-semibold py-2 pr-3">Name</th>
                  <th className="text-left font-semibold py-2 pr-3">Username</th>
                  <th className="text-left font-semibold py-2 pr-3">Password</th>
                  <th className="text-left font-semibold py-2 pr-3">Notes</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map(it => (
                  <tr key={it.id}>
                    <td className="py-2 pr-3 font-medium text-slate-700 whitespace-nowrap">
                      {it.url ? <a href={it.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{it.name}</a> : it.name}
                    </td>
                    <td className="py-2 pr-3 text-slate-600 whitespace-nowrap">{it.username || "—"}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {revealed[it.id] ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="font-mono text-slate-700">{revealed[it.id]}</span>
                          <button onClick={() => copyPassword(it.id)} className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700">Copy</button>
                        </span>
                      ) : (
                        <button onClick={() => reveal(it.id)} disabled={revealBusy === it.id} className="text-[12px] font-semibold text-slate-500 hover:text-slate-700 disabled:opacity-50">{revealBusy === it.id ? "…" : "Show"}</button>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-gray-500 max-w-[240px] truncate">{it.notes || "—"}</td>
                    <td className="py-2 text-right whitespace-nowrap">
                      <button onClick={() => startEdit(it)} className="text-xs font-semibold text-slate-500 hover:text-slate-700 mr-3">Edit</button>
                      <button onClick={() => remove(it.id)} className={`text-xs font-semibold ${confirmDeleteId === it.id ? "text-rose-600" : "text-gray-300 hover:text-rose-500"}`}>{confirmDeleteId === it.id ? "Confirm delete" : "Delete"}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
