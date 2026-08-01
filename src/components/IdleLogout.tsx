"use client";

import { useEffect } from "react";

// Signs the user out after 10 minutes without any interaction. Last-activity
// time is shared across tabs via localStorage, so activity in one dashboard
// tab keeps the others alive, and any idle tab performs the same sign-out.
// A 60-second warning toast gives active-but-reading users a chance to stay in.
const IDLE_MS = 10 * 60 * 1000;
const WARN_MS = 60 * 1000;
const LS_KEY = "dashLastActive";

// Emails never auto-logged-out (the owner's always-on dashboard screens)
const EXEMPT = ["mel@coolkidz.com.au"];

export function IdleLogout({ email }: { email?: string | null }) {
  useEffect(() => {
    if (EXEMPT.includes((email ?? "").toLowerCase())) return;
    const touch = () => { try { localStorage.setItem(LS_KEY, String(Date.now())); } catch { /* noop */ } };
    touch();

    let warnEl: HTMLDivElement | null = null;
    const clearWarn = () => { warnEl?.remove(); warnEl = null; };
    const showWarn = () => {
      if (warnEl) return;
      warnEl = document.createElement("div");
      warnEl.style.cssText = "position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#0f172a;color:#fff;border-radius:12px;padding:12px 18px;font-size:13px;font-weight:600;box-shadow:0 10px 30px rgba(0,0,0,.35);display:flex;gap:12px;align-items:center";
      warnEl.innerHTML = `<span>⏱ You'll be signed out in a minute due to inactivity.</span>`;
      const btn = document.createElement("button");
      btn.textContent = "I'm still here";
      btn.style.cssText = "background:#10b981;color:#fff;border:0;border-radius:8px;padding:6px 12px;font-size:12.5px;font-weight:700;cursor:pointer";
      btn.onclick = () => { touch(); clearWarn(); };
      warnEl.appendChild(btn);
      document.body.appendChild(warnEl);
    };

    let ticking = false;
    const activity = () => {
      // throttle the localStorage writes from mousemove spam
      if (ticking) return;
      ticking = true;
      setTimeout(() => { ticking = false; }, 5000);
      touch();
      clearWarn();
    };
    const EVENTS: (keyof WindowEventMap)[] = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"];
    EVENTS.forEach(e => window.addEventListener(e, activity, { passive: true }));
    const onVisible = () => { if (document.visibilityState === "visible") activity(); };
    document.addEventListener("visibilitychange", onVisible);

    const check = setInterval(() => {
      let last = Date.now();
      try { last = Number(localStorage.getItem(LS_KEY)) || Date.now(); } catch { /* noop */ }
      const idle = Date.now() - last;
      if (idle >= IDLE_MS) {
        clearInterval(check);
        window.location.href = "/api/signout";
      } else if (idle >= IDLE_MS - WARN_MS) {
        showWarn();
      }
    }, 10_000);

    return () => {
      EVENTS.forEach(e => window.removeEventListener(e, activity));
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(check);
      clearWarn();
    };
  }, [email]);

  return null;
}
