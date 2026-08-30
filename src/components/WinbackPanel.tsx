"use client";

import { useState } from "react";
import { fmtFull } from "@/lib/format";
import { KlaviyoSendPanel } from "./KlaviyoSend";

type Candidate = { email: string; name: string; phone: string; value: number; items: number; created_at: string; checkout_url: string | null };
type Offer = { discountAmount: number; minSpend: number; expiryDays: number };
type CodeResult = Candidate & { ok: boolean; code?: string; error?: string; expiresAt?: string };

// Self-contained, table-based HTML email (inline styles only) so it survives
// Klaviyo's editor and renders identically everywhere. {{ person.winback_code }}
// / {{ person.winback_expires }} are real Klaviyo Liquid tags — each
// recipient's OWN profile properties (set per-customer in buildAdhocList)
// render there, so one campaign shows everyone their own code.
function buildWinbackHtml(offer: Offer) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f5;padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;border:1px solid #e5e9f0;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">

      <tr><td style="padding:32px 32px 0;text-align:center;">
        <img src="https://marketing.coolkidz.com.au/logos/UPPAbaby%20Logo.jpg" alt="UPPAbaby" width="120" style="display:inline-block;height:auto;max-width:120px;" />
      </td></tr>

      <tr><td style="padding:20px 0 0;">
        <img src="https://marketing.coolkidz.com.au/uppababy-winback-hero.jpg" alt="" width="600" style="display:block;width:100%;height:auto;" />
      </td></tr>

      <tr><td style="padding:28px 32px 0;text-align:center;">
        <p style="margin:0;font:bold 13px Arial,Helvetica,sans-serif;color:#0891b2;text-transform:uppercase;letter-spacing:0.2em;">Last call on your cart</p>
      </td></tr>

      <tr><td style="padding:8px 32px 0;text-align:center;">
        <p style="margin:0;font:bold 72px/1 Arial,Helvetica,sans-serif;color:#0f172a;letter-spacing:-0.02em;">${fmtFull(offer.discountAmount)}<span style="font-size:32px;color:#0891b2;"> OFF</span></p>
      </td></tr>

      <tr><td style="padding:14px 32px 8px;text-align:center;">
        <p style="margin:0 auto;max-width:420px;font:15px/1.6 Arial,Helvetica,sans-serif;color:#64748b;">To make this yours — on orders over ${fmtFull(offer.minSpend)}.</p>
      </td></tr>

      <tr><td style="padding:24px 32px;text-align:center;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;border:2px dashed #0891b2;border-radius:10px;">
          <tr><td style="padding:18px 28px;text-align:center;">
            <p style="margin:0 0 4px;font:11px Arial,Helvetica,sans-serif;color:#94a3b8;text-transform:uppercase;letter-spacing:0.1em;">Your code</p>
            <p style="margin:0;font:bold 24px 'Courier New',monospace;color:#0f172a;letter-spacing:0.04em;">{{ person.winback_code }}</p>
          </td></tr>
        </table>
        <p style="margin:14px 0 0;font:12.5px Arial,Helvetica,sans-serif;color:#94a3b8;">Expires {{ person.winback_expires }} · one-time use</p>
      </td></tr>

      <tr><td style="padding:8px 32px 40px;text-align:center;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
          <tr><td style="background:#0891b2;border-radius:8px;">
            <a href="https://uppababy.com.au/cart" style="display:inline-block;padding:14px 36px;font:bold 14px Arial,Helvetica,sans-serif;color:#ffffff;text-decoration:none;">Complete your order</a>
          </td></tr>
        </table>
      </td></tr>

      <tr><td style="padding:24px 32px 32px;border-top:1px solid #eef1f5;text-align:center;">
        <p style="margin:0 0 4px;font:bold 12.5px Arial,Helvetica,sans-serif;color:#475569;">UPPAbaby Australia</p>
        <p style="margin:0 0 2px;font:11.5px Arial,Helvetica,sans-serif;color:#94a3b8;">1 Beyer Road, Braeside VIC 3195, Australia</p>
        <p style="margin:0 0 14px;font:11.5px Arial,Helvetica,sans-serif;color:#94a3b8;"><a href="mailto:support@uppababy.com.au" style="color:#94a3b8;text-decoration:underline;">support@uppababy.com.au</a></p>
        <p style="margin:0;font:11px Arial,Helvetica,sans-serif;color:#c2c9d3;">You're receiving this because you have an item waiting in your UPPAbaby cart. <a href="{% unsubscribe_link %}" style="color:#c2c9d3;text-decoration:underline;">Unsubscribe</a></p>
      </td></tr>

    </table>
  </td></tr>
