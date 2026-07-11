import { createClient } from "@/lib/supabase/server";
import { WeeklyBriefSheet } from "@/components/WeeklyBriefSheet";

export const revalidate = 0;

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sb = await createClient();
  const { data } = await sb.from("weekly_briefs").select("week_label").eq("share_token", token).single();
  return { title: data?.week_label ? `Weekly Brief · ${data.week_label}` : "Weekly Brief · Coolkidz Australia" };
}

// Public, token-protected weekly brief — no login. Shareable with the team.
export default async function WeeklyBriefPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sb = await createClient();
  const { data: brief } = await sb.from("weekly_briefs").select("week_label,intro,objectives,snapshot,published_at").eq("share_token", token).single();
  if (!brief) return <main className="min-h-screen grid place-items-center bg-slate-50 text-slate-500 text-sm">This brief link is not valid.</main>;

  return (
    <main className="min-h-screen bg-slate-100 py-8 px-4">
      <WeeklyBriefSheet brief={brief as any} />
    </main>
  );
}
