import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

// Launch decks admin API. GET lists decks + share links + view stats.
// POST multipart creates a deck from an uploaded .html file (or html field).
// PATCH: share.create / share.delete / deck rename. DELETE removes a deck.
export const revalidate = 0;
const missing = (m: string) => /PGRST205|does not exist|schema cache|relation .* does not exist/i.test(m || "");

export async function GET() {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  const sb = await createClient();
  const [d, s, v] = await Promise.all([
    sb.from("decks").select("id,title,brand,html,created_by,created_at").order("created_at", { ascending: false }),
    sb.from("deck_shares").select("*").order("created_at", { ascending: true }),
    sb.from("deck_views").select("share_id,session_id,viewer,seconds,opened_at,last_seen"),
  ]);
  if (d.error) return NextResponse.json({ ok: true, needsSetup: missing(d.error.message), decks: [], shares: [], views: [] });
  // Card thumbnails: the deck's stylesheet + its first slide (cqw units make it
  // scale natively inside a small card). Full html never leaves this route.
  const decks = (d.data ?? []).map((r: any) => {
    const style = r.html.match(/<style>[\s\S]*?<\/style>/)?.[0] ?? "";
    const slide = r.html.match(/<section class="slide"[\s\S]*?<\/section>/)?.[0] ?? "";
    const { html: _h, ...rest } = r;
    return { ...rest, thumb: style + slide };
  });
  return NextResponse.json({ ok: true, decks, shares: s.data ?? [], views: v.data ?? [] });
}

export async function POST(req: Request) {
  const access = await getAccess();
  if (access.role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ ok: false, error: "Bad upload" }, { status: 400 }); }
  const title = String(form.get("title") || "").trim().slice(0, 200);
  if (!title) return NextResponse.json({ ok: false, error: "Deck title required" }, { status: 400 });
  let html = String(form.get("html") || "");
  const file = form.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > 15 * 1024 * 1024) return NextResponse.json({ ok: false, error: "HTML over 15MB" }, { status: 400 });
    html = await file.text();
  }
  if (!html.trim()) return NextResponse.json({ ok: false, error: "Attach the deck's HTML file" }, { status: 400 });
  const sb = await createClient();
  const { data, error } = await sb.from("decks").insert({
    title, brand: String(form.get("brand") || "").trim().slice(0, 80) || null,
    html, created_by: access.user?.email ?? null,
  }).select("id,title").single();
  if (error) return NextResponse.json({ ok: false, needsSetup: missing(error.message), error: error.message.slice(0, 200) }, { status: 500 });
  // Every deck starts with a "Team" link for internal sharing
  await sb.from("deck_shares").insert({ deck_id: data.id, label: "Team" });
  return NextResponse.json({ ok: true, item: data });
}

export async function PATCH(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const sb = await createClient();
  if (b.action === "share.create") {
    const label = String(b.label || "").trim().slice(0, 120);
    if (!b.deck_id || !label) return NextResponse.json({ ok: false, error: "Label required" }, { status: 400 });
    const { data, error } = await sb.from("deck_shares").insert({ deck_id: Number(b.deck_id), label }).select().single();
    if (error) return NextResponse.json({ ok: false, error: error.message.slice(0, 150) }, { status: 500 });
    return NextResponse.json({ ok: true, share: data });
  }
  if (b.action === "share.delete") {
    const { error } = await sb.from("deck_shares").delete().eq("id", Number(b.share_id));
    return NextResponse.json({ ok: !error });
  }
  return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
}

export async function DELETE(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const sb = await createClient();
  const { error } = await sb.from("decks").delete().eq("id", id);
  return NextResponse.json({ ok: !error });
}
