"use client";

import { useEffect, useState } from "react";

// Members-only influencer view for the social team. Budget pacing as percentages
// and gifts by RRP — never any cost. Plus a social board of post performance
// (likes / reach) that the team fills in once a post is live.

type Brand = { brand: string; gifts: number; rrp_gifted: number; used_pct: number; left_pct: number };
type Gift = {
  id: number; month_key: string; handle: string | null; platform: string | null; brand: string | null;
  product_name: string | null; rrp: number | null; status: string | null; content_url: string | null;
  content_type: string | null; likes: number | null; reach: number | null; posted_at: string | null;
  avatar_url: string | null;
};
type TopInf = { handle: string; likes: number; name: string | null; followers: number | null; avatar_url: string | null };
type Social = { posts: number; likes: number; reach: number };
type Data = { fyLabel: string; overall: { used_pct: number; left_pct: number }; brands: Brand[]; gifts: Gift[]; social: Social; topInfluencers: TopInf[] };

function Avatar({ url, name, size = 40 }: { url: string | null; name: string | null; size?: number }) {
  const initial = (name || "?").replace(/^@/, "")[0]?.toUpperCase() || "?";
  return url
    ? <img src={url} alt="" className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />
    : <div className="rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center shrink-0" style={{ width: size, height: size, fontSize: size * 0.4 }}>{initial}</div>;
}

const rrp = (n: number | null) => n == null ? "—" : "$" + Math.round(n).toLocaleString("en-AU");
const compact = (n: number | null) => n == null ? "—" : n >= 1_000_000 ? (n / 1e6).toFixed(1) + "M" : n >= 1_000 ? (n / 1e3).toFixed(1) + "K" : String(n);
const mon = (k: string) => new Date(k + "-01T00:00:00").toLocaleDateString("en-AU", { month: "short", year: "2-digit" });
const engRate = (likes: number | null, reach: number | null) => likes && reach ? (likes / reach) * 100 : null;
const meterColor = (used: number) => used >= 100 ? "#ef4444" : used >= 80 ? "#f59e0b" : "#6366f1";

function Bar({ used }: { used: number }) {
  const u = Math.min(100, Math.max(0, used));
  return <div className="h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: `${u}%`, background: meterColor(used) }} /></div>;
}
function Ring({ used, size = 96 }: { used: number; size?: number }) {
  const u = Math.min(100, Math.max(0, used));
  const left = Math.max(0, 100 - Math.round(used));
  const r = size / 2 - 8, c = 2 * Math.PI * r, off = c * (u / 100);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef2f6" strokeWidth="8" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={meterColor(used)} strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x={size / 2} y={size / 2 - 1} textAnchor="middle" fontSize="20" fontWeight="800" fill="#1c2733">{left}%</text>
      <text x={size / 2} y={size / 2 + 14} textAnchor="middle" fontSize="9.5" fontWeight="600" fill="#9aa6b4">left</text>
    </svg>
  );
}

const STATUS_PILL: Record<string, string> = {
  Live: "bg-emerald-100 text-emerald-700", Posted: "bg-sky-100 text-sky-700",
  Gifted: "bg-amber-100 text-amber-700", Done: "bg-violet-100 text-violet-700",
};
const statusCls = (s: string | null) => (s && STATUS_PILL[s]) || "bg-slate-100 text-slate-500";

