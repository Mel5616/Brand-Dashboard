"use client";

import { useEffect, useRef, useState } from "react";

// Guardian completion form: relationship, phone, opt-in, agreement, typed name
// + drawn signature (plain canvas, pointer events, exported as PNG data URL).
const inp = "w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400";

export function SignForm({ token, childName, guardianName, preview = false }: { token: string; childName: string; guardianName: string; preview?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);
  const [f, setF] = useState({ relationship: "", phone: "", retail_partner_optin: false, agreed: false, signed_name: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const scale = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * scale; c.height = 160 * scale;
    const ctx = c.getContext("2d")!;
    ctx.scale(scale, scale);
    ctx.strokeStyle = "#1e293b"; ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.lineJoin = "round";
  }, []);

  const pos = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const down = (e: React.PointerEvent) => {
    e.preventDefault();
    canvasRef.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke();
    setHasInk(true);
  };
  const up = () => { drawing.current = false; };
  const clear = () => {
    const c = canvasRef.current!; const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height); setHasInk(false);
  };

  async function submit() {
    setErr("");
    if (!f.relationship.trim()) return setErr("Please enter your relationship to " + childName + ".");
    if (!f.agreed) return setErr("Please tick the agreement box.");
    if (!f.signed_name.trim()) return setErr("Please type your full name.");
    if (!hasInk) return setErr("Please draw your signature in the box.");
    setBusy(true);
    const d = await fetch("/api/releases/sign", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, ...f, signature: canvasRef.current!.toDataURL("image/png") }),
    }).then(r => r.json()).catch(() => null);
    setBusy(false);
    if (d?.ok) setDone(true);
    else setErr(d?.error || "Something went wrong — please try again.");
  }

  if (done) {
    return (
      <div className="mt-6 rounded-xl bg-emerald-50 border border-emerald-200 p-6 text-center">
        <p className="text-3xl mb-1">✅</p>
        <p className="text-[15px] font-bold text-emerald-800">All signed — thank you!</p>
        <p className="text-[13px] text-emerald-700 mt-1.5 leading-relaxed">A copy of the signed release is on its way to your inbox. You can withdraw permission at any time by emailing marketing@coolkidz.com.au.</p>
      </div>
    );
  }

  return (
    <div className="mt-6 border-t border-gray-100 pt-5 space-y-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Complete &amp; sign</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="text-[12px] font-semibold text-slate-600 block mb-1">Your relationship to {childName} *</label>
          <input value={f.relationship} onChange={e => setF(p => ({ ...p, relationship: e.target.value }))} placeholder="e.g. Mother, Father, Legal guardian" className={inp} />
        </div>
        <div>
          <label className="text-[12px] font-semibold text-slate-600 block mb-1">Phone</label>
          <input value={f.phone} onChange={e => setF(p => ({ ...p, phone: e.target.value }))} placeholder="04xx xxx xxx" className={inp} />
        </div>
      </div>
      <label className="flex items-start gap-2.5 text-[13px] text-slate-600 cursor-pointer">
        <input type="checkbox" checked={f.retail_partner_optin} onChange={e => setF(p => ({ ...p, retail_partner_optin: e.target.checked }))} className="mt-0.5 accent-emerald-500" />
        <span>I&apos;m also happy for Coolkidz&apos;s authorised retail partners to use the content when promoting the featured products <span className="text-gray-400">(optional)</span></span>
      </label>
      <label className="flex items-start gap-2.5 text-[13px] text-slate-700 font-medium cursor-pointer">
        <input type="checkbox" checked={f.agreed} onChange={e => setF(p => ({ ...p, agreed: e.target.checked }))} className="mt-0.5 accent-emerald-500" />
        <span>I am the parent or legal guardian of {childName} and I agree to these terms *</span>
      </label>
      <div>
        <label className="text-[12px] font-semibold text-slate-600 block mb-1">Type your full name *</label>
        <input value={f.signed_name} onChange={e => setF(p => ({ ...p, signed_name: e.target.value }))} placeholder={guardianName} className={inp} />
      </div>
      <div>
        <div className="flex items-baseline justify-between mb-1">
          <label className="text-[12px] font-semibold text-slate-600">Draw your signature *</label>
          <button type="button" onClick={clear} className="text-[12px] text-gray-400 hover:text-gray-600">Clear</button>
        </div>
        <canvas ref={canvasRef} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
          className="w-full h-[160px] rounded-xl border-2 border-dashed border-gray-200 bg-slate-50/50 touch-none cursor-crosshair" />
      </div>
      {err && <p className="text-sm text-rose-500">{err}</p>}
      <button onClick={preview ? undefined : submit} disabled={busy || preview}
        className="w-full text-[15px] font-bold text-white bg-emerald-500 hover:bg-emerald-600 rounded-xl py-3.5 disabled:opacity-60">
        {preview ? "Preview only — sending disabled" : busy ? "Saving…" : "Sign the release"}
      </button>
    </div>
  );
}
