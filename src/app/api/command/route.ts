import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Command Centre data — admin-only. Aggregates the header strip, the action
// queue (3 triggers: design requests, blog overdue, campaigns at risk), and
// the data freshness footer, per command-page-build-brief.md phases 1-2.
// Everything reads from tables that already exist; the only new state is
// command_thresholds (tunable numbers) and command_snoozes.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const missing = (status: number, body: string) => status === 404 || /PGRST205|does not exist|schema cache/i.test(body);

// "Today" in the business's own timezone, not the server's (Vercel runs UTC) —
// en-CA gives an ISO-shaped yyyy-mm-dd for free.
const todayIn = (tz: string) => new Date().toLocaleDateString("en-CA", { timeZone: tz });
const TZ = "Australia/Melbourne";

async function sbGet(path: string) {
  const res = await fetch(`${sbUrl}/rest/v1/${path}`, { headers: h(), cache: "no-store" });
  const text = await res.text();
  if (!res.ok) return { ok: false, status: res.status, text, rows: [] as any[] };
  return { ok: true, status: res.status, text, rows: JSON.parse(text || "[]") };
}

function daysLate(dueIso: string, today: string) {
  const due = new Date(dueIso + "T00:00:00");
  const now = new Date(today + "T00:00:00");
  return Math.round((now.getTime() - due.getTime()) / 86_400_000);
}

