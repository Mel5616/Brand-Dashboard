import { NextResponse } from "next/server";
import { configured, rest, cors, limited, ipOf, clean, storeOf } from "@/lib/registry";

// Public, CORS-open. "Find a registry" on coolkidz.com.au.
//
// Only lists whose parents ticked "let guests find my registry by name" are
// searchable, and a result carries just enough to pick the right family: first
// names, the initial of the surname, the due month and the share token. Never
// an email, a suburb or anything that was bought.
export const revalidate = 0;

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: cors(req.headers.get("origin"), "GET, OPTIONS") });
}

const safe = (q: string) => q.replace(/[^\p{L}\p{N}' -]/gu, "").trim();

function shortName(full: string | null) {
  if (!full) return null;
  const parts = full.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
}

export async function GET(req: Request) {
  const co = cors(req.headers.get("origin"), "GET, OPTIONS");
  if (!configured()) return NextResponse.json({ ok: false, error: "Registry isn't set up yet" }, { status: 500, headers: co });
  if (limited(ipOf(req), 60, 10 * 60 * 1000)) {
    return NextResponse.json({ ok: false, error: "Too many searches. Give it a minute." }, { status: 429, headers: co });
  }

  const url = new URL(req.url);
  const store = storeOf(req, url.searchParams.get("store"));
  const q = safe(clean(url.searchParams.get("q"), 60) || "");
  if (q.length < 2) return NextResponse.json({ ok: true, results: [] }, { headers: co });

  const like = encodeURIComponent(`*${q}*`);
  const res = await rest(
    `registries?store=eq.${store}&listed=eq.true&status=eq.active` +
    `&or=(owner_name.ilike.${like},partner_name.ilike.${like})` +
    `&select=owner_name,partner_name,due_date,share_token&order=created_at.desc&limit=10`,
  );
  if (!res.ok) return NextResponse.json({ ok: false, error: "Search isn't available right now" }, { status: 500, headers: co });
  const rows: { owner_name: string; partner_name: string | null; due_date: string | null; share_token: string }[] =
    (await res.json().catch(() => [])) || [];

  return NextResponse.json({
    ok: true,
    results: rows.map(r => ({
      names: [shortName(r.owner_name), shortName(r.partner_name)].filter(Boolean).join(" & "),
      dueMonth: r.due_date ? r.due_date.slice(0, 7) : null,
      shareToken: r.share_token,
    })),
  }, { headers: co });
}
