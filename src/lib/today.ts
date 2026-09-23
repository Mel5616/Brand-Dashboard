import { createHash } from "crypto";
import { rest } from "@/lib/registry";
import { REWARD_BRANDS } from "@/lib/reviewRewards";
import { jobHealth, type JobRun } from "@/lib/jobs";

// The "Today" queue: every needs-attention signal the dashboard already
// computes, gathered into one list. Built live from Supabase on each request
// (nothing is stored except dismissals). Each item has a stable key that
// includes a version — the count, the review id, the day — so a dismissed
// item stays hidden until it genuinely changes.
export type Severity = "urgent" | "attention" | "info";
export type TodayItem = {
  key: string; severity: Severity; area: string; brand: string | null; brandId: number | null; colour: string | null;
  title: string; detail: string | null; tab: string | null; href: string | null; at: string | null;
};
export type Today = { generatedAt: string; items: TodayItem[]; jobs: JobRun[]; jobsSource: "github" | "none"; needsSetup: boolean };

export const todayKey = () => createHash("sha256").update("today:" + (process.env.SUPABASE_SERVICE_ROLE_KEY || "")).digest("hex").slice(0, 40);
const brand = (id: number) => REWARD_BRANDS.find(b => b.id === id);
const byName = (name: string) => REWARD_BRANDS.find(b => b.name.toLowerCase() === (name || "").toLowerCase() || b.host.startsWith((name || "").toLowerCase().replace(/\s+/g, "")));
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-AU", { timeZone: "Australia/Melbourne" });
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "Australia/Melbourne" });

