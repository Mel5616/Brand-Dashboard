import { fmt, fmtFull } from "@/lib/format";

// Renders a weekly brief. Shared by the public /w/[token] page and the compose
// preview so they never drift. Pure presentation — no data fetching.
type Objective = { text: string; done?: boolean };
type Snapshot = {
  generatedAt?: string;
  d2c?: { weekStart: string | null; partial?: boolean; total: number; wowPct: number | null; top: { brand: string; revenue: number; wow: number | null }[]; fallers: { brand: string; wow: number | null }[] };
  launches?: { campaign: string; brand: string; keyDate: string | null; status: string; oneLiner: string }[];
  promos?: { channel: string; tier: number | null; endDate: string; note: string; brands: string[] }[];
  attention?: { text: string; kind: string }[];
  wins?: {
    posts: { brand: string; engagement: number; likes: number; comments: number; reach: number; caption: string; permalink: string; image: string }[];
    email: { month: string; topRevenue: { brand: string; revenue: number } | null; bestClick: { brand: string; clickRate: number } | null } | null;
  };
};
export type Brief = { week_label?: string; intro?: string; objectives?: Objective[]; snapshot?: Snapshot; published_at?: string };

const dateShort = (s?: string | null) => s ? new Date(s + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : "";
const Wow = ({ v }: { v: number | null }) => v == null ? <span className="text-slate-300">—</span>
  : <span className={v >= 0 ? "text-emerald-600" : "text-rose-500"}>{v >= 0 ? "▲" : "▼"} {Math.abs(v)}%</span>;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-2.5">{title}</h2>
      {children}
    </section>
  );
}