export async function GET() {
  const acc = await getAccess();
  if (acc.role !== "admin") return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false, error: "Not configured" }, { status: 500 });

  const today = todayIn(TZ);
  const monthKey = today.slice(0, 7);
  const monthStart = `${monthKey}-01`;
  const [y, m] = monthKey.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const dayOfMonth = Number(today.slice(8, 10));
  const monthElapsedPct = Math.round((dayOfMonth / daysInMonth) * 100);
  const daysRemaining = daysInMonth - dayOfMonth;

  const [
    thresholdsRes, revenueRes, salesBudgetRes, actualsRes, budgetsRes, topupsRes,
    requestsRes, campaignsRes, blogsRes, syncRes,
  ] = await Promise.all([
    sbGet("command_thresholds?select=*"),
    sbGet(`brand_daily?select=revenue&day=gte.${monthStart}&day=lte.${today}`),
    sbGet(`sales_budget?select=target&month_key=eq.${monthKey}`),
    sbGet(`marketing_actuals?select=spend&month_key=eq.${monthKey}`),
    sbGet("marketing_budgets?select=brand_id,channel,annual_budget"),
    sbGet(`budget_topups?select=brand_id,channel,amount&month_key=eq.${monthKey}`),
    sbGet(`marketing_requests?select=id,request_type,status,brand,title,assignee_email,needed_by,sla_due_at&status=not.in.(delivered,declined)`),
    // key_date is a free-text column (some rows hold placeholders like "Sep"
    // rather than a real date) — filter by status only here, then validate
    // and range-check in JS below rather than trusting a PostgREST date
    // comparison against a text column.
    sbGet(`campaigns?select=id,campaign,brand,owner,status,key_date&status=in.(Planned,Pipeline,Build)`),
    sbGet(`asana_tasks?select=gid,name,assignee,due_on,permalink_url,brand_id&project_label=eq.Blogs&completed=eq.false&due_on=lt.${today}`),
    sbGet("sync_status?select=*"),
  ]);

  const needsSetup = missing(thresholdsRes.status, thresholdsRes.text) || missing(requestsRes.status, requestsRes.text);
  const riskWindow = Number(thresholdsRes.rows.find((r: any) => r.key === "campaign_risk_window_days")?.value_numeric) || 14;
  const riskWindowFuture = new Date(Date.now() + riskWindow * 86_400_000).toISOString().slice(0, 10);

  // Header strip — revenue and spend are portfolio totals, not per-channel
  // pace (that mapping already lives on the Sales Budget tab; a single
  // top-line number doesn't need it).
  const revenueActual = revenueRes.rows.reduce((s: number, r: any) => s + (Number(r.revenue) || 0), 0);
  const revenueBudget = salesBudgetRes.rows.reduce((s: number, r: any) => s + (Number(r.target) || 0), 0);
  const revenueVariancePct = revenueBudget > 0 ? Math.round(((revenueActual - revenueBudget) / revenueBudget) * 1000) / 10 : null;

  const spendActual = actualsRes.rows.reduce((s: number, r: any) => s + (Number(r.spend) || 0), 0);
  const topupFor = (bid: number, ch: string) => topupsRes.rows.find((t: any) => t.brand_id === bid && t.channel === ch);
  const spendBudget = budgetsRes.rows.reduce((s: number, r: any) => {
    const t = topupFor(r.brand_id, r.channel);
    return s + (t ? Number(t.amount) || 0 : (Number(r.annual_budget) || 0) / 12);
  }, 0);
  const spendVariancePct = spendBudget > 0 ? Math.round(((spendActual - spendBudget) / spendBudget) * 1000) / 10 : null;

  // Action queue — three triggers, merged, sorted by days overdue.
  type QueueItem = { type: string; id: string; title: string; brand: string | null; owner: string | null; daysLate: number; href: string };
  const queue: QueueItem[] = [];

  for (const r of requestsRes.rows) {
    const due = r.sla_due_at ? String(r.sla_due_at).slice(0, 10) : r.needed_by;
    if (!due || due >= today) continue;
    queue.push({
      type: "design_request", id: r.id, title: r.title || `${r.request_type} request`, brand: r.brand,
      owner: r.assignee_email, daysLate: daysLate(due, today), href: "/?tab=sales-hub",
    });
  }
  for (const r of blogsRes.rows) {
    queue.push({
      type: "blog", id: r.gid, title: r.name, brand: null, owner: r.assignee,
      daysLate: daysLate(String(r.due_on), today), href: "/?tab=tasks",
    });
  }
  for (const r of campaignsRes.rows) {
    const kd = String(r.key_date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(kd)) continue; // placeholder text like "Sep" — no real date to judge yet
    if (kd < today || kd > riskWindowFuture) continue;
    // Not overdue — "at risk" counts down instead, shown as negative daysLate.
    queue.push({
      type: "campaign", id: String(r.id), title: r.campaign, brand: r.brand, owner: r.owner,
      daysLate: daysLate(kd, today), href: "/?tab=campaign-calendar",
    });
  }
  queue.sort((a, b) => b.daysLate - a.daysLate);

  // Snoozed items drop out until their resurface date.
  const snoozeRes = await sbGet(`command_snoozes?select=item_type,item_id,resurface_at&resurface_at=gte.${today}`);
  const snoozed = new Set(snoozeRes.rows.map((s: any) => `${s.item_type}:${s.item_id}`));
  const visibleQueue = queue.filter(q => !snoozed.has(`${q.type}:${q.id}`));

  const freshness = syncRes.rows.map((r: any) => ({ source: r.source, ok: r.ok, ran_at: r.ran_at, message: r.message }));

  return NextResponse.json({
    ok: true, needsSetup,
    header: {
      revenueActual, revenueBudget, revenueVariancePct,
      spendActual, spendBudget, spendVariancePct, monthElapsedPct,
      daysRemaining, queueCount: visibleQueue.length,
    },
    queue: visibleQueue,
    riskWindow,
    freshness,
  });
}

export async function PATCH(req: Request) {
  const acc = await getAccess();
  if (acc.role !== "admin") return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  if (b.action !== "snooze") return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
  const reason = String(b.reason || "").trim();
  if (!reason) return NextResponse.json({ ok: false, error: "A reason is required to snooze" }, { status: 400 });
  const resurfaceAt = String(b.resurface_at || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(resurfaceAt)) return NextResponse.json({ ok: false, error: "A resurface date is required" }, { status: 400 });
  const row = {
    item_type: String(b.item_type || "").slice(0, 40), item_id: String(b.item_id || "").slice(0, 80),
    snoozed_by: (acc.user as any)?.email ?? "unknown", reason: reason.slice(0, 300), resurface_at: resurfaceAt,
  };
  if (!row.item_type || !row.item_id) return NextResponse.json({ ok: false, error: "Missing item" }, { status: 400 });
  const res = await fetch(`${sbUrl}/rest/v1/command_snoozes`, { method: "POST", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify(row) });
  if (!res.ok) { const t = await res.text(); return NextResponse.json({ ok: false, needsSetup: missing(res.status, t), error: t.slice(0, 200) }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}