async function q<T>(path: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < 10000; from += 1000) {
    const res = await rest(path, { headers: { Range: `${from}-${from + 999}` } }).catch(() => null);
    if (!res || !res.ok) break;
    const page = (await res.json()) as T[];
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

export async function buildToday(): Promise<Today> {
  const now = Date.now();
  const d1 = new Date(now - 864e5).toISOString(), d7 = new Date(now - 7 * 864e5).toISOString(), d30 = new Date(now - 30 * 864e5).toISOString();
  const thisMonth = monthKey(new Date()), lastMonth = monthKey(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1));
  const [reviews, flows, metrics, campaigns, blogs, edms, requests, rewards, dismissals, jobs] = await Promise.all([
    q<{ id: string; brand_id: number; brand_name: string; rating: number | null; author: string | null; email: string | null; product_name: string | null; product_url: string | null; content: string | null; status: string | null; review_type: string | null; created: string | null; public_reply: string | null }>(`klaviyo_reviews?select=id,brand_id,brand_name,rating,author,email,product_name,product_url,content,status,review_type,created,public_reply&or=(status.eq.pending,created.gte.${d7})&order=created.desc`),
    q<{ brand_id: number; flow_id: string; name: string; status: string | null }>("klaviyo_flows?select=brand_id,flow_id,name,status&status=eq.draft"),
    q<{ brand_id: number; month_key: string; emails_sent: number; revenue: number; bounces: number; spam_complaints: number; unsubscribes: number }>(`klaviyo_metrics?select=brand_id,month_key,emails_sent,revenue,bounces,spam_complaints,unsubscribes&month_key=in.(${thisMonth},${lastMonth})`),
    q<{ brand_id: number; campaign_id: string; name: string; subject: string | null; status: string | null; send_time: string | null }>(`klaviyo_campaigns?select=brand_id,campaign_id,name,subject,status,send_time&status=eq.Scheduled&send_time=gte.${new Date(now).toISOString()}`),
    q<{ id: string; brand_id: number; status: string; title: string; scheduled_for: string | null; created_at: string; updated_at: string }>("blog_drafts?select=id,brand_id,status,title,scheduled_for,created_at,updated_at&status=eq.draft&order=created_at.asc"),
    q<{ id: string; brand_id: number; status: string; subject: string | null; scheduled_for: string | null; created_at: string; channel: string | null }>("edm_drafts?select=id,brand_id,status,subject,scheduled_for,created_at,channel&status=in.(planned,draft)&order=scheduled_for.asc.nullslast"),
    q<{ id: string; brand: string; page_url: string | null; change_type: string | null; description: string | null; priority: string | null; status: string; created_at: string; requester_name: string | null }>("website_requests?select=id,brand,page_url,change_type,description,priority,status,created_at,requester_name&status=in.(new,in_progress)&order=created_at.asc"),
    q<{ id: string; source_brand_name: string; customer_email: string; status: string; error: string | null; issued_at: string }>(`review_rewards?select=id,source_brand_name,customer_email,status,error,issued_at&status=eq.failed&issued_at=gte.${d30}`),
    q<{ key: string; until: string }>(`today_dismissals?select=key,until&until=gte.${new Date(now).toISOString()}`).catch(() => [] as { key: string; until: string }[]),
    jobHealth(),
  ]);
  const items: TodayItem[] = [];
  const push = (i: Omit<TodayItem, "colour"> & { colour?: string | null }) => items.push({ colour: i.brandId != null ? brand(i.brandId)?.colour ?? null : null, ...i });

  // Reviews: low ratings this week (urgent if in the last 24h and unanswered), pending per brand
  for (const r of reviews.filter(r => r.review_type !== "question" && r.rating != null && r.rating <= 2 && r.created && r.created >= d7)) {
    push({ key: `review-low:${r.id}:${r.public_reply ? "replied" : "open"}`, severity: !r.public_reply && r.created! >= d1 ? "urgent" : "attention", area: "Reviews", brand: r.brand_name, brandId: r.brand_id,
      title: `${"★".repeat(r.rating!)} review on ${r.product_name || "the shop"}`, detail: `${r.author || "Anonymous"}${r.email ? ` · ${r.email}` : ""}${r.content ? ` — ${r.content.slice(0, 140)}${r.content.length > 140 ? "…" : ""}` : ""}${r.public_reply ? " · replied" : " · no reply yet"}`, tab: "reviews", href: "https://www.klaviyo.com/reviews", at: r.created });
  }
  const pending = reviews.filter(r => r.status === "pending");
  for (const [bid, n] of Object.entries(pending.reduce<Record<number, number>>((m, r) => { m[r.brand_id] = (m[r.brand_id] || 0) + 1; return m; }, {}))) {
    const b = brand(Number(bid));
    push({ key: `review-pending:${bid}:${n}`, severity: "attention", area: "Reviews", brand: b?.name ?? null, brandId: Number(bid), title: `${n} review${n === 1 ? "" : "s"} waiting for approval`, detail: "Approve or reject in Klaviyo Reviews so they show on the site.", tab: "reviews", href: "https://www.klaviyo.com/reviews", at: null });
  }
  for (const r of rewards) push({ key: `reward-failed:${r.id}`, severity: "attention", area: "Reviews", brand: r.source_brand_name, brandId: byName(r.source_brand_name)?.id ?? null, title: `$5 reward failed for ${r.customer_email}`, detail: r.error, tab: "reviews", href: null, at: r.issued_at });

  // Flows: drafts that are built and only need Live
  const READY = /review request|replenish|abandoned checkout|welcome series 2026|filter/i;
  const ready = flows.filter(f => READY.test(f.name) && !/klaviyo reviews\)?$/i.test(f.name));
  for (const [bid, fs] of Object.entries(ready.reduce<Record<number, typeof flows>>((m, f) => { (m[f.brand_id] ||= []).push(f); return m; }, {}))) {
    const b = brand(Number(bid));
    push({ key: `flows-draft:${bid}:${fs.map(f => f.flow_id).sort().join(",")}`, severity: "attention", area: "Email", brand: b?.name ?? null, brandId: Number(bid), title: `${fs.length} flow${fs.length === 1 ? "" : "s"} built, waiting on Live`, detail: fs.map(f => f.name).join(" · "), tab: "lifecycle-flows", href: fs.length === 1 ? `https://www.klaviyo.com/flow/${fs[0].flow_id}/edit` : null, at: null });
  }

  // Deliverability, latest month with a meaningful send. Rates here are per
  // delivered PROFILE (klaviyo_metrics stores unique recipients), so they run
  // higher than Klaviyo's per-email benchmarks; thresholds are set for that.
  for (const b of REWARD_BRANDS) {
    const m = metrics.filter(x => x.brand_id === b.id && x.emails_sent >= 100).sort((a, c) => c.month_key.localeCompare(a.month_key))[0];
    if (!m) continue;
    const bounce = (m.bounces / m.emails_sent) * 100, spam = (m.spam_complaints / m.emails_sent) * 100, unsub = (m.unsubscribes / m.emails_sent) * 100;
    if (bounce > 2) push({ key: `bounce:${b.id}:${m.month_key}:${bounce.toFixed(0)}`, severity: bounce > 10 ? "urgent" : "attention", area: "Email", brand: b.name, brandId: b.id, title: `Bounce rate ${bounce.toFixed(1)}% in ${m.month_key}`, detail: bounce > 10 ? `${m.bounces.toLocaleString()} of ${m.emails_sent.toLocaleString()} bounced. That looks like a send to an imported or stale list; suppress the bounces and check the list before the next campaign, or the domain's reputation takes the hit.` : "Klaviyo wants bounces under 1%. Clean the list (suppress bounced profiles) before the next send.", tab: "email", href: null, at: null });
    if (spam > 0.1) push({ key: `spam:${b.id}:${m.month_key}:${spam.toFixed(2)}`, severity: "attention", area: "Email", brand: b.name, brandId: b.id, title: `Spam complaints ${spam.toFixed(2)}% in ${m.month_key}`, detail: "Klaviyo's line is 0.1%. Ease off frequency and make sure the unsubscribe link is obvious.", tab: "email", href: null, at: null });
    if (unsub > 5) push({ key: `unsub:${b.id}:${m.month_key}:${unsub.toFixed(0)}`, severity: "info", area: "Email", brand: b.name, brandId: b.id, title: `Unsubscribes ${unsub.toFixed(1)}% of recipients in ${m.month_key}`, detail: "High for a month. Worth checking what went out and to whom.", tab: "email", href: null, at: null });
  }

  // Campaign clashes in the next 7 days (urgent if tomorrow)
  const byDay = campaigns.filter(c => c.send_time && Date.parse(c.send_time) <= now + 7 * 864e5).reduce<Record<string, typeof campaigns>>((m, c) => { (m[dayKey(c.send_time!)] ||= []).push(c); return m; }, {});
  for (const [day, cs] of Object.entries(byDay)) {
    const brandsOn = [...new Set(cs.map(c => c.brand_id))];
    if (brandsOn.length < 2) continue;
    const tomorrow = Date.parse(cs[0].send_time!) <= now + 36 * 36e5;
    push({ key: `clash:${day}:${cs.map(c => c.campaign_id).sort().join(",")}`, severity: tomorrow ? "urgent" : "attention", area: "Email", brand: null, brandId: null, title: `${brandsOn.length} brands emailing on ${dayLabel(cs[0].send_time!)}`, detail: cs.map(c => `${brand(c.brand_id)?.name ?? c.brand_id}: ${c.subject || c.name}`).join(" · "), tab: "edm-planner", href: null, at: cs[0].send_time });
  }

  // Content waiting on approval or overdue
  for (const b of blogs) {
    const overdue = b.scheduled_for && Date.parse(b.scheduled_for) < now;
    const old = Date.parse(b.created_at) < now - 2 * 864e5;
    if (!overdue && !old) continue;
    push({ key: `blog:${b.id}:${overdue ? "overdue" : "waiting"}`, severity: overdue ? "urgent" : "attention", area: "Blog", brand: brand(b.brand_id)?.name ?? null, brandId: b.brand_id, title: overdue ? `Blog past its publish date: ${b.title}` : `Blog draft waiting for approval: ${b.title}`, detail: overdue ? `Was due ${dayLabel(b.scheduled_for!)}` : `Drafted ${dayLabel(b.created_at)}`, tab: "blog-pipeline", href: null, at: b.scheduled_for || b.created_at });
  }
  for (const e of edms) {
    if (!e.scheduled_for) continue;
    const t = Date.parse(e.scheduled_for);
    if (t > now + 3 * 864e5) continue;
    push({ key: `edm:${e.id}:${t < now ? "overdue" : "soon"}`, severity: t < now ? "urgent" : "attention", area: "Email", brand: brand(e.brand_id)?.name ?? null, brandId: e.brand_id, title: `${e.channel === "sms" ? "SMS" : "EDM"} ${t < now ? "past its send date" : "due soon"}: ${e.subject || "(no subject)"}`, detail: `${e.status} · planned for ${dayLabel(e.scheduled_for)}. Push it to Klaviyo from the Planner.`, tab: "edm-planner", href: null, at: e.scheduled_for });
  }
  for (const r of requests) {
    const age = (now - Date.parse(r.created_at)) / 864e5;
    if (r.status === "in_progress" && age < 7) continue;
    push({ key: `webreq:${r.id}:${r.status}`, severity: r.priority === "urgent" || (r.status === "new" && age > 3) ? "attention" : "info", area: "Website", brand: r.brand, brandId: byName(r.brand)?.id ?? null, title: `${r.status === "new" ? "New" : "Open for a week"}: ${r.change_type || "website change"}${r.page_url ? ` on ${r.page_url.replace(/^https?:\/\//, "")}` : ""}`, detail: `${r.requester_name || "someone"} · ${(r.description || "").slice(0, 120)}`, tab: "website-requests", href: null, at: r.created_at });
  }

  // Jobs
  for (const j of jobs.jobs) {
    if (j.status === "failed" || j.status === "stale") push({ key: `job:${j.file}:${j.status}:${(j.lastRun || "").slice(0, 13)}`, severity: "urgent", area: "Jobs", brand: null, brandId: null, title: `${j.label} ${j.status === "failed" ? "failed" : "hasn't run on time"}`, detail: `Runs ${j.every}. ${j.lastRun ? `Last run ${new Date(j.lastRun).toLocaleString("en-AU", { timeZone: "Australia/Melbourne", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` : "Never run"}. Everything downstream is going stale until it's fixed.`, tab: "today", href: j.url, at: j.lastRun });
  }

  const hidden = new Set(dismissals.map(d => d.key));
  const order: Record<Severity, number> = { urgent: 0, attention: 1, info: 2 };
  const visible = items.filter(i => !hidden.has(i.key)).sort((a, b) => order[a.severity] - order[b.severity] || (b.at || "").localeCompare(a.at || ""));
  return { generatedAt: new Date().toISOString(), items: visible, jobs: jobs.jobs, jobsSource: jobs.source, needsSetup: false };
}

// Plain HTML for the digest / alert emails (reused by both routes).
export function renderTodayEmail(items: TodayItem[], opts: { heading: string; intro: string; jobs?: JobRun[] }) {
  const esc = (s: string | null | undefined) => (s || "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
  const col: Record<Severity, string> = { urgent: "#dc2626", attention: "#b45309", info: "#64748b" };
  const site = process.env.DASHBOARD_URL || "https://marketing.coolkidz.com.au";
  const group = (s: Severity, label: string) => {
    const rows = items.filter(i => i.severity === s);
    if (!rows.length) return "";
    return `<h3 style="margin:22px 0 8px;font:600 13px/1.2 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:${col[s]};text-transform:uppercase;letter-spacing:.08em">${label} · ${rows.length}</h3>` + rows.map(i => `
      <div style="border-left:3px solid ${i.colour || col[s]};padding:8px 12px;margin:0 0 8px;background:#f8fafc;border-radius:0 8px 8px 0">
        <div style="font:600 14px/1.35 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#0f172a">${i.brand ? `<span style="color:#475569">${esc(i.brand)} · </span>` : ""}${esc(i.title)}</div>
        ${i.detail ? `<div style="font:13px/1.45 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#475569;margin-top:3px">${esc(i.detail)}</div>` : ""}
        <div style="font:12px/1.4 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;margin-top:4px">${i.tab ? `<a href="${site}/?tab=${i.tab}" style="color:#047857;text-decoration:none">Open in dashboard</a>` : ""}${i.href ? ` &nbsp;·&nbsp; <a href="${esc(i.href)}" style="color:#047857;text-decoration:none">Open source</a>` : ""}</div>
      </div>`).join("");
  };
  const jobs = opts.jobs?.length ? `<p style="font:12px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#64748b;margin-top:20px">Jobs: ${opts.jobs.map(j => `${j.label.split(" (")[0]} ${j.status === "ok" ? "✓" : j.status}`).join(" · ")}</p>` : "";
  return `<!doctype html><html><body style="margin:0;padding:24px 16px;background:#ffffff"><div style="max-width:560px;margin:0 auto">
    <p style="font:700 11px/1.2 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#94a3b8;letter-spacing:.18em;text-transform:uppercase;margin:0 0 6px">Coolkidz brand dashboard</p>
    <h1 style="font:700 22px/1.2 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#0f172a;margin:0 0 6px">${esc(opts.heading)}</h1>
    <p style="font:14px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#475569;margin:0">${esc(opts.intro)}</p>
    ${items.length === 0 ? `<p style="font:15px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#047857;margin-top:20px">Nothing needs you. Enjoy the coffee.</p>` : group("urgent", "Urgent") + group("attention", "Needs you") + group("info", "For your info")}
    ${jobs}
    <p style="font:12px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#94a3b8;margin-top:24px"><a href="${site}/?tab=today" style="color:#94a3b8">Open Today</a> · dismissed items stay hidden until they change</p>
  </div></body></html>`;
}

export async function sendTodayEmail(to: string[], subject: string, html: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "RESEND_API_KEY missing" };
  const res = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: "Brand Dashboard <noreply@coolkidz.com.au>", to, subject, html }) }).catch(() => null);
  if (!res || !res.ok) return { ok: false, error: res ? `Resend ${res.status} ${(await res.text()).slice(0, 200)}` : "network" };
  return { ok: true };
}
export const digestRecipients = () => (process.env.TODAY_DIGEST_TO || process.env.ADMIN_EMAILS || "mel@coolkidz.com.au").split(",").map(s => s.trim()).filter(Boolean);