export function WeeklyBriefSheet({ brief }: { brief: Brief }) {
  const s = brief.snapshot ?? {};
  const objectives = brief.objectives ?? [];
  const d2c = s.d2c, launches = s.launches ?? [], attention = s.attention ?? [], promos = s.promos ?? [];
  const wins = s.wins, posts = wins?.posts ?? [], email = wins?.email;
  const tierColor = (t: number | null) => t === 1 ? "bg-rose-100 text-rose-700" : t === 2 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500";

  return (
    <div className="max-w-[760px] mx-auto bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 space-y-7">
      <header className="border-b border-gray-100 pb-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-600">Weekly Brief · Coolkidz Australia</p>
        <h1 className="text-2xl font-bold text-slate-800 mt-1">{brief.week_label || "This week"}</h1>
        {brief.published_at && <p className="text-xs text-gray-400 mt-1">Published {new Date(brief.published_at).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}</p>}
      </header>

      {brief.intro && <p className="text-[15px] text-slate-600 leading-relaxed whitespace-pre-wrap">{brief.intro}</p>}

      {objectives.length > 0 && (
        <Section title="This week's objectives">
          <ul className="space-y-2">
            {objectives.filter(o => o.text?.trim()).map((o, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className={`mt-0.5 w-4 h-4 rounded border shrink-0 flex items-center justify-center ${o.done ? "bg-emerald-500 border-emerald-500" : "bg-white border-gray-300"}`}>
                  {o.done && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                </span>
                <span className={`text-[15px] leading-snug ${o.done ? "text-gray-400 line-through" : "text-slate-700"}`}>{o.text}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {(posts.length > 0 || email) && (
        <Section title="Wins this week">
          <div className="space-y-3">
            {posts.length > 0 && (
              <div className="space-y-2">
                {posts.map((p, i) => (
                  <a key={i} href={p.permalink || undefined} target="_blank" rel="noreferrer" className={`flex items-start gap-3 rounded-lg border border-gray-100 px-3 py-2 ${p.permalink ? "hover:bg-emerald-50/40" : ""}`}>
                    {p.image
                      ? <img src={p.image} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                      : <span className="w-12 h-12 rounded-lg bg-emerald-50 grid place-items-center shrink-0 text-lg">📣</span>}
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-semibold text-emerald-700">{p.brand}{i === 0 ? " · top post" : ""}</p>
                      {p.caption && <p className="text-[13px] text-slate-700 leading-snug truncate">{p.caption}</p>}
                      <p className="text-[12px] text-gray-500 mt-0.5">❤ {p.likes.toLocaleString()} · 💬 {p.comments.toLocaleString()}{p.reach ? ` · ${p.reach.toLocaleString()} reach` : ""}</p>
                    </div>
                  </a>
                ))}
              </div>
            )}
            {email && (email.topRevenue || email.bestClick) && (
              <div className="rounded-lg bg-violet-50/60 border border-violet-100 px-3 py-2 text-[13px] text-violet-900">
                <p className="text-[10px] uppercase tracking-wider text-violet-400 mb-0.5">Email · {email.month}</p>
                {email.topRevenue && <p><strong>{email.topRevenue.brand}</strong> email drove <strong>{fmtFull(email.topRevenue.revenue)}</strong>.</p>}
                {email.bestClick && <p className="mt-0.5">Best click-through: <strong>{email.bestClick.brand}</strong> at {email.bestClick.clickRate.toFixed(1)}%.</p>}
              </div>
            )}
          </div>
        </Section>
      )}

      {attention.length > 0 && (
        <Section title="Needs attention">
          <ul className="space-y-1.5">
            {attention.map((a, i) => (
              <li key={i} className="flex items-start gap-2 text-[14px] leading-snug rounded-lg bg-amber-50/70 border border-amber-100 px-3 py-2">
                <span className="text-amber-500 mt-0.5">⚠</span><span className="text-amber-900">{a.text}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {promos.length > 0 && (
        <Section title="Promotions live this week">
          <div className="space-y-2">
            {promos.map((p, i) => (
              <div key={i} className="flex items-start gap-2.5 rounded-lg border border-gray-100 bg-gray-50/70 px-3 py-2">
                <span className={`text-[10px] font-bold rounded px-1.5 py-0.5 mt-0.5 shrink-0 ${tierColor(p.tier)}`}>{p.tier != null ? `T${p.tier}` : "Promo"}</span>
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-slate-800">{p.channel} <span className="font-normal text-gray-400">· ends {dateShort(p.endDate)}</span></p>
                  {p.note && <p className="text-[13px] text-slate-600">{p.note}</p>}
                  <p className="text-[13px] text-slate-500">{p.brands.join(", ")}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {launches.length > 0 && (
        <Section title="Upcoming launches">
          <div className="space-y-2">
            {launches.map((l, i) => (
              <div key={i} className="flex items-start gap-3 rounded-lg border border-gray-100 px-3 py-2">
                <div className="text-center shrink-0 w-12">
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 leading-none">{l.keyDate ? new Date(l.keyDate + "T00:00:00").toLocaleDateString("en-AU", { month: "short" }) : "TBC"}</p>
                  <p className="text-lg font-bold text-slate-700 leading-none">{l.keyDate ? new Date(l.keyDate + "T00:00:00").getDate() : "·"}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-slate-800">{l.campaign}</p>
                  <p className="text-[12px] text-gray-500">{l.brand}{l.status ? ` · ${l.status}` : ""}</p>
                  {l.oneLiner && <p className="text-[13px] text-slate-500 mt-0.5 leading-snug">{l.oneLiner}</p>}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {d2c && d2c.weekStart && (
        <Section title={`D2C results · week of ${dateShort(d2c.weekStart)}${d2c.partial ? " (so far)" : ""}`}>
          <div className="rounded-xl bg-slate-50 border border-gray-100 px-4 py-3">
            <div className="flex items-baseline gap-3">
              <p className="text-2xl font-bold text-slate-800">{fmtFull(d2c.total)}</p>
              <span className="text-sm font-semibold"><Wow v={d2c.wowPct} /> <span className="text-gray-400 font-normal">vs {d2c.partial ? "same days last week" : "prior week"}</span></span>
            </div>
            {d2c.top.length > 0 && (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1.5">
                {d2c.top.map(m => (
                  <div key={m.brand} className="flex items-center justify-between text-[13px]">
                    <span className="text-slate-600 truncate">{m.brand}</span>
                    <span className="text-slate-700 font-semibold tabular-nums ml-2">{fmt(m.revenue)} <Wow v={m.wow} /></span>
                  </div>
                ))}
              </div>
            )}
            {d2c.fallers.length > 0 && <p className="text-[12px] text-rose-500 mt-2">Watch: {d2c.fallers.map(f => `${f.brand} ${f.wow}%`).join(" · ")}</p>}
          </div>
          <p className="text-[10px] text-gray-400 mt-1.5">Own-store (D2C) revenue only — excludes Amazon, wholesale and Baby Bunting.</p>
        </Section>
      )}

      <footer className="border-t border-gray-100 pt-3 text-[11px] text-gray-400 text-center">
        Coolkidz Australia · figures ex-GST · snapshot from {s.generatedAt ? new Date(s.generatedAt).toLocaleDateString("en-AU") : "publish"}
      </footer>
    </div>
  );
}
