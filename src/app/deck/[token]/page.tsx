import { DeckTracker } from "./DeckTracker";

// PUBLIC deck viewer — renders a shared launch deck's HTML full-page and
// tracks opens + viewing time per share link (internal viewers identified
// by their dashboard login; external viewers anonymous per-link).
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function DeckPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/.test(token) || !sbUrl || !sbKey) return <DeadEnd />;
  const sRes = await fetch(`${sbUrl}/rest/v1/deck_shares?token=eq.${token}&select=deck_id&limit=1`, {
    headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` }, cache: "no-store",
  });
  const share = (await sRes.json().catch(() => []))[0];
  if (!share) return <DeadEnd />;
  const dRes = await fetch(`${sbUrl}/rest/v1/decks?id=eq.${share.deck_id}&select=title,html&limit=1`, {
    headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` }, cache: "no-store",
  });
  const deck = (await dRes.json().catch(() => []))[0];
  if (!deck) return <DeadEnd />;

  return (
    <main className="min-h-screen bg-white">
      <DeckTracker token={token} />
      <div dangerouslySetInnerHTML={{ __html: deck.html }} />
    </main>
  );
}

function DeadEnd() {
  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 max-w-md text-center">
        <p className="text-2xl mb-2">🔗</p>
        <h1 className="text-lg font-bold text-slate-800">This link isn&apos;t valid</h1>
        <p className="text-sm text-gray-500 mt-2">The deck may have been removed or the link revoked. Contact the Coolkidz marketing team for a fresh link.</p>
      </div>
    </main>
  );
}
