import { createClient } from "@/lib/supabase/server";
import { NanitCodeTable } from "@/components/NanitCodeTable";

// Public, token-protected page for Nanit: the influencer list with editable
// subscription code + plan on each row. Everything else is read-only.
export const revalidate = 0;
export const metadata = { title: "Nanit Australia · Influencer subscription codes" };

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

  return (
    <main className="min-h-screen bg-slate-100 py-8 px-4">
      <div className="max-w-5xl mx-auto space-y-4">
        <header className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-600">Nanit Australia · Coolkidz Australia</p>
          <h1 className="text-2xl font-bold text-slate-800 mt-1">Influencer subscription codes</h1>
          <p className="text-sm text-gray-500 mt-1.5">Gifted influencer collabs needing a Nanit subscription code. Please enter the <strong>subscription code</strong> (and plan) against each influencer, then click <strong>Save</strong> on the row — you&apos;ll see &ldquo;Saved ✓&rdquo; when it&apos;s done. Rows highlighted amber are waiting on a code.</p>
        </header>
        <NanitCodeTable token={token} rows={withAvatars} />
        <p className="text-[11px] text-gray-400 text-center">Coolkidz Australia · questions: mel@coolkidz.com.au</p>
      </div>
    </main>
  );
}
