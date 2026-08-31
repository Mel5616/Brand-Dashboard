"use client";

import { useEffect, useState } from "react";

type Day = { id: string; state: string; location: string | null; event_date: string; capacity: number | null; booking_fee: number; status: string };
type Booking = { id: string; name: string; email: string; status: string };

const STATES = ["New South Wales", "Victoria", "Queensland", "South Australia", "Western Australia", "Tasmania", "Australian Capital Territory", "Northern Territory"];

// Bookings + check-in + bulk refund for UPPAbaby Tune-Up Days — replaces
// Eventbrite for this specific event type (the read-only Eventbrite panel
// above stays as-is for everything else). New days created here get two
// shareable links: the public booking page (embedded on the UPPAbaby
// website) and a per-day check-in link for sales teams on the ground.
export function TuneUpDaysPanel() {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<Day[] | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<{ state: string; event_date: string; location: string; capacity: string }>({ state: STATES[1], event_date: "", location: "", capacity: "" });
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [refunding, setRefunding] = useState(false);

  const load = () => {
    fetch("/api/tuneup/days?all=1").then(r => r.json()).then(d => { if (d.ok) { setDays(d.days ?? []); setNeedsSetup(!!d.needsSetup); } });
  };
  useEffect(() => { if (open && !days) load(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function createDay() {
    if (!form.event_date) { setErr("Pick a date."); return; }
    setCreating(true); setErr("");
    const res = await fetch("/api/tuneup/days", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: form.state, event_date: form.event_date, location: form.location || undefined, capacity: form.capacity ? Number(form.capacity) : undefined }),
    }).then(r => r.json()).catch(() => null);
    setCreating(false);
    if (res?.ok) { setShowForm(false); setForm({ state: STATES[1], event_date: "", location: "", capacity: "" }); load(); }
    else setErr(res?.error || "Couldn't create that day.");
  }

  async function refreshBookings(dayId: string) {
    const d = await fetch(`/api/tuneup/checkin?day_id=${dayId}`).then(r => r.json()).catch(() => null);
    if (d?.ok) setBookings(d.bookings);
  }

  async function expand(day: Day) {
    if (expanded === day.id) { setExpanded(null); return; }
    setExpanded(day.id); setBookings(null);
    refreshBookings(day.id);
  }

  async function sync(day: Day) {
    setSyncing(true); setErr("");
    const res = await fetch("/api/tuneup/sync", { method: "POST" }).then(r => r.json()).catch(() => null);
    setSyncing(false);
    if (res?.ok) refreshBookings(day.id);
    else setErr(res?.error || "Sync failed.");
  }

  async function bulkRefund(day: Day, checkedInCount: number) {
    if (!confirm(`Refund all ${checkedInCount} checked-in bookings for ${day.state} — ${day.event_date}? This can't be undone.`)) return;
    setRefunding(true); setErr("");
    const res = await fetch("/api/tuneup/refund", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tuneup_day_id: day.id }) }).then(r => r.json()).catch(() => null);
    setRefunding(false);
    if (res?.ok) { if (res.failed > 0) setErr(`Refunded ${res.refunded}, ${res.failed} failed — check Shopify.`); refreshBookings(day.id); }
    else setErr(res?.error || "Refund failed.");
  }

  if (needsSetup) return null;

  const input = "text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-300";

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-4">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between text-left">
        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">Tune-Up Day bookings</h2>
          <p className="text-xs text-gray-400 mt-0.5">Bookings, check-in &amp; bulk refunds via Shopify — replaces Eventbrite for Tune-Up Days</p>
        </div>
        <span className="text-gray-300 text-xs">{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          {err && <p className="text-sm text-rose-500">{err}</p>}

          <button onClick={() => setShowForm(s => !s)} className="text-sm font-semibold text-emerald-600 hover:text-emerald-800">
            {showForm ? "Cancel" : "+ New Tune-Up Day"}
          </button>

          {showForm && (
            <div className="border border-gray-100 rounded-xl p-4 grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-gray-400">State</label>
                <select value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} className={`${input} w-full mt-1`}>
                  {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-gray-400">Date</label>
                <input type="date" value={form.event_date} onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))} className={`${input} w-full mt-1`} />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-gray-400">Location <span className="text-gray-300 font-normal">(optional)</span></label>
                <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="e.g. Chadstone store" className={`${input} w-full mt-1`} />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-gray-400">Capacity <span className="text-gray-300 font-normal">(optional)</span></label>
                <input type="number" value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))} placeholder="e.g. 15" className={`${input} w-full mt-1`} />
              </div>
              <button onClick={createDay} disabled={creating} className="col-span-2 text-sm font-semibold text-white bg-slate-800 hover:bg-slate-900 rounded-lg py-2.5 disabled:opacity-40">
                {creating ? "Creating…" : "Create Tune-Up Day"}
              </button>
            </div>
          )}

          {days === null && <p className="text-sm text-gray-400">Loading…</p>}
          {days && days.length === 0 && <p className="text-sm text-gray-400">No Tune-Up Days yet.</p>}

          {days && days.map(day => {
            const checkedIn = (bookings ?? []).filter(b => b.status === "checked_in").length;
            const isExpanded = expanded === day.id;
            return (
              <div key={day.id} className="border border-gray-100 rounded-xl p-4">
                <button onClick={() => expand(day)} className="w-full flex items-center justify-between text-left">
                  <div>
                    <p className="text-sm font-semibold text-slate-700">{day.state}</p>
                    <p className="text-[12px] text-gray-400">{new Date(day.event_date).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}{day.location ? ` · ${day.location}` : ""}</p>
                  </div>
                  <span className="text-gray-300 text-xs">{isExpanded ? "▴" : "▾"}</span>
                </button>

                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-gray-50 space-y-3">
                    <div className="flex items-center gap-3 text-[11px] text-gray-400">
                      <span>Check-in link: <code className="bg-gray-50 px-1.5 py-0.5 rounded">/tuneup-checkin/{day.id}</code></span>
                      <button onClick={() => sync(day)} disabled={syncing} className="text-emerald-600 font-semibold hover:text-emerald-800 disabled:opacity-40">{syncing ? "Syncing…" : "Sync Shopify orders"}</button>
                    </div>

                    {bookings === null && <p className="text-sm text-gray-400">Loading bookings…</p>}
                    {bookings && bookings.length === 0 && <p className="text-sm text-gray-400">No paid bookings yet.</p>}
                    {bookings && bookings.length > 0 && (
                      <>
                        <p className="text-xs text-gray-500"><strong className="text-slate-600">{checkedIn}</strong> of <strong className="text-slate-600">{bookings.length}</strong> checked in · ${(bookings.length * day.booking_fee).toLocaleString()} collected</p>
                        <ul className="max-h-48 overflow-y-auto space-y-1">
                          {bookings.map(b => (
                            <li key={b.id} className="text-[12px] flex items-center justify-between border-b border-gray-50 py-1">
                              <span className="text-slate-600">{b.name}</span>
                              <span className={`font-bold ${b.status === "checked_in" ? "text-emerald-600" : "text-gray-300"}`}>{b.status === "checked_in" ? "✓ checked in" : "booked"}</span>
                            </li>
                          ))}
                        </ul>
                        {checkedIn > 0 && (
                          <button onClick={() => bulkRefund(day, checkedIn)} disabled={refunding} className="text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg px-4 py-2 disabled:opacity-40">
                            {refunding ? "Refunding…" : `Refund all ${checkedIn} checked-in ($${(checkedIn * day.booking_fee).toLocaleString()})`}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
