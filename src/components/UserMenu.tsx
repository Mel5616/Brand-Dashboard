"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function UserMenu({ email, role, minimal }: { email: string; role: string; minimal?: boolean }) {
  const [open, setOpen] = useState(false);
  async function signOut() {
    try {
      await fetch("/api/activity", { method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true, body: JSON.stringify({ action: "logout" }) });
    } catch { /* best-effort */ }
    await createClient().auth.signOut();
    window.location.href = "/login";
  }
  const initial = (email[0] || "?").toUpperCase();

  if (minimal) {
    return <button onClick={signOut} className="mt-4 text-xs font-semibold text-emerald-600 hover:underline">Sign out</button>;
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center hover:bg-emerald-200 transition-colors" title={email}>
        {initial}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-100 rounded-xl shadow-lg z-30 p-1">
          <div className="px-3 py-2 border-b border-gray-50">
            <p className="text-xs font-semibold text-slate-700 truncate">{email}</p>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">{role === "admin" ? "Admin · full access" : "Team member"}</p>
          </div>
          {role === "admin" && (
            <>
              <a href="/admin/users" className="block text-sm text-gray-600 hover:bg-gray-50 rounded-lg px-3 py-2 mt-1">Users &amp; access</a>
              <a href="/admin/activity" className="block text-sm text-gray-600 hover:bg-gray-50 rounded-lg px-3 py-2">Activity log</a>
            </>
          )}
          <a href="/security" className="block text-sm text-gray-600 hover:bg-gray-50 rounded-lg px-3 py-2 mt-1">Two-factor (2FA)</a>
          <button onMouseDown={signOut} className="w-full text-left text-sm text-gray-600 hover:bg-gray-50 rounded-lg px-3 py-2 mt-1">Sign out</button>
        </div>
      )}
    </div>
  );
}
