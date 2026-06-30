"use client";

import { useEffect, useMemo, useState } from "react";

type Row = {
  id: number; user_email: string | null; action: string; target: string | null;
  detail: any; path: string | null; method: string | null; ip: string | null; created_at: string;
};

const when = (s: string) => new Date(s).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" });
const pretty = (id: string) => id.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());

const ACTION_STYLE: Record<string, string> = {
  login: "bg-emerald-100 text-emerald-700", logout: "bg-slate-100 text-slate-600",
  view: "bg-sky-100 text-sky-700", create: "bg-violet-100 text-violet-700",
  update: "bg-amber-100 text-amber-700", delete: "bg-rose-100 text-rose-700",
};

function describe(r: Row): string {
  if (r.action === "login") return "Signed in";
  if (r.action === "logout") return "Signed out";
  if (r.action === "view") return `Viewed ${r.detail?.label || pretty(r.target || "")}`;
  const obj = (r.target || "").split("/")[0];
  const verb = r.action === "create" ? "Created in" : r.action === "delete" ? "Deleted from" : r.action === "update" ? "Updated" : "Changed";
  return `${verb} ${pretty(obj)}`;
}

export function ActivityLog() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [userF, setUserF] = useState("");
  const [actionF, setActionF] = useState("");

  async function load() {
    setLoading(true);
    const qs = new URLSearchParams();
    if (userF) qs.set("user", userF);
    if (actionF) qs.set("action", actionF);
    const r = await fetch(`/api/activity?${qs}`).then(x => x.json()).catch(() => ({ ok: false }));
    setLoading(false);
    if (!r.ok) { setNeedsSetup(true); return; }
    if (r.needsSetup) { setNeedsSetup(true); return; }
    setRows(r.rows);
  }
  useEffect(() => { load(); }, [userF, actionF]); // eslint-disable-line react-hooks/exhaustive-deps

  const users = useMemo(() => Array.from(new Set(rows.map(r => r.user_email).filter(Boolean))) as string[], [rows]);

  // Sessions: pair each sign-in with the next sign-out (or the user's last activity)
  // to show login time, how long they stayed, and how many pages they viewed.
  const sessions = useMemo(() => {
    const byUser: Record<string, Row[]> = {};
    rows.forEach(r => { const u = r.user_email || "?"; (byUser[u] ??= []).push(r); });
    const out: { user: string; start: string; mins: number; views: number; ongoing: boolean }[] = [];
    for (const [user, evs] of Object.entries(byUser)) {
      const asc = [...evs].sort((a, b) => a.created_at.localeCompare(b.created_at));
      for (let i = 0; i < asc.length; i++) {
        if (asc[i].action !== "login") continue;
        const start = asc[i].created_at;
        let logout: string | null = null, lastSeen = start, views = 0;
        for (let j = i + 1; j < asc.length; j++) {
          if (asc[j].action === "login") break;
          lastSeen = asc[j].created_at;
          if (asc[j].action === "view") views++;
          if (asc[j].action === "logout") { logout = asc[j].created_at; break; }
        }
        const end = logout ?? lastSeen;
        const mins = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
        out.push({ user, start, mins, views, ongoing: logout == null });
      }
    }
    return out.sort((a, b) => b.start.localeCompare(a.start)).slice(0, 40);
  }, [rows]);
  const dur = (m: number) => m < 1 ? "<1m" : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="mb-5">
          <a href="/" className="text-xs text-emerald-600 hover:underline">← Dashboard</a>
          <h1 className="text-xl font-bold text-slate-800 mt-1">Activity log</h1>
          <p className="text-sm text-slate-400">Every sign-in, page view, and change, per user.</p>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <select value={userF} onChange={e => setUserF(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white">
            <option value="">All users</option>
            {users.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
          <select value={actionF} onChange={e => setActionF(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white">
            <option value="">All activity</option>
            <option value="login">Sign-ins</option>
            <option value="view">Page views</option>
            <option value="create">Created</option>
            <option value="update">Updated</option>
            <option value="delete">Deleted</option>
          </select>
          <button onClick={load} className="text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg px-3 py-2">Refresh</button>
        </div>

        {needsSetup && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl p-4 mb-4">
            No activity yet, or the log table isn’t set up. Run <code>add_auth_activity.sql</code> in Supabase.
          </div>
        )}

        {/* Sessions — sign-in time, time spent, pages viewed */}
        {!needsSetup && sessions.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-4">
            <div className="px-4 py-3 border-b border-gray-50"><h2 className="text-sm font-semibold text-slate-700">Sessions</h2><p className="text-[11px] text-gray-400">When each person signed in, how long they stayed, and how many pages they viewed.</p></div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-400 text-xs uppercase tracking-wide">
                <tr><th className="text-left font-semibold px-4 py-3">User</th><th className="text-left font-semibold px-4 py-3">Signed in</th><th className="text-left font-semibold px-4 py-3">Time spent</th><th className="text-left font-semibold px-4 py-3">Pages</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sessions.map((s, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2.5 text-slate-700">{s.user}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">{when(s.start)}</td>
                    <td className="px-4 py-2.5 text-slate-600">{dur(s.mins)}{s.ongoing && <span className="text-[10px] text-amber-500 ml-1.5">no sign-out</span>}</td>
                    <td className="px-4 py-2.5 text-slate-500">{s.views}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-400 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left font-semibold px-4 py-3">When</th>
                <th className="text-left font-semibold px-4 py-3">User</th>
                <th className="text-left font-semibold px-4 py-3">Action</th>
                <th className="text-left font-semibold px-4 py-3">What</th>
                <th className="text-left font-semibold px-4 py-3">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-300">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-300">No activity.</td></tr>
              ) : rows.map(r => (
                <tr key={r.id}>
                  <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">{when(r.created_at)}</td>
                  <td className="px-4 py-2.5 text-slate-700">{r.user_email || "—"}</td>
                  <td className="px-4 py-2.5"><span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${ACTION_STYLE[r.action] || "bg-slate-100 text-slate-600"}`}>{r.action}</span></td>
                  <td className="px-4 py-2.5 text-slate-600">{describe(r)}{r.detail?.query ? <span className="text-slate-300"> {r.detail.query}</span> : null}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-400">{r.ip || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
