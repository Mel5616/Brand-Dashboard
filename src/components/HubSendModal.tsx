"use client";

// Shared "send & track" modal for the Retailer Hub. Pick a customer (or type an
// email), add a note, then either email the document(s) via Resend or copy a
// tracked link. Every send creates a /hub/<token> row whose opens are logged.
import { useEffect, useMemo, useState } from "react";

export type SendItem = { kind: "price_list" | "brand_overview" | "terms" | "fact_sheet" | "form"; id?: string; title: string; brand?: string | null };
type Customer = { id: string; store_name: string; contact_name: string | null; email: string | null };

export function HubSendModal({ items, onClose, onSent, presetCustomerId }: { items: SendItem[]; onClose: () => void; onSent?: () => void; presetCustomerId?: string }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState(presetCustomerId || "");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [links, setLinks] = useState<{ title: string; url: string }[] | null>(null);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    fetch("/api/customers").then(r => r.json()).then(d => { if (d.ok) setCustomers(d.customers || []); }).catch(() => {});
  }, []);

  useEffect(() => {
    const c = customers.find(x => x.id === customerId);
    if (c) { if (c.email) setEmail(c.email); if (c.contact_name) setName(c.contact_name); }
  }, [customerId, customers]);

  const defaultSubject = useMemo(() => `Coolkidz Australia — ${items.map(i => i.title).join(", ")}`, [items]);

  async function go(via: "email" | "link") {
    setErr(""); setBusy(true);
    const r = await fetch("/api/hub-send", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        via, customer_id: customerId || null, recipient_email: email.trim(), recipient_name: name.trim(),
        subject: subject.trim() || defaultSubject, message: message.trim(),
        items: items.map(i => ({ kind: i.kind, id: i.id, title: i.title, brand: i.brand })),
      }),
    }).then(x => x.json()).catch(() => ({ ok: false, error: "Send failed — try again." }));
    setBusy(false);
    if (!r.ok && !r.links) { setErr(r.error || "Send failed — try again."); return; }
    setLinks(r.links || []);
    if (!r.ok) setErr(r.error || "");
    onSent?.();
  }

  function copy(url: string) {
    navigator.clipboard?.writeText(url).then(() => { setCopied(url); setTimeout(() => setCopied(""), 1500); }).catch(() => {});
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-base font-extrabold text-slate-900">Send &amp; track</h3>
            <p className="text-[12.5px] text-slate-400 mt-0.5">{items.map(i => i.title).join(" · ")}</p>
          </div>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-500 text-xl leading-none">×</button>
        </div>

        {links ? (
          <div className="space-y-3">
            {!err && <p className="text-sm text-emerald-600 font-semibold">✓ {email ? `Sent to ${email}` : "Tracked links created"}</p>}
            {err && <p className="text-sm text-amber-600">{err}</p>}
            {links.map(l => (
              <div key={l.url} className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2">
                <span className="text-[13px] font-semibold text-slate-700 flex-1 truncate">{l.title}</span>
                <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-[12px] font-semibold text-sky-600 hover:underline">Open</a>
                <button onClick={() => copy(l.url)} className="text-[12px] font-semibold text-slate-500 hover:text-slate-700">{copied === l.url ? "Copied ✓" : "Copy link"}</button>
              </div>
            ))}
            <p className="text-[11.5px] text-slate-400">Opens are tracked — check the Sent &amp; tracked panel or the customer's record.</p>
            <button onClick={onClose} className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-semibold rounded-lg py-2.5">Done</button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-[10.5px] font-bold text-slate-400 uppercase tracking-wide mb-1">Customer (optional — links the send to their record)</label>
              <select value={customerId} onChange={e => setCustomerId(e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 bg-white">
                <option value="">— No customer record —</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.store_name}{c.contact_name ? ` · ${c.contact_name}` : ""}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10.5px] font-bold text-slate-400 uppercase tracking-wide mb-1">Recipient email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="buyer@store.com.au" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5" />
              </div>
              <div>
                <label className="block text-[10.5px] font-bold text-slate-400 uppercase tracking-wide mb-1">Recipient name</label>
                <input value={name} onChange={e => setName(e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5" />
              </div>
            </div>
            <div>
              <label className="block text-[10.5px] font-bold text-slate-400 uppercase tracking-wide mb-1">Subject</label>
              <input value={subject} onChange={e => setSubject(e.target.value)} placeholder={defaultSubject} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5" />
            </div>
            <div>
              <label className="block text-[10.5px] font-bold text-slate-400 uppercase tracking-wide mb-1">Message (optional)</label>
              <textarea rows={3} value={message} onChange={e => setMessage(e.target.value)} placeholder="Hi — as discussed, here's our latest price list…" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5" />
            </div>
            {err && <p className="text-sm text-rose-600">{err}</p>}
            <div className="flex gap-2 pt-1">
              <button onClick={() => go("email")} disabled={busy || !email.trim()} className="flex-1 bg-sky-500 hover:bg-sky-600 disabled:opacity-40 text-white text-sm font-bold rounded-lg py-2.5">{busy ? "Working…" : "Send email"}</button>
              <button onClick={() => go("link")} disabled={busy} className="flex-1 bg-white border border-slate-200 hover:border-sky-300 text-slate-600 text-sm font-semibold rounded-lg py-2.5">{busy ? "Working…" : "Create tracked link only"}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Compact open-tracking line used across the Retailer Hub panels.
export function SendRow({ s, admin, onRevoke }: { s: any; admin?: boolean; onRevoke?: (id: string) => void }) {
  const opened = (s.open_count || 0) > 0;
  const when = (d: string | null) => d ? new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) + " " + new Date(d).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }) : "";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] py-2 border-b border-slate-50 last:border-0">
      <span className={`inline-block w-2 h-2 rounded-full ${opened ? "bg-emerald-400" : "bg-slate-200"}`} />
      <span className="font-semibold text-slate-700">{s.doc_title}</span>
      <span className="text-slate-400">→ {s.recipient_email || "link only"}</span>
      <span className="text-slate-300">{when(s.created_at)}</span>
      {s.email_status === "failed" && <span className="text-rose-500 font-semibold">email failed</span>}
      <span className={`ml-auto font-semibold ${opened ? "text-emerald-600" : "text-slate-300"}`}>
        {opened ? `${s.open_count} open${s.open_count === 1 ? "" : "s"} · last ${when(s.last_opened_at)}` : "not opened yet"}
      </span>
      {admin && onRevoke && <button onClick={() => onRevoke(s.id)} className="text-rose-400 hover:underline">revoke</button>}
    </div>
  );
}
