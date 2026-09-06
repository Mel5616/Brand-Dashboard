// Shared conversation log for the public site assistants (Ask Davy on Zazu, Ask Frida on Frida).
// Rows land in public.assistant_logs (see supabase/assistant_logs.sql) and feed the
// "AI Assistants" tab in the dashboard. Best effort: never throws.
export type AssistantRow = { brand: string; session: string | null; page: string | null; question: string; answer: string };

export async function logAssistant(row: AssistantRow) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  const handoff = /contact (page|form)|can only help|speak (with|to) (your|a) (gp|midwife|doctor)|child health nurse|call 000/i.test(row.answer);
  await fetch(`${url}/rest/v1/assistant_logs`, { method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ ...row, handoff }) }).catch(() => null);
}

// Human replies posted from the dashboard for one visitor session (public, polled by the widget).
export async function humanReplies(brand: string, session: string, afterId: number) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !session) return [];
  const qs = `select=id,answer,created_at&brand=eq.${encodeURIComponent(brand)}&session=eq.${encodeURIComponent(session)}&role=eq.human&id=gt.${afterId || 0}&order=id.asc&limit=20`;
  const res = await fetch(`${url}/rest/v1/assistant_logs?${qs}`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" }).catch(() => null);
  if (!res || !res.ok) return [];
  return (await res.json()) as { id: number; answer: string; created_at: string }[];
}
