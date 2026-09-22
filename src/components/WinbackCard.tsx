"use client";
import React from "react";

// Abandoned checkout win-back (UPPAbaby): who left a Vista or Cruz in the
// bag, send them the free-accessory offer, and see who came back.

type Cand = { id: string; createdAt: string; email: string; firstName: string; name: string | null; value: number; summary: string; sent: { code: string; sent_at: string; status: string } | null };
type Send = { id: string; checkout_id: string; customer_email: string; customer_name: string | null; cart_value: number | null; cart_summary: string | null; campaign: string; code: string; expires_at: string | null; status: string; error: string | null; recovered_at: string | null; recovered_order: string | null; recovered_value: number | null; sent_at: string };
type Gift = { key: string; name: string; price: string };

const money = (n: number) => "$" + Math.round(n).toLocaleString("en-AU");
const day = (iso: string) => new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Melbourne" });
const firstOfMonth = () => new Date().toISOString().slice(0, 8) + "01";
const today = () => new Date().toISOString().slice(0, 10);

export function WinbackCard({ admin }: { admin: boolean }) {
  const [from, setFrom] = React.useState(firstOfMonth());
  const [to, setTo] = React.useState(today());
  const [data, setData] = React.useState<{ candidates: Cand[]; sends: Send[]; gifts: Gift[]; needsSetup: boolean; live: boolean; config: { days: number } } | null>(null);
  const [sel, setSel] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState(false);
  const [testTo, setTestTo] = React.useState("");
  const [result, setResult] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(() => {
    fetch(`/api/winback-offer?from=${from}&to=${to}`).then(r => r.json()).then(d => {
      if (!d.ok) return;
      setData(d); setSel(new Set((d.candidates as Cand[]).filter(c => !c.sent).map(c => c.id)));
    }).catch(() => {}).finally(() => setLoading(false));
  }, [from, to]);
  React.useEffect(() => { const t = setTimeout(() => { setLoading(true); load(); }, 0); return () => clearTimeout(t); }, [load]);

  async function send(test: boolean) {
    if (!data) return;
    const n = test ? 1 : sel.size;
    if (!n) return;
    if (!test && !confirm(`Send the free-accessory offer to ${n} ${n === 1 ? "person" : "people"}? Each gets a one-use code created on the store and one email.`)) return;
    setBusy(true); setResult(null);
    const body = test ? { from, to, test_to: testTo, ids: [...sel].slice(0, 1) } : { from, to, ids: [...sel] };
    const d = await fetch("/api/winback-offer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json()).catch(() => null);
    setBusy(false);
    if (!d?.ok) { setResult(d?.error || "Failed"); return; }
    const ok = d.results.filter((r: { ok: boolean }) => r.ok).length, bad = d.results.filter((r: { ok: boolean }) => !r.ok);
    setResult(test ? `Test sent to ${testTo}${bad.length ? ` (failed: ${bad[0].error})` : ""}` : `Sent ${ok} of ${d.results.length}${bad.length ? `. Failed: ${bad.map((b: { email: string; error?: string }) => `${b.email} (${b.error})`).join(", ")}` : ""}`);
    if (!test) load();
  }

  const c = data?.candidates ?? [];
  const sends = data?.sends ?? [];
  const recovered = sends.filter(s => s.status === "recovered");
  const recoveredValue = recovered.reduce((s, r) => s + (r.recovered_value || 0), 0);
  const openValue = c.filter(x => !x.sent).reduce((s, x) => s + x.value, 0);
  const pill = (s: string) => ({ sent: "bg-sky-50 text-sky-700 border-sky-200", recovered: "bg-emerald-50 text-emerald-700 border-emerald-200", expired: "bg-gray-50 text-gray-500 border-gray-200", failed: "bg-rose-50 text-rose-700 border-rose-200" }[s] || "bg-gray-50 text-gray-500 border-gray-200");
  const inp = "text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-300";

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Win-back: four free accessories (UPPAbaby)</h2>
          <p className="text-xs text-gray-400 mt-0.5">People who left a full-price Vista V3 or Cruz V3 at checkout (damaged box and clearance excluded) and have not ordered since. Each send creates a one-use code (Parent Organiser, Cup Holder, Reed liner and Snack Tray all free with the pram, {data?.config.days ?? 14} days) and emails a one-click link that rebuilds the bag with the four gifts.</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inp} />
          <span className="text-gray-300">to</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className={inp} />
        </div>
      </div>

      {data?.needsSetup && <p className="mt-3 text-[12.5px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Run <code className="font-mono">supabase/add_winback_offers.sql</code> in Supabase before sending, so every send and recovery is recorded.</p>}
      {data && !data.live && <p className="mt-3 text-[12.5px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">Could not read abandoned checkouts from Shopify.</p>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
        {[
          { l: "Open carts", v: c.filter(x => !x.sent).length, s: `${money(openValue)} in the window` },
          { l: "Sent", v: sends.length, s: `${sends.filter(s => s.status === "sent").length} still open` },
          { l: "Recovered", v: recovered.length, s: sends.length ? `${Math.round((recovered.length / sends.length) * 100)}% of sent` : "no sends yet" },
          { l: "Recovered revenue", v: money(recoveredValue), s: "orders after the email, by code or same email" },
        ].map(k => (
          <div key={k.l} className="rounded-lg border border-gray-100 bg-gray-50/60 px-3.5 py-3">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-gray-400">{k.l}</div>
            <div className="text-xl font-semibold text-slate-800 mt-0.5 tabular-nums">{k.v}</div>
            <div className="text-[11.5px] text-gray-400">{k.s}</div>
          </div>
        ))}
      </div>

      <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-gray-400 mt-5 mb-2">Candidates {loading && <span className="normal-case tracking-normal text-gray-300">loading…</span>}</h3>
      {c.length === 0 ? <p className="text-[12.5px] text-gray-400">No open Vista or Cruz checkouts in this window.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead><tr className="text-left text-[10.5px] uppercase tracking-[0.12em] text-gray-400 border-b border-gray-100">
              <th className="py-2 pr-2"><input type="checkbox" checked={sel.size > 0 && sel.size === c.filter(x => !x.sent).length} onChange={e => setSel(e.target.checked ? new Set(c.filter(x => !x.sent).map(x => x.id)) : new Set())} /></th>
              <th className="py-2 pr-3 font-semibold">Left</th><th className="py-2 pr-3 font-semibold">Customer</th><th className="py-2 pr-3 font-semibold">In the bag</th><th className="py-2 pr-3 font-semibold text-right">Value</th><th className="py-2 font-semibold">Status</th>
            </tr></thead>
            <tbody>
              {c.map(x => (
                <tr key={x.id} className="border-b border-gray-50 align-top">
                  <td className="py-2 pr-2">{!x.sent && <input type="checkbox" checked={sel.has(x.id)} onChange={e => setSel(p => { const n = new Set(p); if (e.target.checked) n.add(x.id); else n.delete(x.id); return n; })} />}</td>
                  <td className="py-2 pr-3 whitespace-nowrap text-gray-500">{day(x.createdAt)}</td>
                  <td className="py-2 pr-3"><div className="text-slate-700">{x.name || x.firstName}</div><div className="text-[11.5px] text-gray-400">{x.email}</div></td>
                  <td className="py-2 pr-3 text-gray-600">{x.summary}</td>
                  <td className="py-2 pr-3 text-right whitespace-nowrap tabular-nums">{money(x.value)}</td>
                  <td className="py-2 whitespace-nowrap">{x.sent ? <span className={`inline-block text-[11px] font-semibold rounded-full border px-2 py-0.5 capitalize ${pill(x.sent.status)}`}>{x.sent.status} · {x.sent.code}</span> : <span className="text-gray-300">not sent</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {admin && (
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <button onClick={() => send(false)} disabled={busy || sel.size === 0 || !!data?.needsSetup} className="text-[12.5px] font-semibold text-white bg-slate-800 hover:bg-slate-900 rounded-lg px-4 py-2 disabled:opacity-40">
            {busy ? "Sending…" : `Send offer to ${sel.size}`}
          </button>
          <input value={testTo} onChange={e => setTestTo(e.target.value)} placeholder="Test email address" className={`${inp} w-56`} />
          <button onClick={() => send(true)} disabled={busy || !testTo || sel.size === 0} className="text-[12.5px] font-semibold text-slate-700 border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50 disabled:opacity-40">Send a test</button>
          {result && <span className="text-[12.5px] text-gray-500">{result}</span>}
        </div>
      )}

      {sends.length > 0 && (
        <>
          <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-gray-400 mt-6 mb-2">Sent</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead><tr className="text-left text-[10.5px] uppercase tracking-[0.12em] text-gray-400 border-b border-gray-100">
                <th className="py-2 pr-3 font-semibold">Sent</th><th className="py-2 pr-3 font-semibold">Customer</th><th className="py-2 pr-3 font-semibold">Cart</th><th className="py-2 pr-3 font-semibold">Code</th><th className="py-2 pr-3 font-semibold">Expires</th><th className="py-2 font-semibold">Status</th>
              </tr></thead>
              <tbody>
                {sends.map(s => (
                  <tr key={s.id} className="border-b border-gray-50 align-top">
                    <td className="py-2 pr-3 whitespace-nowrap text-gray-500">{day(s.sent_at)}</td>
                    <td className="py-2 pr-3"><div className="text-slate-700">{s.customer_name || "—"}</div><div className="text-[11.5px] text-gray-400">{s.customer_email}</div></td>
                    <td className="py-2 pr-3 text-gray-600">{s.cart_summary}{s.cart_value ? <span className="text-gray-400"> · {money(s.cart_value)}</span> : null}</td>
                    <td className="py-2 pr-3 font-mono whitespace-nowrap">{s.code}</td>
                    <td className="py-2 pr-3 whitespace-nowrap text-gray-500">{s.expires_at ? day(s.expires_at) : "—"}</td>
                    <td className="py-2">
                      <span className={`inline-block text-[11px] font-semibold rounded-full border px-2 py-0.5 capitalize ${pill(s.status)}`}>{s.status}</span>
                      {s.status === "recovered" && <div className="text-[11.5px] text-gray-400 mt-0.5">{s.recovered_order} · {money(s.recovered_value || 0)} · {s.recovered_at ? day(s.recovered_at) : ""}</div>}
                      {s.error && <div className="text-[11.5px] text-rose-600 mt-0.5">{s.error}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
