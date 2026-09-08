import { NextResponse } from "next/server";
import { configured, rest, h, cors, missingTable, limited, ipOf, clean } from "@/lib/registry";

// Public, CORS-open, but every call has to carry the manage token. A share
// link forwarded around a family group is read only by design, so nobody can
// quietly empty the list from a link they were sent.
export const revalidate = 0;
const MAX_ITEMS = 120;

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: cors(req.headers.get("origin"), "POST, OPTIONS") });
}

async function ownerOf(token: string) {
  const res = await rest(`registries?manage_token=eq.${encodeURIComponent(token)}&select=id,status`);
  const text = await res.text();
  if (!res.ok) return { error: missingTable(text) ? "Run add_registries.sql first" : "Couldn't load the registry" };
  const reg = (JSON.parse(text) || [])[0];
  if (!reg || reg.status === "archived") return { error: "That registry link isn't valid" };
  return { id: reg.id as string };
}

export async function POST(req: Request) {
  const co = cors(req.headers.get("origin"), "POST, OPTIONS");
  if (!configured()) return NextResponse.json({ ok: false, error: "Registry isn't set up yet" }, { status: 500, headers: co });
  if (limited(ipOf(req), 120, 10 * 60 * 1000)) {
    return NextResponse.json({ ok: false, error: "Too many changes at once. Give it a minute." }, { status: 429, headers: co });
  }

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400, headers: co }); }

  const token = clean(b.manageToken, 200);
  if (!token) return NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403, headers: co });
  const owner = await ownerOf(token);
  if ("error" in owner) return NextResponse.json({ ok: false, error: owner.error }, { status: 403, headers: co });

  const action = clean(b.action, 20) || "add";

  if (action === "remove") {
    const id = clean(b.itemId, 60);
    if (!id) return NextResponse.json({ ok: false, error: "Which item?" }, { status: 400, headers: co });
    // Scoped to this registry as well as the id, so a guessed id from another
    // registry cannot be deleted with a valid token for this one.
    const del = await rest(`registry_items?id=eq.${encodeURIComponent(id)}&registry_id=eq.${owner.id}`, { method: "DELETE" });
    if (!del.ok) return NextResponse.json({ ok: false, error: "Couldn't remove it" }, { status: 500, headers: co });
    return NextResponse.json({ ok: true }, { headers: co });
  }

  if (action === "update") {
    const id = clean(b.itemId, 60);
    if (!id) return NextResponse.json({ ok: false, error: "Which item?" }, { status: 400, headers: co });
    const patch: Record<string, unknown> = {};
    if (b.wanted !== undefined) patch.wanted = Math.min(20, Math.max(1, parseInt(String(b.wanted), 10) || 1));
    if (b.note !== undefined) patch.note = clean(b.note, 300);
    if (b.position !== undefined) patch.position = Math.max(0, parseInt(String(b.position), 10) || 0);
    if (!Object.keys(patch).length) return NextResponse.json({ ok: false, error: "Nothing to change" }, { status: 400, headers: co });
    const up = await rest(`registry_items?id=eq.${encodeURIComponent(id)}&registry_id=eq.${owner.id}`, {
      method: "PATCH", body: JSON.stringify(patch),
    });
    if (!up.ok) return NextResponse.json({ ok: false, error: "Couldn't save that" }, { status: 500, headers: co });
    return NextResponse.json({ ok: true }, { headers: co });
  }

  /* ---- add ---- */
  const variantId = clean(b.variantId, 40);
  const handle = clean(b.handle, 200);
  const title = clean(b.title, 300);
  if (!variantId || !handle || !title) {
    return NextResponse.json({ ok: false, error: "That product couldn't be added" }, { status: 400, headers: co });
  }

  const countRes = await rest(`registry_items?registry_id=eq.${owner.id}&select=id`, { headers: { Prefer: "count=exact" } });
  const total = Number((countRes.headers.get("content-range") || "").split("/")[1] || 0);
  if (total >= MAX_ITEMS) {
    return NextResponse.json({ ok: false, error: `A registry holds up to ${MAX_ITEMS} items` }, { status: 400, headers: co });
  }

  const row = {
    registry_id: owner.id,
    variant_id: variantId,
    product_id: clean(b.productId, 40),
    handle,
    title,
    variant_title: clean(b.variantTitle, 200),
    image_url: clean(b.image, 600),
    price_cents: Number.isFinite(Number(b.priceCents)) ? Math.max(0, Math.round(Number(b.priceCents))) : null,
    wanted: Math.min(20, Math.max(1, parseInt(String(b.wanted ?? 1), 10) || 1)),
    note: clean(b.note, 300),
    position: total,
  };

  // Adding something already on the list means "I want another one", so the
  // unique constraint resolves to a merge rather than an error the parent
  // would have to interpret.
  const ins = await rest("registry_items?on_conflict=registry_id,variant_id", {
    method: "POST",
    headers: h({ Prefer: "resolution=merge-duplicates,return=representation" }),
    body: JSON.stringify(row),
  });
  const text = await ins.text();
  if (!ins.ok) {
    return NextResponse.json(
      { ok: false, error: missingTable(text) ? "Run add_registries.sql first" : "Couldn't add that" },
      { status: 500, headers: co },
    );
  }
  return NextResponse.json({ ok: true, item: JSON.parse(text)[0] }, { headers: co });
}