export function TeamGiftingPanel() {
  const [data, setData] = useState<Data | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "needsSetup" | "error">("loading");
  const [editing, setEditing] = useState<number | null>(null);

  async function load() {
    try {
      const d = await fetch("/api/influencer/team").then(r => r.json());
      if (d.needsSetup) setState("needsSetup");
      else if (d.ok) { setData(d); setState("ready"); }
      else setState("error");
    } catch { setState("error"); }
  }
  useEffect(() => { load(); }, []);

  if (state === "loading") return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">Loading…</div>;
  if (state === "needsSetup") return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">Gifting isn’t set up yet. Run <code>add_influencer_social.sql</code> in Supabase, then reload.</div>;
  if (state === "error" || !data) return <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">Couldn’t load gifting.</div>;

  const avgEng = engRate(data.social.likes, data.social.reach);
  const Kpi = ({ label, value, accent }: { label: string; value: string; accent: string }) => (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">{label}</p>
      <p className="text-2xl font-bold mt-1" style={{ color: accent }}>{value}</p>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-semibold text-gray-800">Influencer & Social</h2>
          <p className="text-xs text-gray-400 mt-0.5">{data.fyLabel} · budget as % · gift value is RRP · add post results as they go live</p>
        </div>
        <a href="/log-gift" target="_blank" className="text-xs font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-3 py-2">Log a gift ↗</a>
      </div>

      {/* Social performance KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Posts live" value={String(data.social.posts)} accent="#1c2733" />
        <Kpi label="Total likes" value={compact(data.social.likes)} accent="#e1306c" />
        <Kpi label="Total reach" value={compact(data.social.reach)} accent="#5b86b0" />
        <Kpi label="Avg engagement" value={avgEng != null ? avgEng.toFixed(1) + "%" : "—"} accent="#4f9d86" />
      </div>

      {/* Notable users — top influencers by likes */}
      {data.topInfluencers.filter(t => t.likes > 0 || t.avatar_url).length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-700">Notable influencers</h3>
            <div className="hidden sm:flex gap-10 text-[10px] font-semibold uppercase tracking-wide text-gray-400 pr-1"><span className="w-12 text-right">Likes</span><span className="w-14 text-right">Followers</span></div>
          </div>
          <div className="divide-y divide-gray-50">
            {data.topInfluencers.filter(t => t.likes > 0 || t.avatar_url).map(t => (
              <div key={t.handle} className="flex items-center gap-3 py-2.5">
                <Avatar url={t.avatar_url} name={t.name || t.handle} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-800 truncate">{(t.name || t.handle || "").replace(/^@/, "")}</p>
                  <p className="text-xs text-gray-400 truncate">{t.handle}</p>
                </div>
                <span className="w-12 text-right font-semibold text-slate-700">{compact(t.likes)}</span>
                <span className="w-14 text-right font-semibold text-slate-700">{compact(t.followers)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Overall budget */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-baseline justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-700">Budget remaining</h3>
          <span className="text-2xl font-bold text-slate-800">{data.overall.left_pct}% <span className="text-sm font-medium text-gray-400">left</span></span>
        </div>
        <Bar used={data.overall.used_pct} />
        <p className="text-[11px] text-gray-400 mt-1.5">{data.overall.used_pct}% of the FY gifting budget used across all brands</p>
      </div>

      {/* Per brand budget meters */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Budget by brand</h3>
        {data.brands.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">No gifts logged yet.</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {data.brands.map(b => (
              <div key={b.brand} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col items-center text-center">
                <p className="text-sm font-semibold text-slate-700 truncate w-full" title={b.brand}>{b.brand}</p>
                <div className="my-2"><Ring used={b.used_pct} /></div>
                <span className="text-[11px] font-semibold" style={{ color: meterColor(b.used_pct) }}>{b.used_pct}% used</span>
                <p className="text-[11px] text-gray-400 mt-1">{b.gifts} gift{b.gifts === 1 ? "" : "s"} · {rrp(b.rrp_gifted)} RRP</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Post board */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Posts</h3>
        {data.gifts.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">No gifts logged yet.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {data.gifts.map(g => (
              <PostCard key={g.id} g={g} editing={editing === g.id} onEdit={() => setEditing(g.id)} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PostCard({ g, editing, onEdit, onClose, onSaved }: { g: Gift; editing: boolean; onEdit: () => void; onClose: () => void; onSaved: () => void }) {
  const er = engRate(g.likes, g.reach);
  if (editing) return <PostEditor g={g} onClose={onClose} onSaved={onSaved} />;
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-start gap-3">
        <Avatar url={g.avatar_url} name={g.handle} size={40} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-700 truncate">{g.handle || "—"}{g.platform && <span className="text-gray-400 font-normal"> · {g.platform}</span>}</p>
          <p className="text-[11px] text-gray-400 truncate">{g.brand || "—"}{g.product_name ? ` · ${g.product_name}` : ""}</p>
        </div>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${statusCls(g.status)}`}>{g.status || "Gifted"}</span>
      </div>

      {g.content_url ? (
        <>
          <div className="grid grid-cols-3 gap-2 mt-3 text-center">
            <div><p className="text-base font-bold text-slate-800">{compact(g.likes)}</p><p className="text-[10px] text-gray-400">❤ Likes</p></div>
            <div><p className="text-base font-bold text-slate-800">{compact(g.reach)}</p><p className="text-[10px] text-gray-400">👁 Reach</p></div>
            <div><p className="text-base font-bold text-slate-800">{er != null ? er.toFixed(1) + "%" : "—"}</p><p className="text-[10px] text-gray-400">⚡ Eng.</p></div>
          </div>
          <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-50 text-[11px]">
            <span className="text-gray-400">{g.content_type || "Post"} · {g.posted_at ? new Date(g.posted_at + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : mon(g.month_key)}</span>
            <span className="flex items-center gap-3">
              <a href={g.content_url} target="_blank" rel="noopener" className="text-emerald-600 font-medium hover:underline">View post ↗</a>
              <button onClick={onEdit} className="text-slate-400 hover:text-slate-600">Edit</button>
            </span>
          </div>
        </>
      ) : (
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[11px] text-gray-400">Awaiting post</span>
          <button onClick={onEdit} className="text-xs font-semibold text-emerald-600 hover:underline">+ Add results</button>
        </div>
      )}
    </div>
  );
}

function PostEditor({ g, onClose, onSaved }: { g: Gift; onClose: () => void; onSaved: () => void }) {
  const [url, setUrl] = useState(g.content_url || "");
  const [type, setType] = useState(g.content_type || "Reel");
  const [likes, setLikes] = useState(g.likes != null ? String(g.likes) : "");
  const [reach, setReach] = useState(g.reach != null ? String(g.reach) : "");
  const [posted, setPosted] = useState(g.posted_at || "");
  const [status, setStatus] = useState(g.status || "Live");
  const [avatar, setAvatar] = useState(g.avatar_url || "");
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  async function uploadAvatar(file: File) {
    if (!g.handle) return;
    setUploading(true);
    const fd = new FormData(); fd.append("file", file); fd.append("handle", g.handle);
    const r = await fetch("/api/influencer/avatar", { method: "POST", body: fd }).then(x => x.json()).catch(() => ({}));
    setUploading(false);
    if (r.url) setAvatar(r.url);
  }
  async function save() {
    setBusy(true);
    await fetch("/api/influencer/post", { method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: g.id, content_url: url, content_type: type, likes, reach, posted_at: posted || null, status }) }).catch(() => {});
    setBusy(false); onSaved();
  }
  const inp = "w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-400";
  return (
    <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm p-4">
      <div className="flex items-center gap-3 mb-3">
        <Avatar url={avatar || null} name={g.handle} size={44} />
        <div className="min-w-0">
          <p className="font-semibold text-slate-700 text-sm truncate">{g.handle} · {g.brand}</p>
          <label className={`text-[11px] font-medium ${g.handle ? "text-emerald-600 hover:underline cursor-pointer" : "text-gray-300"}`}>
            {uploading ? "Uploading…" : avatar ? "Change photo" : "Upload photo"}
            <input type="file" accept="image/*" disabled={!g.handle || uploading} className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); }} />
          </label>
        </div>
      </div>
      <div className="space-y-2">
        <input value={url} onChange={e => setUrl(e.target.value)} placeholder="Post link (https://instagram.com/p/…)" className={inp} />
        <div className="grid grid-cols-2 gap-2">
          <select value={type} onChange={e => setType(e.target.value)} className={inp + " bg-white"}>
            {["Reel", "Post", "Story", "Other"].map(t => <option key={t}>{t}</option>)}
          </select>
          <select value={status} onChange={e => setStatus(e.target.value)} className={inp + " bg-white"}>
            {["Gifted", "Posted", "Live", "Done"].map(t => <option key={t}>{t}</option>)}
          </select>
          <input value={likes} onChange={e => setLikes(e.target.value)} inputMode="numeric" placeholder="Likes" className={inp} />
          <input value={reach} onChange={e => setReach(e.target.value)} inputMode="numeric" placeholder="Reach / views" className={inp} />
          <input type="date" value={posted} onChange={e => setPosted(e.target.value)} className={inp + " col-span-2"} />
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-3">
        <button onClick={onClose} className="text-sm text-slate-500 px-3 py-1.5">Cancel</button>
        <button onClick={save} disabled={busy} className="text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 rounded-lg px-4 py-1.5">{busy ? "Saving…" : "Save"}</button>
      </div>
    </div>
  );
}
