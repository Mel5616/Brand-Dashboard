"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Where invited users land (via the invite email → /auth/callback) to set their own password.
export default function SetPassword() {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function save() {
    if (pw.length < 8) { setMsg("Use at least 8 characters."); return; }
    if (pw !== pw2) { setMsg("Passwords don't match."); return; }
    setBusy(true); setMsg("");
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) { setMsg(/auth|session|JWT/i.test(error.message) ? "This link has expired — ask an admin to resend your invite." : error.message); return; }
    window.location.href = "/";
  }

  return (
    <main className="min-h-screen grid place-items-center bg-slate-50 p-6">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h1 className="text-lg font-bold text-slate-800">Set your password</h1>
        <p className="text-xs text-gray-400 mt-1 mb-4">Choose a password to finish setting up your Coolkidz dashboard account.</p>
        <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="New password (8+ characters)" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 mb-2 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        <input type="password" value={pw2} onChange={e => setPw2(e.target.value)} placeholder="Confirm password" onKeyDown={e => e.key === "Enter" && save()} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        {msg && <p className="text-xs text-rose-500 mb-3">{msg}</p>}
        <button onClick={save} disabled={busy} className="w-full text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg px-4 py-2">{busy ? "Saving…" : "Set password & continue"}</button>
      </div>
    </main>
  );
}
