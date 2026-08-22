import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { FY_LIST, fyMonthKeys } from "@/lib/fy";

// The Activations "spine" — phases, pillar allocation model, trade-date
// markers, decisions, asks, and a LIVE budget burn (real marketing_budgets +
// budget_topups + marketing_actuals, not a manually-typed total). GET is any
// signed-in user; writes are admin-only. Financial figures (budget) are
// admin-only — non-admins get every other section but budget: null.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hdr = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const missing = (status: number, body: string) => status === 404 || /PGRST205|does not exist|schema cache/i.test(body);

const TABLES: Record<string, string> = {
  trade_date: "activation_trade_dates", phase: "activation_phases", pillar: "activation_pillars",
  decision: "activation_decisions", ask: "activation_asks",
};

function monthKeysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(from + "T00:00:00"); d.setDate(1);
  const end = new Date(to + "T00:00:00");
  while (d <= end) { out.push(d.toISOString().slice(0, 7)); d.setMonth(d.getMonth() + 1); }
  return out.slice(0, 24); // hard cap — this is a quarter/half-year view, never a runaway range
}
function fyForMonth(mk: string): string | null {
  for (const fy of FY_LIST) if (fyMonthKeys(fy).includes(mk)) return fy;
  return null;
}

async function fetchLiveBudget(brandId: number, from: string, to: string) {
  const months = monthKeysBetween(from, to);
  const fys = [...new Set(months.map(fyForMonth).filter(Boolean))] as string[];
  if (!months.length || !fys.length) return { months: [], total: 0 };

  const [mbRes, tuRes, actRes] = await Promise.all([
    fetch(`${sbUrl}/rest/v1/marketing_budgets?brand_id=eq.${brandId}&fy=in.(${fys.map(f => `"${f}"`).join(",")})&select=channel,annual_budget,fy`, { headers: hdr(), cache: "no-store" }),
    fetch(`${sbUrl}/rest/v1/budget_topups?brand_id=eq.${brandId}&select=channel,month_key,amount`, { headers: hdr(), cache: "no-store" }),
    fetch(`${sbUrl}/rest/v1/marketing_actuals?brand_id=eq.${brandId}&select=channel,month_key,spend`, { headers: hdr(), cache: "no-store" }),
  ]);
  const budgets = mbRes.ok ? await mbRes.json() : [];
  const topups = tuRes.ok ? await tuRes.json() : [];
  const actuals = actRes.ok ? await actRes.json() : [];

  const monthly = months.map(mk => {
    const fy = fyForMonth(mk);
    const channels = new Set(budgets.filter((b: any) => b.fy === fy).map((b: any) => b.channel));
    let planned = 0;
    for (const ch of channels) {
      const annual = budgets.find((b: any) => b.fy === fy && b.channel === ch)?.annual_budget ?? 0;
      const topup = topups.find((t: any) => t.channel === ch && t.month_key === mk);
      planned += topup ? Number(topup.amount) || 0 : Number(annual) / 12;
    }
    const actual = actuals.filter((a: any) => a.month_key === mk).reduce((s: number, a: any) => s + (Number(a.spend) || 0), 0);
    return { month_key: mk, planned: Math.round(planned), actual: Math.round(actual) };
  });
  return { months: monthly, total: Math.round(monthly.reduce((s, m) => s + m.planned, 0)) };
}

export async function GET(req: Request) {
  const acc = await getAccess();
  if (!acc.role) return NextResponse.json({ ok: false, error: "auth" }, { status: 401 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  const url = new URL(req.url);
  const brandId = url.searchParams.get("brand_id");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!brandId || !/^\d+$/.test(brandId)) return NextResponse.json({ ok: false }, { status: 400 });

  const [tdRes, phRes, plRes, dcRes, akRes] = await Promise.all([
    fetch(`${sbUrl}/rest/v1/activation_trade_dates?brand_id=eq.${brandId}&select=*&order=date.asc`, { headers: hdr(), cache: "no-store" }),
    fetch(`${sbUrl}/rest/v1/activation_phases?brand_id=eq.${brandId}&select=*&order=sort_order.asc`, { headers: hdr(), cache: "no-store" }),
    fetch(`${sbUrl}/rest/v1/activation_pillars?brand_id=eq.${brandId}&select=*&order=sort_order.asc`, { headers: hdr(), cache: "no-store" }),
    fetch(`${sbUrl}/rest/v1/activation_decisions?brand_id=eq.${brandId}&select=*&order=sort_order.asc`, { headers: hdr(), cache: "no-store" }),
    fetch(`${sbUrl}/rest/v1/activation_asks?brand_id=eq.${brandId}&select=*&order=sort_order.asc`, { headers: hdr(), cache: "no-store" }),
  ]);
  const tdText = await tdRes.text();
  if (!tdRes.ok && missing(tdRes.status, tdText)) return NextResponse.json({ ok: false, needsSetup: true });

  const budget = (acc.role === "admin" && from && to) ? await fetchLiveBudget(Number(brandId), from, to).catch(() => null) : null;

  return NextResponse.json({
    ok: true,
    tradeDates: JSON.parse(tdText || "[]"),
    phases: phRes.ok ? JSON.parse(await phRes.text() || "[]") : [],
    pillars: plRes.ok ? JSON.parse(await plRes.text() || "[]") : [],
    decisions: dcRes.ok ? JSON.parse(await dcRes.text() || "[]") : [],
    asks: akRes.ok ? JSON.parse(await akRes.text() || "[]") : [],
    budget,
  });
}

export async function POST(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const table = TABLES[b.kind];
  if (!table || !b.brand_id) return NextResponse.json({ ok: false, error: "bad kind/brand_id" }, { status: 400 });
  const { kind, ...row } = b;
  const res = await fetch(`${sbUrl}/rest/v1/${table}`, { method: "POST", headers: hdr({ Prefer: "return=representation" }), body: JSON.stringify(row) });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: false, needsSetup: missing(res.status, text), error: text.slice(0, 200) }, { status: 500 });
  return NextResponse.json({ ok: true, item: JSON.parse(text)[0] });
}

export async function PATCH(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const table = TABLES[b.kind];
  if (!table || !b.id) return NextResponse.json({ ok: false, error: "bad kind/id" }, { status: 400 });
  const { kind, id, ...fields } = b;
  const res = await fetch(`${sbUrl}/rest/v1/${table}?id=eq.${encodeURIComponent(String(id))}`, { method: "PATCH", headers: hdr({ Prefer: "return=minimal" }), body: JSON.stringify(fields) });
  return NextResponse.json({ ok: res.ok }, { status: res.ok ? 200 : 500 });
}

export async function DELETE(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") || "";
  const id = url.searchParams.get("id");
  const table = TABLES[kind];
  if (!table || !id) return NextResponse.json({ ok: false, error: "bad kind/id" }, { status: 400 });
  const res = await fetch(`${sbUrl}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: hdr({ Prefer: "return=minimal" }) });
  return NextResponse.json({ ok: res.ok }, { status: res.ok ? 200 : 500 });
}
