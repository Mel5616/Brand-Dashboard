"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function send() {
    if (!email.trim()) return;
    setLoading(true); setErr("");
    const supabase = createClient();
    const next = new URLSearchParams(window.location.search).get("next") || "/";
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    setLoading(false);
    if (error) setErr(error.message);
    else setSent(true);
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 w-full max-w-sm">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg">⚡</span>
          <h1 className="font-bold text-gray-800">Brand Command</h1>
        </div>
        <p className="text-sm text-gray-400 mb-6">Coolkidz Australia dashboard</p>

        {sent ? (
          <div className="text-center py-4">
            <div className="text-3xl mb-2">📩</div>
            <p className="text-sm font-semibold text-gray-700">Check your email</p>
            <p className="text-xs text-gray-400 mt-1">We sent a sign-in link to<br /><span className="text-gray-600">{email}</span>. Open it on this device.</p>
            <button onClick={() => setSent(false)} className="text-[11px] text-emerald-600 hover:underline mt-4">Use a different email</button>
          </div>
        ) : (
          <>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Work email</label>
            <input
              type="email" value={email} autoFocus
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") send(); }}
              placeholder="you@coolkidz.com.au"
              className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-300"
            />
            {err && <p className="text-[12px] text-rose-500 mt-2">{err}</p>}
            <button onClick={send} disabled={loading || !email.trim()}
              className="mt-4 w-full text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 rounded-lg py-2.5">
              {loading ? "Sending…" : "Email me a sign-in link"}
            </button>
            <p className="text-[11px] text-gray-300 text-center mt-4">No password needed — we email you a secure link.</p>
          </>
        )}
      </div>
    </div>
  );
}
