"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

// Sales-team check-in page for one Tune-Up Day — no dashboard login needed,
// shared-key gated (tuneupKey.ts), same pattern as /log-gift and
// /catalogue-check. Mel shares this link (with the key baked in) per event.
type Day = { id: string; state: string; location: string | null; event_date: string; booking_fee: number };
type Booking = { id: string; name: string; email: string; phone: string | null; status: string };

function tuneupKey(): string {
  if (typeof window === "undefined") return "";
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("k");
    if (fromUrl) { localStorage.setItem("tuneupKey", fromUrl); return fromUrl; }
    return localStorage.getItem("tuneupKey") || "";
  } catch { return ""; }
}
const tfetch = (url: string, opts: RequestInit = {}) =>
  fetch(url, { ...opts, headers: { ...(opts.headers || {}), "x-tuneup-key": tuneupKey() } });

export default function TuneupCheckin() {
  const params = useParams();
  const dayId = String(params.id);
  const [day, setDay] = useState<Day | null>(null);
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [noAccess, setNoAccess] = useState(false);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = () => {
    tfetch(`/api/tuneup/checkin?day_id=${dayId}`).then(r => {
      if (r.status === 403) { setNoAccess(true); return null; }
      return r.json();
    }).then(d => {
      if (!d) return;
      if (d.ok) { setDay(d.day); setBookings(d.bookings); } else setErr(d.error || "Couldn't load this day.");
    }).catch(() => setErr("Couldn't load this day."));
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function toggle(b: Booking) {
    setBusyId(b.id);
    await tfetch("/api/tuneup/checkin", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ booking_id: b.id, checked_in: b.status !== "checked_in" }) });
    setBusyId(null); load();
  }

  if (noAccess) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-md text-center">
        <div className="text-3xl mb-2">🔑</div>
        <p className="text-lg font-semibold text-gray-800">This link needs its access key</p>
        <p className="text-sm text-gray-400 mt-1">Ask Mel for the current check-in link for this Tune-Up Day.</p>
      </div>
    </div>
  );

  const filtered = (bookings ?? []).filter(b => !search.trim() || b.name.toLowerCase().includes(search.toLowerCase()) || b.email.toLowerCase().includes(search.toLowerCase()));
  const checkedIn = (bookings ?? []).filter(b => b.status === "checked_in").length;

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-lg mx-auto">
        {day && (
          <>
            <h1 className="text-xl font-bold text-gray-800">{day.state} Tune-Up Day</h1>
            <p className="text-sm text-gray-400 mt-0.5 mb-5">{new Date(day.event_date).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}{day.location ? ` · ${day.location}` : ""}</p>
          </>
        )}

        {err && <p className="text-sm text-rose-500 mb-3">{err}</p>}
        {bookings === null && !err && <p className="text-sm text-gray-400">Loading…</p>}

        {bookings !== null && (
          <>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-4 flex items-center justify-between">
              <p className="text-sm text-slate-600"><strong>{checkedIn}</strong> of <strong>{bookings.length}</strong> checked in</p>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name/email…" className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 w-44 focus:outline-none focus:ring-2 focus:ring-emerald-300" />
            </div>

            <div className="space-y-2">
              {filtered.length === 0 && <p className="text-sm text-gray-400 text-center py-6">No bookings match.</p>}
              {filtered.map(b => (
                <button key={b.id} onClick={() => toggle(b)} disabled={busyId === b.id}
                  className={`w-full text-left bg-white rounded-xl border p-3.5 flex items-center justify-between transition-colors ${b.status === "checked_in" ? "border-emerald-200 bg-emerald-50/50" : "border-gray-100 hover:bg-gray-50"}`}>
                  <div>
                    <p className="text-sm font-semibold text-slate-700">{b.name}</p>
                    <p className="text-[12px] text-gray-400">{b.email}{b.phone ? ` · ${b.phone}` : ""}</p>
                  </div>
                  <span className={`text-[11px] font-bold rounded-full px-3 py-1 whitespace-nowrap ${b.status === "checked_in" ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-400"}`}>
                    {busyId === b.id ? "…" : b.status === "checked_in" ? "✓ Checked in" : "Check in"}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
