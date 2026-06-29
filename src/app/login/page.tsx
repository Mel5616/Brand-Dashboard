"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function signIn() {
    if (!email.trim() || !password) return;
    setLoading(true); setErr("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) { setLoading(false); setErr(error.message); return; }
    // Record the sign-in, then go to the requested page.
    try {
      await fetch("/api/activity", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", path: "/login" }),
      });
    } catch { /* tracking is best-effort */ }
    const next = new URLSearchParams(window.location.search).get("next") || "/";
    window.location.href = next;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 w-full max-w-sm">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg">⚡</span>
          <h1 className="font-bold text-gray-800">Brand Command</h1>
        </div>
        <p className="text-sm text-gray-400 mb-6">Coolkidz Australia dashboard</p>

        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Work email</label>
        <input
          type="email" value={email} autoFocus autoComplete="username"
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") document.getElementById("pw")?.focus(); }}
          placeholder="you@coolkidz.com.au"
          className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-300"
        />
        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mt-3">Password</label>
        <input
          id="pw" type="password" value={password} autoComplete="current-password"
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") signIn(); }}
          placeholder="••••••••"
          className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-300"
        />
        {err && <p className="text-[12px] text-rose-500 mt-2">{err}</p>}
        <button onClick={signIn} disabled={loading || !email.trim() || !password}
          className="mt-4 w-full text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 rounded-lg py-2.5">
          {loading ? "Signing in…" : "Sign in"}
        </button>
        <p className="text-[11px] text-gray-300 text-center mt-4">Forgot your password? Ask an admin to reset it.</p>
      </div>
    </div>
  );
}
