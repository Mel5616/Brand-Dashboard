import { NextResponse, after } from "next/server";
import { configured, rest, cors, missingTable, publicItem, type ItemRow } from "@/lib/registry";
import { isStale, syncRegistryOrders } from "@/lib/registrySync";

// Public, CORS-open. One token in, one registry out.
//
// The same URL serves the family and the parent, told apart by which token was
// used. A share token returns the list and nothing about the household: no
// email, no address, and no record of who bought what, because the whole point
// of a registry is that the gift is still a surprise. A manage token returns
// everything and marks the response as owned, which is what unlocks editing in
// the theme.
export const revalidate = 0;

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: cors(req.headers.get("origin"), "GET, OPTIONS") });
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const co = cors(req.headers.get("origin"), "GET, OPTIONS");
  if (!configured()) return NextResponse.json({ ok: false, error: "Registry isn't set up yet" }, { status: 500, headers: co });

  const { token } = await params;
  if (!token || token.length > 200) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404, headers: co });
  const t = encodeURIComponent(token);

  const res = await rest(`registries?or=(share_token.eq.${t},manage_token.eq.${t})&select=*`);
  const text = await res.text();
  if (!res.ok) {
    return NextResponse.json(
      { ok: false, error: missingTable(text) ? "Run add_registries.sql first" : "Couldn't load the registry" },
      { status: 500, headers: co },
    );
  }
  const reg = (JSON.parse(text) || [])[0];
  if (!reg || reg.status === "archived") {
    return NextResponse.json({ ok: false, error: "That registry link isn't valid" }, { status: 404, headers: co });
  }
  const owned = token === reg.manage_token;

  const itemsRes = await rest(`registry_items?registry_id=eq.${reg.id}&select=*&order=position.asc,created_at.asc`);
  const items: ItemRow[] = (await itemsRes.json().catch(() => [])) || [];

  // Holds expire on their own. Reading them with a time filter means a stale
  // hold never has to be cleaned up by a job to stop blocking a gift.
  const nowIso = new Date().toISOString();
  const holdsRes = await rest(`registry_holds?expires_at=gt.${encodeURIComponent(nowIso)}&select=registry_item_id,quantity`);
  const holdRows: { registry_item_id: string; quantity: number }[] = (await holdsRes.json().catch(() => [])) || [];
  const heldBy = new Map<string, number>();
  for (const hrow of holdRows) heldBy.set(hrow.registry_item_id, (heldBy.get(hrow.registry_item_id) || 0) + (hrow.quantity || 0));

  // A registry is looked at most in the hours a gift is actually being bought,
  // so a view is the best trigger there is for confirming orders. It runs after
  // the response, and only when the last run has gone stale, so the reader
  // waits for nothing and a busy list does not scan orders on every refresh.
  after(async () => {
    try { if (await isStale()) await syncRegistryOrders(); } catch { /* a failed sync must never break a view */ }
  });

  const shaped = items.map(i => publicItem(i, heldBy.get(i.id) || 0));
  const wanted = shaped.reduce((n, i) => n + i.wanted, 0);
  const purchased = shaped.reduce((n, i) => n + Math.min(i.purchased, i.wanted), 0);

  return NextResponse.json({
    ok: true,
    owned,
    registry: {
      shareToken: reg.share_token,
      ownerName: reg.owner_name,
      partnerName: reg.partner_name,
      dueDate: reg.due_date,
      greeting: reg.greeting,
      shipSuburb: reg.ship_suburb,
      shipState: reg.ship_state,
      ...(owned ? { ownerEmail: reg.owner_email, manageToken: reg.manage_token } : {}),
    },
    progress: { wanted, purchased },
    items: shaped,
  }, { headers: co });
}