</table>`;
}

export function WinbackPanel({ brandId = 5 }: { brandId?: number }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [codeResults, setCodeResults] = useState<CodeResult[] | null>(null);
  const [listId, setListId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function find() {
    setLoading(true); setErr(""); setCandidates(null); setCodeResults(null); setListId(null);
    const d = await fetch(`/api/winback?brand_id=${brandId}`).then(r => r.json()).catch(() => null);
    setLoading(false);
    if (d?.ok) { setCandidates(d.candidates); setOffer(d.offer); setSelected(new Set(d.candidates.map((c: Candidate) => c.email))); }
    else setErr(d?.error || "Couldn't load abandoned checkouts.");
  }

  function toggle(email: string) {
    setSelected(s => { const n = new Set(s); if (n.has(email)) n.delete(email); else n.add(email); return n; });
  }

  async function generate() {
    if (!candidates) return;
    const chosen = candidates.filter(c => selected.has(c.email));
    if (!chosen.length) { setErr("Select at least one customer."); return; }
    setBusy(true); setErr("");
    const gen = await fetch("/api/winback", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "generate-codes", brand_id: brandId, customers: chosen.map(c => ({ email: c.email, name: c.name, value: c.value })) }),
    }).then(r => r.json()).catch(() => null);
    if (!gen?.ok) { setBusy(false); setErr(gen?.error || "Couldn't generate codes."); return; }
    setCodeResults(gen.results);
    const ok = gen.results.filter((r: CodeResult) => r.ok && r.code);
    if (!ok.length) { setBusy(false); setErr("No codes were created successfully."); return; }
    const aud = await fetch("/api/winback", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "build-audience", brand_id: brandId, customers: ok.map((r: CodeResult) => ({ email: r.email, name: r.name, code: r.code })) }),
    }).then(r => r.json()).catch(() => null);
    setBusy(false);
    if (aud?.ok) setListId(aud.listId);
    else setErr(aud?.error || "Codes created, but couldn't build the Klaviyo audience.");
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-4">
      <button onClick={() => { setOpen(o => !o); if (!open && !candidates) find(); }} className="w-full flex items-center justify-between text-left">
        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Abandoned-cart win-back</h2>
          <p className="text-xs text-gray-400 mt-0.5">Find UPPAbaby&apos;s highest-value abandoned checkouts this month, generate each customer a personal code, and send it via Klaviyo</p>
        </div>
        <span className="text-gray-300 text-xs">{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          {err && <p className="text-sm text-rose-500">{err}</p>}
          {loading && <p className="text-sm text-gray-400">Pulling this month&apos;s abandoned checkouts from Shopify…</p>}

          {offer && (
            <p className="text-xs text-gray-400 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
              Offer: <strong className="text-slate-600">{fmtFull(offer.discountAmount)} off</strong>, orders over <strong className="text-slate-600">{fmtFull(offer.minSpend)}</strong>, expires <strong className="text-slate-600">{offer.expiryDays} days</strong> after generation, one-time use per customer.
            </p>
          )}

          {candidates && candidates.length === 0 && (
            <p className="text-sm text-gray-400">No abandoned checkouts over the minimum spend this month (or everyone&apos;s already been offered a code).</p>
          )}

          {candidates && candidates.length > 0 && !codeResults && (
            <>
              <div className="overflow-x-auto max-h-96 overflow-y-auto border border-gray-100 rounded-lg">
                <table className="w-full text-[13px]">
                  <thead className="sticky top-0 bg-white">
                    <tr className="text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                      <th className="text-left font-semibold py-2 pl-3 pr-2">
                        <input type="checkbox" checked={selected.size === candidates.length} onChange={e => setSelected(e.target.checked ? new Set(candidates.map(c => c.email)) : new Set())} />
                      </th>
                      <th className="text-left font-semibold py-2 pr-3">Name</th>
                      <th className="text-left font-semibold py-2 pr-3">Email</th>
                      <th className="text-right font-semibold py-2 pr-3">Cart value</th>
                      <th className="text-right font-semibold py-2 pr-3">Items</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {candidates.map(c => (
                      <tr key={c.email}>
                        <td className="py-2 pl-3 pr-2"><input type="checkbox" checked={selected.has(c.email)} onChange={() => toggle(c.email)} /></td>
                        <td className="py-2 pr-3 font-medium text-slate-700 whitespace-nowrap">{c.name}</td>
                        <td className="py-2 pr-3 text-slate-500 whitespace-nowrap">{c.email}</td>
                        <td className="py-2 pr-3 text-right font-semibold text-slate-700 tabular-nums">{fmtFull(c.value)}</td>
                        <td className="py-2 pr-3 text-right text-gray-400 tabular-nums">{c.items}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={generate} disabled={busy || selected.size === 0} className="text-sm font-semibold text-white bg-slate-800 hover:bg-slate-900 rounded-lg px-4 py-2 disabled:opacity-40">
                  {busy ? "Generating…" : `Generate codes for ${selected.size} customer${selected.size === 1 ? "" : "s"}`}
                </button>
                <button onClick={find} disabled={busy} className="text-sm font-medium text-gray-500 hover:text-slate-700">Refresh</button>
              </div>
            </>
          )}

          {codeResults && (
            <>
              <div className="overflow-x-auto max-h-72 overflow-y-auto border border-gray-100 rounded-lg">
                <table className="w-full text-[13px]">
                  <thead className="sticky top-0 bg-white">
                    <tr className="text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                      <th className="text-left font-semibold py-2 pl-3 pr-3">Name</th>
                      <th className="text-left font-semibold py-2 pr-3">Email</th>
                      <th className="text-left font-semibold py-2 pr-3">Code</th>
                      <th className="py-2 pr-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {codeResults.map(r => (
                      <tr key={r.email}>
                        <td className="py-2 pl-3 pr-3 font-medium text-slate-700 whitespace-nowrap">{r.name}</td>
                        <td className="py-2 pr-3 text-slate-500 whitespace-nowrap">{r.email}</td>
                        <td className="py-2 pr-3 font-mono text-[12px] text-slate-700">{r.code || "—"}</td>
                        <td className="py-2 pr-3">{r.ok ? <span className="text-[10.5px] font-bold text-emerald-600 bg-emerald-50 rounded-full px-2 py-0.5">✓ created</span> : <span className="text-[10.5px] font-bold text-rose-500 bg-rose-50 rounded-full px-2 py-0.5" title={r.error}>failed</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {listId && offer && (
                <KlaviyoSendPanel
                  getHtml={() => buildWinbackHtml(offer)}
                  defaultSubject="You left something in your cart 👀"
                  fixedAudience={{ name: "Win-back batch", included: [{ id: listId, name: `Win-back — ${new Date().toLocaleDateString("en-AU")}` }] }}
                  brandId={brandId}
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
