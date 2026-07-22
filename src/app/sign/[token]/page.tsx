import { TERMS, TERMS_INTRO } from "@/lib/releaseTerms";
import { SignForm } from "./SignForm";

// PUBLIC guardian signing page — tokenised, no login. Invalid/used/expired
// tokens get a polite dead end. Terms come from the shared constants file.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function DeadEnd({ msg }: { msg: string }) {
  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 max-w-md text-center">
        <p className="text-2xl mb-2">📷</p>
        <h1 className="text-lg font-bold text-slate-800">{msg}</h1>
        <p className="text-sm text-gray-500 mt-2 leading-relaxed">If you were expecting to sign a photography release, contact the Coolkidz marketing team at <a className="text-emerald-600 font-semibold" href="mailto:marketing@coolkidz.com.au">marketing@coolkidz.com.au</a> and we&apos;ll send a fresh link.</p>
      </div>
    </main>
  );
}

export default async function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/.test(token) || !sbUrl || !sbKey) return <DeadEnd msg="This link isn't valid" />;
  const res = await fetch(`${sbUrl}/rest/v1/media_releases?token=eq.${token}&limit=1`, {
    headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` }, cache: "no-store",
  });
  const r = (await res.json().catch(() => []))[0];
  if (!r) return <DeadEnd msg="This link isn't valid" />;
  if (r.status === "signed") return <DeadEnd msg="This release has already been signed" />;
  if (r.status !== "sent" || r.expires_at < new Date().toISOString()) return <DeadEnd msg="This link has expired" />;

  const shoot = [
    r.shoot_date ? new Date(r.shoot_date + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }) : null,
    r.shoot_location,
  ].filter(Boolean).join(" · ");

  return (
    <main className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-[#132741] rounded-t-2xl px-7 py-5">
          <p className="text-white font-bold tracking-[0.14em] text-sm">COOLKIDZ AUSTRALIA</p>
          <h1 className="text-white text-xl font-bold mt-1">Photography &amp; media release</h1>
        </div>
        <div className="bg-white rounded-b-2xl border border-t-0 border-gray-100 shadow-sm p-7">
          <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 text-[13.5px] text-slate-600 space-y-1">
            <p><span className="font-semibold text-slate-800">Child:</span> {r.child_first_name}</p>
            <p><span className="font-semibold text-slate-800">Parent / guardian:</span> {r.guardian_name}</p>
            <p><span className="font-semibold text-slate-800">Brand{r.campaign ? " / campaign" : ""}:</span> {[r.brand, r.campaign].filter(Boolean).join(" · ")}</p>
            {shoot && <p><span className="font-semibold text-slate-800">Shoot:</span> {shoot}</p>}
          </div>

          <p className="text-[13.5px] text-slate-600 leading-relaxed mt-5">{TERMS_INTRO}</p>
          <div className="mt-4 space-y-3.5">
            {TERMS.map(t => (
              <div key={t.heading}>
                <p className="text-[13px] font-bold text-slate-800">{t.heading}</p>
                <p className="text-[13px] text-slate-600 leading-relaxed mt-0.5">{t.body}</p>
              </div>
            ))}
          </div>

          <SignForm token={token} childName={r.child_first_name} guardianName={r.guardian_name} />
        </div>
        <p className="text-center text-[11px] text-gray-400 mt-4">Coolkidz Australia · marketing@coolkidz.com.au</p>
      </div>
    </main>
  );
}
