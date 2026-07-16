import { createClient } from "@/lib/supabase/server";
import { NanitCodeTable } from "@/components/NanitCodeTable";

// Public, token-protected page for Nanit: the influencer program at a glance
// (reach, gifted value, code progress) + the list with editable code/plan.
export const revalidate = 0;
export const metadata = { title: "Nanit Australia · Influencer program" };

// "92.5k" / "1M" / "4,359" → number, for the combined-reach stat.
function parseFollowers(s?: string | null): number {
  if (!s) return 0;
  const t = String(s).trim().toLowerCase().replace(/,/g, "");
  const m = t.match(/^([\d.]+)\s*([km])?$/);
  if (!m) return 0;
  const n = parseFloat(m[1]) || 0;
  return Math.round(n * (m[2] === "m" ? 1e6 : m[2] === "k" ? 1e3 : 1));
}
const compact = (n: number) => n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M" : n >= 1e3 ? Math.round(n / 1e3) + "k" : String(n);

export default async function NanitCodesPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sb = await createClient();
  const { data: settings } = await sb.from("nanit_settings").select("share_token").eq("id", 1).single();
  if (!settings?.share_token || settings.share_token !== token) {
    return <main className="min-h-screen grid place-items-center bg-slate-50 text-slate-500 text-sm">This link is not valid.</main>;
  }
  const { data: rows } = await sb.from("nanit_influencers").select("id,month_key,name,handle,email,followers,platform,product_supplied,product_value,subscription_code,subscription_plan").order("month_key", { ascending: false }).order("created_at", { ascending: false });
  const { data: roster } = await sb.from("influencers").select("handle,avatar_url");
  const avatarBy = new Map((roster ?? []).map(r => [String(r.handle || "").toLowerCase(), r.avatar_url]));
  const withAvatars = (rows ?? []).map(r => ({ ...r, avatar_url: avatarBy.get(String(r.handle || "").toLowerCase()) ?? null }));

  const reach = withAvatars.reduce((s, r) => s + parseFollowers(r.followers), 0);
  const value = withAvatars.reduce((s, r) => s + (Number(r.product_value) || 0), 0);
  const issued = withAvatars.filter(r => r.subscription_code).length;
  const total = withAvatars.length;
  const pct = total ? Math.round((issued / total) * 100) : 0;
  const faces = withAvatars.filter(r => r.avatar_url).slice(0, 6);

  return (
    <main className="min-h-screen bg-slate-100 py-8 px-4">
      <div className="max-w-5xl mx-auto space-y-4">
        {/* Hero */}
        <header className="relative overflow-hidden rounded-2xl shadow-sm text-white" style={{ background: "linear-gradient(120deg, #0c4a6e 0%, #0369a1 55%, #0ea5e9 100%)" }}>
          <div className="absolute inset-0 opacity-[0.15]" style={{ background: "radial-gradient(ellipse at 85% 0%, #ffffff 0%, transparent 55%)" }} />
          <div className="relative px-6 sm:px-9 pt-7 pb-8">
            <div className="flex items-center justify-between gap-3 mb-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logos/ck_icons.png" alt="" className="w-10 h-10 bg-white rounded-xl p-1.5 shadow-sm" />
              {faces.length > 0 && (
                <div className="flex -space-x-2.5">
                  {faces.map(f => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={f.id} src={f.avatar_url!} alt="" className="w-9 h-9 rounded-full object-cover ring-2 ring-white/70" />
                  ))}
                </div>
              )}
            </div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/75">Nanit Australia × Coolkidz Australia</p>
            <h1 className="text-[26px] sm:text-3xl font-extrabold leading-tight mt-1">Influencer program · subscription codes</h1>
            <p className="text-[13px] text-white/80 mt-1.5 max-w-2xl">Gifted Nanit collabs across Australia. Enter the <strong className="text-white">subscription code</strong> (and plan) on each row, then click <strong className="text-white">Save</strong> — amber rows are waiting on a code.</p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
              <div className="rounded-xl bg-white/10 backdrop-blur px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-white/60">Influencers</p>
                <p className="text-2xl font-extrabold tabular-nums">{total}</p>
              </div>
              <div className="rounded-xl bg-white/10 backdrop-blur px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-white/60">Combined reach</p>
                <p className="text-2xl font-extrabold tabular-nums">{compact(reach)}</p>
              </div>
              <div className="rounded-xl bg-white/10 backdrop-blur px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-white/60">Product gifted (RRP)</p>
                <p className="text-2xl font-extrabold tabular-nums">${Math.round(value).toLocaleString()}</p>
              </div>
              <div className="rounded-xl bg-white/10 backdrop-blur px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-white/60">Codes issued</p>
                <p className="text-2xl font-extrabold tabular-nums">{issued}<span className="text-sm font-semibold text-white/60">/{total}</span></p>
                <div className="mt-1.5 h-1.5 rounded-full bg-white/20 overflow-hidden"><div className="h-full rounded-full bg-emerald-300" style={{ width: `${pct}%` }} /></div>
              </div>
            </div>
          </div>
        </header>

        <NanitCodeTable token={token} rows={withAvatars} />
        <p className="text-[11px] text-gray-400 text-center">Coolkidz Australia · questions: mel@coolkidz.com.au</p>
      </div>
    </main>
  );
}
