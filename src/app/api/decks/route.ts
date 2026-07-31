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
    sb.from("decks").select("id,title,brand,created_by,created_at").order("created_at", { ascending: false }),
    sb.from("deck_shares").select("*").order("created_at", { ascending: true }),
    sb.from("deck_views").select("share_id,session_id,viewer,seconds,opened_at,last_seen"),
  ]);
  if (d.error) return NextResponse.json({ ok: true, needsSetup: missing(d.error.message), decks: [], shares: [], views: [] });
  // Companion PDFs (deck-assets/deck-<id>.pdf) — surfaced as a download on the card
  const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const decks = await Promise.all((d.data ?? []).map(async (r: any) => {
    const pdfUrl = `${sbUrl}/storage/v1/object/public/deck-assets/deck-${r.id}.pdf`;
    const head = await fetch(pdfUrl, { method: "HEAD", cache: "no-store" }).catch(() => null);
    const v = head?.headers.get("etag")?.replace(/[^a-f0-9]/gi, "").slice(0, 12) ?? "";
    return { ...r, pdfUrl: head?.ok ? `${pdfUrl}?v=${v}` : null };
  }));
  return NextResponse.json({ ok: true, decks, shares: s.data ?? [], views: v.data ?? [] });
}

const UPLOAD_BUCKET = "deck-uploads";

export async function POST(req: Request) {
  const access = await getAccess();
  if (access.role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ ok: false, error: "Bad upload" }, { status: 400 }); }
  const action = String(form.get("action") || "");

  // Chunked upload for big decks (Vercel caps request bodies ~4.5MB):
  // the client slices the file into ~3MB parts, then "finish" reassembles.
  if (action === "part") {
    const sb = await createClient();
    await sb.storage.createBucket(UPLOAD_BUCKET, { public: false }).catch(() => {});
    const uploadId = String(form.get("upload_id") || "").replace(/[^a-z0-9-]/gi, "").slice(0, 64);
    const seq = Number(form.get("seq"));
    const part = form.get("part");
    if (!uploadId || !(part instanceof File) || isNaN(seq)) return NextResponse.json({ ok: false, error: "Bad part" }, { status: 400 });
    const { error } = await sb.storage.from(UPLOAD_BUCKET).upload(`${uploadId}/${seq}`, part, { contentType: "text/plain", upsert: true });
    if (error) return NextResponse.json({ ok: false, error: error.message.slice(0, 150) }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (action === "finish") {
    const sb = await createClient();
    const uploadId = String(form.get("upload_id") || "").replace(/[^a-z0-9-]/gi, "").slice(0, 64);
    const parts = Number(form.get("parts"));
    const title2 = String(form.get("title") || "").trim().slice(0, 200);
    if (!uploadId || !parts || parts > 40 || !title2) return NextResponse.json({ ok: false, error: "Bad finish" }, { status: 400 });
    let html = "";
    for (let i = 0; i < parts; i++) {
      const { data, error } = await sb.storage.from(UPLOAD_BUCKET).download(`${uploadId}/${i}`);
      if (error || !data) return NextResponse.json({ ok: false, error: `Missing part ${i + 1}` }, { status: 500 });
      html += await data.text();
    }
    await sb.storage.from(UPLOAD_BUCKET).remove(Array.from({ length: parts }, (_, i) => `${uploadId}/${i}`)).catch(() => {});
    const { data, error } = await sb.from("decks").insert({
      title: title2, brand: String(form.get("brand") || "").trim().slice(0, 80) || null,
      html, created_by: access.user?.email ?? null,
    }).select("id,title").single();
    if (error) return NextResponse.json({ ok: false, error: error.message.slice(0, 200) }, { status: 500 });
    await sb.from("deck_shares").insert({ deck_id: data.id, label: "Team" });
    return NextResponse.json({ ok: true, item: data });
  }

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
  if (b.action === "share.pdf") {
    const { error } = await sb.from("deck_shares").update({ allow_pdf: !!b.allow_pdf }).eq("id", Number(b.share_id));
    if (error) return NextResponse.json({ ok: false, error: /allow_pdf/.test(error.message) ? "Run add_deck_shares_pdf.sql first" : error.message.slice(0, 150) }, { status: 500 });
    return NextResponse.json({ ok: true });
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
