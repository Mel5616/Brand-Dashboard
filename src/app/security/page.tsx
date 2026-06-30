"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Self-service two-factor (TOTP) setup. Optional for now; admins can reset it.
export default function Security() {
  const supabase = createClient();
  const [factors, setFactors] = useState<any[]>([]);
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function load() {
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors([...(data?.totp ?? [])]);
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function startEnroll() {
    setBusy(true); setMsg("");
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Authenticator ${Date.now()}` });
    setBusy(false);
    if (error) { setMsg(/not enabled|unsupported/i.test(error.message) ? "Two-factor isn't enabled on the project yet — ask the admin to turn it on in Supabase." : error.message); return; }
    setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function verify() {
    if (!enroll) return;
    setBusy(true); setMsg("");
    const { data: ch, error: cErr } = await supabase.auth.mfa.challenge({ factorId: enroll.id });
    if (cErr) { setBusy(false); setMsg(cErr.message); return; }
    const { error } = await supabase.auth.mfa.verify({ factorId: enroll.id, challengeId: ch.id, code: code.trim() });
    setBusy(false);
    if (error) { setMsg("That code didn't match — check the app and try again."); return; }
    setEnroll(null); setCode(""); setMsg("✓ Two-factor is now on."); load();
  }

  async function remove(id: string) {
    if (!confirm("Turn off two-factor for your account?")) return;
    await supabase.auth.mfa.unenroll({ factorId: id });
    load();
  }

  const active = factors.filter(f => f.status === "verified");

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-lg mx-auto">
        <a href="/" className="text-xs text-emerald-600 hover:underline">← Dashboard</a>
        <h1 className="text-xl font-bold text-slate-800 mt-1">Security</h1>
        <p className="text-sm text-slate-400 mb-5">Add two-factor authentication with an authenticator app (Google Authenticator, 1Password, Authy).</p>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          {active.length > 0 && !enroll && (
            <div className="flex items-center justify-between">
              <div><p className="text-sm font-semibold text-emerald-600">✓ Two-factor is on</p><p className="text-xs text-gray-400">You'll enter a code from your app when you sign in.</p></div>
              <button onClick={() => remove(active[0].id)} className="text-xs font-medium text-rose-400 hover:text-rose-600">Turn off</button>
            </div>
          )}

          {active.length === 0 && !enroll && (
            <button onClick={startEnroll} disabled={busy} className="text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg px-4 py-2">{busy ? "…" : "Set up two-factor"}</button>
          )}

          {enroll && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">Scan this with your authenticator app, then enter the 6-digit code.</p>
              <div className="flex items-center gap-4">
                <img src={enroll.qr} alt="2FA QR code" className="w-40 h-40 border border-gray-100 rounded-lg" />
                <div className="text-xs text-gray-400 break-all">Or enter the key manually:<br /><code className="text-slate-600">{enroll.secret}</code></div>
              </div>
              <input value={code} onChange={e => setCode(e.target.value)} inputMode="numeric" maxLength={6} placeholder="6-digit code" className="w-40 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              <div className="flex gap-2">
                <button onClick={verify} disabled={busy || code.length < 6} className="text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg px-4 py-2">{busy ? "Verifying…" : "Verify & turn on"}</button>
                <button onClick={() => { setEnroll(null); setCode(""); }} className="text-sm font-medium text-gray-500 hover:text-gray-700 px-3">Cancel</button>
              </div>
            </div>
          )}

          {msg && <p className={`text-xs mt-3 ${msg.startsWith("✓") ? "text-emerald-600" : "text-rose-500"}`}>{msg}</p>}
        </div>
      </div>
    </main>
  );
}
