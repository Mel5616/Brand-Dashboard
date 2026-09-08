import { NextResponse } from "next/server";
import { configured, rest, h, cors, missingTable, limited, ipOf, clean } from "@/lib/registry";

// A guest has clicked through to buy a gift. Orders are synced twice a day in
// this codebase, so between the click and the sync the item would otherwise
// still read as needed and a second relative could buy the same pram.
//
// A hold is a soft claim, not a reservation: it expires on its own, and it
// never reduces what the parent asked for. If the sale does not happen the
// gift quietly becomes available again.
export const revalidate = 0;
const HOLD_MINUTES = 90;

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: cors(req.headers.get("origin"), "POST, OPTIONS") });
}

export async function POST(req: Request) {
  const co = cors(req.headers.get("origin"), "POST, OPTIONS");
  if (!configured()) return NextResponse.json({ ok: false, error: "Registry isn't set up yet" }, { status: 500, headers: co });
  if (limited(ipOf(req), 40, 10 * 60 * 1000)) {
    return NextResponse.json({ ok: true, held: false }, { headers: co });
  }

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400, headers: co }); }

  const shareTok = clean(b.shareToken, 200);
  const itemId = clean(b.itemId, 60);
  if (!shareTok || !itemId) return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400, headers: co });

  const regRes = await rest(`registries?share_token=eq.${encodeURIComponent(shareTok)}&select=id`);
  const regText = await regRes.text();
  if (!regRes.ok) {
    return NextResponse.json(
      { ok: false, error: missingTable(regText) ? "Run add_registries.sql first" : "Couldn't load the registry" },
      { status: 500, headers: co },
    );
  }
  const reg = (JSON.parse(regText) || [])[0];
  if (!reg) return NextResponse.json({ ok: false, error: "That registry link isn't valid" }, { status: 404, headers: co });

  // The item has to belong to the registry in the link. Without this check a
  // valid share token could be used to put holds on somebody else's list.
  const itemRes = await rest(`registry_items?id=eq.${encodeURIComponent(itemId)}&registry_id=eq.${reg.id}&select=id`);
  if (!((await itemRes.json().catch(() => [])) || []).length) {
    return NextResponse.json({ ok: false, error: "That gift isn't on this registry" }, { status: 404, headers: co });
  }

  const qty = Math.min(10, Math.max(1, parseInt(String(b.quantity ?? 1), 10) || 1));
  const expires = new Date(Date.now() + HOLD_MINUTES * 60 * 1000).toISOString();

  const ins = await rest("registry_holds", {
    method: "POST",
    headers: h({ Prefer: "return=representation" }),
    body: JSON.stringify({ registry_item_id: itemId, quantity: qty, expires_at: expires }),
  });
  if (!ins.ok) return NextResponse.json({ ok: true, held: false }, { headers: co });

  const holdId = (await ins.json().catch(() => []))?.[0]?.id ?? null;
  return NextResponse.json({ ok: true, held: true, holdId, expiresAt: expires }, { headers: co });
}
