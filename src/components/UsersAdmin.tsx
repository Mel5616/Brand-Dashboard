"use client";

import { useEffect, useState } from "react";
import type { TabSection } from "@/lib/tabs";

type Row = {
  id: string; email: string; name: string; role: "admin" | "member";
  allowed_tabs: string[]; disabled: boolean; envAdmin: boolean;
  last_sign_in_at: string | null; created_at: string | null;
};

const when = (s: string | null) => s ? new Date(s).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" }) : "—";

export function UsersAdmin({ sections, adminOnly }: { sections: TabSection[]; adminOnly: string[] }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  async function load() {
    setLoading(true);
    const r = await fetch("/api/users").then(x => x.json()).catch(() => ({ ok: false }));
    setLoading(false);
    if (!r.ok) { setNeedsSetup(true); return; }
    setNeedsSetup(false);
    setRows(r.rows);
  }
  useEffect(() => { load(); }, []);

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <div>
            <a href="/" className="text-xs text-emerald-600 hover:underline">← Dashboard</a>
            <h1 className="text-xl font-bold text-slate-800 mt-1">Users &amp; access</h1>
            <p className="text-sm text-slate-400">Create accounts, set passwords, and control which sections each person sees.</p>
          </div>
          <button onClick={() => setShowCreate(true)} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-4 py-2">+ Add user</button>
        </div>

        {needsSetup && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl p-4 mb-4">
            Couldn’t load users. Make sure <code>add_auth_activity.sql</code> has been run in Supabase.
          </div>
        )}

        {showCreate && <CreateUser sections={sections} adminOnly={adminOnly} onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); load(); }} />}

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-400 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left font-semibold px-4 py-3">User</th>
                <th className="text-left font-semibold px-4 py-3">Role</th>
                <th className="text-left font-semibold px-4 py-3">Access</th>
                <th className="text-left font-semibold px-4 py-3">Last sign-in</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-300">Loading…</td></tr>
              ) : rows.length === 0 && !needsSetup ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-300">No users yet.</td></tr>
              ) : rows.map(u => (
                <UserRow key={u.id} u={u} sections={sections} adminOnly={adminOnly} open={editing === u.id}
                  onToggle={() => setEditing(editing === u.id ? null : u.id)} onChanged={load} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function UserRow({ u, sections, adminOnly, open, onToggle, onChanged }: { u: Row; sections: TabSection[]; adminOnly: string[]; open: boolean; onToggle: () => void; onChanged: () => void }) {
  return (
    <>
      <tr className={u.disabled ? "opacity-50" : ""}>
        <td className="px-4 py-3">
          <div className="font-medium text-slate-700">{u.name || u.email}</div>
          {u.name && <div className="text-xs text-slate-400">{u.email}</div>}
          {u.disabled && <span className="text-[10px] font-semibold text-rose-500 uppercase">Disabled</span>}
        </td>
        <td className="px-4 py-3">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${u.role === "admin" ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-600"}`}>{u.role}</span>
        </td>
        <td className="px-4 py-3 text-xs text-slate-500">{u.role === "admin" ? "All sections" : (u.allowed_tabs.length ? `${u.allowed_tabs.length} section${u.allowed_tabs.length > 1 ? "s" : ""}` : "None")}</td>
        <td className="px-4 py-3 text-xs text-slate-500">{when(u.last_sign_in_at)}</td>
        <td className="px-4 py-3 text-right whitespace-nowrap">
          {u.role === "member" && !u.disabled && <a href={`/?preview=${encodeURIComponent(u.id)}`} className="text-xs text-slate-500 hover:underline mr-3">View as</a>}
          <button onClick={onToggle} className="text-xs text-emerald-600 hover:underline">{open ? "Close" : "Manage"}</button>
        </td>
      </tr>
      {open && <tr><td colSpan={5} className="px-4 pb-4 bg-slate-50/60"><EditUser u={u} sections={sections} adminOnly={adminOnly} onChanged={onChanged} /></td></tr>}
    </>
  );
}

function TabPicker({ value, onChange, sections, adminOnly }: { value: string[]; onChange: (v: string[]) => void; sections: TabSection[]; adminOnly: string[] }) {
  const grantable = sections.flatMap(s => s.tabs.map(t => t.id)).filter(id => !adminOnly.includes(id));
  const allOn = grantable.every(id => value.includes(id));
  function toggleSection(ids: string[], on: boolean) {
    const set = new Set(value);
    ids.filter(id => !adminOnly.includes(id)).forEach(id => on ? set.add(id) : set.delete(id));
    onChange([...set]);
  }
  return (
    <div className="space-y-3">
      <button type="button" onClick={() => onChange(allOn ? value.filter(v => adminOnly.includes(v)) : [...new Set([...value, ...grantable])])}
        className="text-[11px] font-semibold text-emerald-600 hover:underline">{allOn ? "Clear all" : "Select all"}</button>
      {sections.map(sec => {
        const ids = sec.tabs.map(t => t.id);
        const granIds = ids.filter(id => !adminOnly.includes(id));
        const secOn = granIds.length > 0 && granIds.every(id => value.includes(id));
        return (
          <div key={sec.label}>
            <div className="flex items-center gap-2 mb-1">
              {granIds.length > 0 && (
                <input type="checkbox" checked={secOn} onChange={e => toggleSection(ids, e.target.checked)} className="accent-emerald-500" />
              )}
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{sec.label}</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 ml-5">
              {sec.tabs.map(t => {
                const locked = adminOnly.includes(t.id);
                return (
                  <label key={t.id} className={`flex items-center gap-2 text-xs ${locked ? "text-slate-300" : "text-slate-600"}`} title={locked ? "Admin only" : undefined}>
                    <input type="checkbox" disabled={locked} checked={!locked && value.includes(t.id)}
                      onChange={e => onChange(e.target.checked ? [...value, t.id] : value.filter(x => x !== t.id))} />
                    {t.label}{locked && <span className="text-[9px] uppercase text-slate-300">admin</span>}
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EditUser({ u, sections, adminOnly, onChanged }: { u: Row; sections: TabSection[]; adminOnly: string[]; onChanged: () => void }) {
  const [role, setRole] = useState(u.role);
  const [tabs, setTabs] = useState<string[]>(u.allowed_tabs);
  const [name, setName] = useState(u.name);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function call(body: any) {
    setBusy(true); setMsg("");
    const r = await fetch("/api/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: u.id, ...body }) }).then(x => x.json()).catch(() => ({ ok: false }));
    setBusy(false);
    if (!r.ok) { setMsg(r.error || "Failed."); return; }
    setMsg("Saved."); onChanged();
  }
  async function remove() {
    if (!confirm(`Delete ${u.email}? This removes their account.`)) return;
    setBusy(true);
    const r = await fetch(`/api/users?id=${encodeURIComponent(u.id)}`, { method: "DELETE" }).then(x => x.json()).catch(() => ({ ok: false }));
    setBusy(false);
    if (!r.ok) { setMsg(r.error || "Failed."); return; }
    onChanged();
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 grid md:grid-cols-2 gap-5">
      <div className="space-y-3">
        <div>
          <label className="text-xs font-semibold text-slate-400 uppercase">Display name</label>
          <input value={name} onChange={e => setName(e.target.value)} className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2" placeholder="Optional" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-400 uppercase">Role</label>
          <select value={role} onChange={e => setRole(e.target.value as any)} disabled={u.envAdmin} className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white">
            <option value="member">Member</option>
            <option value="admin">Admin (full access)</option>
          </select>
          {u.envAdmin && <p className="text-[11px] text-slate-400 mt-1">This account is a permanent admin (set in environment).</p>}
        </div>
        <button onClick={() => call({ role, name, allowed_tabs: tabs })} disabled={busy} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 rounded-lg px-4 py-2">Save changes</button>
        {msg && <span className="text-xs text-slate-500 ml-2">{msg}</span>}
      </div>

      <div className="space-y-3">
        {role !== "admin" && (
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase">Sections this user can see</label>
            <div className="mt-1.5"><TabPicker value={tabs} onChange={setTabs} sections={sections} adminOnly={adminOnly} /></div>
          </div>
        )}
        <div>
          <label className="text-xs font-semibold text-slate-400 uppercase">Reset password</label>
          <div className="flex gap-2 mt-1">
            <input type="text" value={pw} onChange={e => setPw(e.target.value)} placeholder="New password (8+ chars)" className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2" />
            <button onClick={() => { if (pw.length >= 8) { call({ password: pw }); setPw(""); } else setMsg("Password must be at least 8 characters."); }} disabled={busy || pw.length < 8} className="text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-lg px-3 py-2">Set</button>
          </div>
        </div>
        <div className="flex items-center gap-4 pt-1">
          {!u.envAdmin && <button onClick={() => call({ disabled: !u.disabled })} disabled={busy} className="text-xs text-amber-600 hover:underline">{u.disabled ? "Re-enable account" : "Disable account"}</button>}
          {!u.envAdmin && <button onClick={remove} disabled={busy} className="text-xs text-rose-500 hover:underline">Delete account</button>}
        </div>
      </div>
    </div>
  );
}

function CreateUser({ sections, adminOnly, onClose, onSaved }: { sections: TabSection[]; adminOnly: string[]; onClose: () => void; onSaved: () => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [tabs, setTabs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function create() {
    setBusy(true); setErr("");
    const r = await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, name, password: pw, role, allowed_tabs: tabs }) }).then(x => x.json()).catch(() => ({ ok: false }));
    setBusy(false);
    if (!r.ok) { setErr(r.error || "Could not create user."); return; }
    onSaved();
  }

  return (
    <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm p-5 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-slate-700">New user</h2>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <div><label className="text-xs font-semibold text-slate-400 uppercase">Email</label><input value={email} onChange={e => setEmail(e.target.value)} placeholder="name@coolkidz.com.au" className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2" /></div>
          <div><label className="text-xs font-semibold text-slate-400 uppercase">Display name</label><input value={name} onChange={e => setName(e.target.value)} placeholder="Optional" className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2" /></div>
          <div><label className="text-xs font-semibold text-slate-400 uppercase">Password</label><input type="text" value={pw} onChange={e => setPw(e.target.value)} placeholder="8+ characters" className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2" /></div>
          <div><label className="text-xs font-semibold text-slate-400 uppercase">Role</label>
            <select value={role} onChange={e => setRole(e.target.value as any)} className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white"><option value="member">Member</option><option value="admin">Admin (full access)</option></select>
          </div>
        </div>
        <div>
          {role === "member" ? (
            <>
              <label className="text-xs font-semibold text-slate-400 uppercase">Sections this user can see</label>
              <div className="mt-1.5"><TabPicker value={tabs} onChange={setTabs} sections={sections} adminOnly={adminOnly} /></div>
            </>
          ) : <p className="text-xs text-slate-400">Admins can see every section.</p>}
        </div>
      </div>
      {err && <p className="text-xs text-rose-500 mt-3">{err}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="text-sm text-slate-500 px-4 py-2">Cancel</button>
        <button onClick={create} disabled={busy || !email || pw.length < 8} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 rounded-lg px-4 py-2">{busy ? "Creating…" : "Create user"}</button>
      </div>
    </div>
  );
}
