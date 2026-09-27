import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { STORES, type StoreKey } from "@/lib/registry";
import { isStale, syncRegistryOrders } from "@/lib/registrySync";

// Websites > Baby Registry. A read-only view of the registries created on
// uppababy.com.au and coolkidz.com.au (the storefront writes them through /api/registry/*), so Mel
// can see whether the thing is getting used without querying Supabase by hand.
// Owner emails are shown because the team needs to be able to help a parent who
// has lost their manage link.
export const revalidate = 0;
export const maxDuration = 60;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = () => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json" });
const missing = (s: number, b: string) => s === 404 || /PGRST205|does not exist|schema cache/i.test(b);

type Item = { registry_id: string; wanted: number; purchased: number; price_cents: number | null; title: string; handle: string };
type Purchase = { registry_id: string; quantity: number; created_at: string; order_name: string | null };

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
  // Pick up any gifts bought since the last look, on both stores (skipped when synced in the last few minutes).
  await Promise.all((["uppababy", "coolkidz"] as StoreKey[]).map(async s => {
    try { if (await isStale(s)) await syncRegistryOrders(s); } catch { /* a failed sync must never break the view */ }
  }));

  const [regRes, itemRes, buyRes] = await Promise.all([
    fetch(`${sbUrl}/rest/v1/registries?select=*&order=created_at.desc&limit=500`, { headers: h(), cache: "no-store" }),
    fetch(`${sbUrl}/rest/v1/registry_items?select=registry_id,wanted,purchased,price_cents,title,handle&limit=5000`, { headers: h(), cache: "no-store" }),
    fetch(`${sbUrl}/rest/v1/registry_purchases?select=registry_id,quantity,created_at,order_name&limit=5000`, { headers: h(), cache: "no-store" }),
  ]);

  const regText = await regRes.text();
  if (!regRes.ok) return NextResponse.json({ ok: true, needsSetup: missing(regRes.status, regText), rows: [] });

  const registries = JSON.parse(regText || "[]");
  const items: Item[] = itemRes.ok ? await itemRes.json().catch(() => []) : [];
  const purchases: Purchase[] = buyRes.ok ? await buyRes.json().catch(() => []) : [];

  const byReg = new Map<string, Item[]>();
  for (const i of items) { const a = byReg.get(i.registry_id) || []; a.push(i); byReg.set(i.registry_id, a); }
  const buysByReg = new Map<string, Purchase[]>();
  for (const p of purchases) { const a = buysByReg.get(p.registry_id) || []; a.push(p); buysByReg.set(p.registry_id, a); }

  // A registry nobody has added anything to is a signal in itself: they found
  // the page, made a list and stopped. Kept visible rather than filtered out.
  const rows = registries.map((r: Record<string, unknown>) => {
    const mine = byReg.get(r.id as string) || [];
    const buys = buysByReg.get(r.id as string) || [];
    const wanted = mine.reduce((s, i) => s + (i.wanted || 0), 0);
    const bought = mine.reduce((s, i) => s + (i.purchased || 0), 0);
    const listValue = mine.reduce((s, i) => s + (i.price_cents || 0) * (i.wanted || 0), 0) / 100;
    const boughtValue = mine.reduce((s, i) => s + (i.price_cents || 0) * (i.purchased || 0), 0) / 100;
    return {
      id: r.id, ownerName: r.owner_name, partnerName: r.partner_name, ownerEmail: r.owner_email,
      dueDate: r.due_date, status: r.status, createdAt: r.created_at,
      store: (r.store as string) || "uppababy",
      shareUrl: `${STORES[((r.store as StoreKey) || "uppababy")]?.site ?? STORES.uppababy.site}${STORES[((r.store as StoreKey) || "uppababy")]?.page ?? STORES.uppababy.page}?r=${r.share_token}`,
      items: mine.length, wanted, bought, listValue, boughtValue,
      topItem: mine.slice().sort((a, b) => (b.price_cents || 0) - (a.price_cents || 0))[0]?.title ?? null,
      lastPurchase: buys.map(b => b.created_at).sort().at(-1) ?? null,
      orders: [...new Set(buys.map(b => b.order_name).filter(Boolean))],
    };
  });

  return NextResponse.json({ ok: true, rows });
}
