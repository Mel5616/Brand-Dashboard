import { createClient } from "@supabase/supabase-js";

// Expo booth funnel lives in a SEPARATE Supabase project (UPPAbaby expo events),
// read server-side with its service-role key. Distinct env vars so this never
// clobbers the main dashboard's Supabase connection.

// Flip to true to drop the sample "Demo Expo" rows once real expos are flowing.
const HIDE_DEMO = false;

export type BoothShowRow = {
  show_name: string;
  scans: number;
  checkouts: number;
  orders: number;
  revenue: number;
  conversion: number; // orders / scans %
  start: string;      // first event date (YYYY-MM-DD) — used to scope POS to this show
  end: string;        // last event date
};

export type BoothDaily = { date: string; revenue: number; orders: number; scans: number };

export type BoothFunnel = {
  totals: { scans: number; checkouts: number; orders: number; revenue: number; conversion: number };
  shows: BoothShowRow[];
  daily: BoothDaily[];
  hasRows: boolean;
};

const EMPTY: BoothFunnel = {
  totals: { scans: 0, checkouts: 0, orders: 0, revenue: 0, conversion: 0 },
  shows: [],
  daily: [],
  hasRows: false,
};

export async function getBoothFunnel(): Promise<BoothFunnel> {
  const url = process.env.BOOTH_SUPABASE_URL;
  const key = process.env.BOOTH_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return EMPTY;

  const db = createClient(url, key);
  const { data, error } = await db
    .from("booth_events")
    .select("show_handle,show_name,event_type,value,created_at");
  if (error || !data) return EMPTY;

  const rows = HIDE_DEMO ? data.filter(r => r.show_handle !== "demo-expo") : data;
  if (rows.length === 0) return EMPTY;

  // ── Per show ────────────────────────────────────────────────────────────
  // Group by the stable show_handle, not show_name — a show renamed in the expo app
  // (e.g. "PBC Melbourne" → "PBC - Melbourne") keeps one handle but two names, and we
  // don't want it splitting into two rows. Display name = the most recent one seen.
  const byShow = new Map<string, BoothShowRow & { _ts: string }>();
  for (const r of rows) {
    const key = r.show_handle || r.show_name;
    const s = byShow.get(key) ?? { show_name: r.show_name, scans: 0, checkouts: 0, orders: 0, revenue: 0, conversion: 0, start: "", end: "", _ts: "" };
    if (r.event_type === "scan") s.scans++;
    else if (r.event_type === "checkout_started") s.checkouts++;
    else if (r.event_type === "order") { s.orders++; s.revenue += Number(r.value) || 0; }
    const ts = String(r.created_at);
    const d = ts.slice(0, 10);
    if (!s.start || d < s.start) s.start = d;
    if (!s.end || d > s.end) s.end = d;
    if (ts >= s._ts) { s._ts = ts; s.show_name = r.show_name; }   // display name = latest
    byShow.set(key, s);
  }
  const shows = [...byShow.values()]
    .map(({ _ts, ...s }) => ({ ...s, conversion: s.scans > 0 ? Math.round((s.orders / s.scans) * 100) : 0 }))
    .sort((a, b) => b.revenue - a.revenue);

  // ── Totals ──────────────────────────────────────────────────────────────
  const totals = rows.reduce(
    (acc, r) => {
      if (r.event_type === "scan") acc.scans++;
      else if (r.event_type === "checkout_started") acc.checkouts++;
      else if (r.event_type === "order") { acc.orders++; acc.revenue += Number(r.value) || 0; }
      return acc;
    },
    { scans: 0, checkouts: 0, orders: 0, revenue: 0, conversion: 0 },
  );
  totals.conversion = totals.scans > 0 ? Math.round((totals.orders / totals.scans) * 100) : 0;

  // ── Daily series (scans + orders, grouped by UTC date) ────────────────────
  const byDay = new Map<string, BoothDaily>();
  for (const r of rows) {
    if (r.event_type === "checkout_started") continue;
    const date = String(r.created_at).slice(0, 10);
    const d = byDay.get(date) ?? { date, revenue: 0, orders: 0, scans: 0 };
    if (r.event_type === "scan") d.scans++;
    else if (r.event_type === "order") { d.orders++; d.revenue += Number(r.value) || 0; }
    byDay.set(date, d);
  }
  const daily = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));

  return { totals, shows, daily, hasRows: true };
}
