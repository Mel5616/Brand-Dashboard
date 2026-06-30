"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function Login() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [mfa, setMfa] = useState<{ factorId: string } | null>(null); // shown when the account has 2FA
  const [code, setCode] = useState("");

  async function finish() {
    try {
      await fetch("/api/activity", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "login", path: "/login" }) });
    } catch { /* tracking is best-effort */ }
    const next = new URLSearchParams(window.location.search).get("next") || "/";
    window.location.href = next;
  }

  async function signIn() {
    if (!email.trim() || !password) return;
    setLoading(true); setErr("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) { setLoading(false); setErr(error.message); return; }
    // If the account has two-factor, ask for the code before continuing.
    try {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.currentLevel === "aal1" && aal?.nextLevel === "aal2") {
        const { data: f } = await supabase.auth.mfa.listFactors();
        const totp = (f?.totp ?? []).find((x: any) => x.status === "verified");
        if (totp) { setMfa({ factorId: totp.id }); setLoading(false); return; }
      }
    } catch { /* MFA not enabled — proceed */ }
    await finish();
  }

  async function verifyCode() {
    if (!mfa || code.trim().length < 6) return;
    setLoading(true); setErr("");
    const { data: ch, error: cErr } = await supabase.auth.mfa.challenge({ factorId: mfa.factorId });
    if (cErr) { setLoading(false); setErr(cErr.message); return; }
    const { error } = await supabase.auth.mfa.verify({ factorId: mfa.factorId, challengeId: ch.id, code: code.trim() });
    if (error) { setLoading(false); setErr("That code didn't match — try again."); return; }
    await finish();
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 w-full max-w-sm">
        <div className="flex justify-center mb-5">
          <img src="/logos/Coolkidz Logo.png" alt="Coolkidz Australia" className="h-10 w-auto object-contain" />
        </div>
        <h1 className="text-2xl font-bold text-gray-800">Sign in</h1>
        <p className="text-sm text-gray-400 mt-1 mb-6">Coolkidz staff only. Sign in with your work email and password.</p>

        {!mfa ? (
          <>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Work email</label>
            <input type="email" value={email} autoFocus autoComplete="username" onChange={e => setEmail(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") document.getElementById("pw")?.focus(); }} placeholder="you@coolkidz.com.au"
              className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-300" />
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mt-3">Password</label>
            <input id="pw" type="password" value={password} autoComplete="current-password" onChange={e => setPassword(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") signIn(); }} placeholder="••••••••"
              className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-300" />
            {err && <p className="text-[12px] text-rose-500 mt-2">{err}</p>}
            <button onClick={signIn} disabled={loading || !email.trim() || !password}
              className="mt-4 w-full text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 rounded-lg py-2.5">
              {loading ? "Signing in…" : "Sign in"}
            </button>
            <p className="text-[11px] text-gray-300 text-center mt-4">Forgot your password? Ask an admin to reset it.</p>
          </>
        ) : (
          <>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Two-factor code</label>
            <p className="text-[11px] text-gray-400 mt-0.5 mb-1">Enter the 6-digit code from your authenticator app.</p>
            <input autoFocus inputMode="numeric" maxLength={6} value={code} onChange={e => setCode(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") verifyCode(); }} placeholder="123456"
              className="mt-1 w-full text-sm tracking-[0.4em] text-center border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-300" />
            {err && <p className="text-[12px] text-rose-500 mt-2">{err}</p>}
            <button onClick={verifyCode} disabled={loading || code.trim().length < 6}
              className="mt-4 w-full text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 rounded-lg py-2.5">
              {loading ? "Verifying…" : "Verify & sign in"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
