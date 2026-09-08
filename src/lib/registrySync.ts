import { storeCreds, mintToken } from "@/lib/shopifyMint";
import { rest, h } from "@/lib/registry";

// Turns real Shopify orders into confirmed registry gifts.
//
// Polling, not a webhook, to match the rest of this codebase. The theme
// attaches two line item properties at add to cart, `_registry` and
// `_registry_item`, and this reads them back off the order. Every write is
// keyed on (order_id, line_item_id), so running the sync twice cannot count
// the same gift twice.

const UPPABABY_BRAND_ID = 5;
const API = "2024-01";   // matches lib/tuneupShopify.ts
export const STALE_MINUTES = 10;

type LineItem = {
  id: number | string;
  quantity: number;
  properties?: { name: string; value: string }[] | null;
};

export async function lastRunAt(): Promise<Date | null> {
  const res = await rest("registry_sync?id=eq.1&select=last_run_at");
  if (!res.ok) return null;
  const row = (await res.json().catch(() => []))?.[0];
  return row?.last_run_at ? new Date(row.last_run_at) : null;
}

export async function isStale(): Promise<boolean> {
  const last = await lastRunAt();
  if (!last) return true;
  return Date.now() - last.getTime() > STALE_MINUTES * 60 * 1000;
}

/** Scans recent orders and records any registry gifts found. Returns how many
 *  new gift lines were recorded. Safe to call concurrently: the unique
 *  constraint on the order line is what makes a double run harmless. */
export async function syncRegistryOrders(): Promise<{ ok: boolean; recorded: number; error?: string }> {
  const cred = storeCreds().find(s => s.id === UPPABABY_BRAND_ID);
  if (!cred) return { ok: false, recorded: 0, error: "UPPAbaby store not configured" };

  // Claim the run before doing any work. Two readers landing at once would
  // otherwise both decide the sync is stale and both scan the same orders.
  const claimed = new Date().toISOString();
  await rest("registry_sync?id=eq.1", {
    method: "PATCH", headers: h({ Prefer: "return=minimal" }),
    body: JSON.stringify({ last_run_at: claimed }),
  });

  const token = await mintToken(cred);
  if (!token) return { ok: false, recorded: 0, error: "Couldn't authenticate with Shopify" };

  // A window rather than everything: a gift bought more than a week ago has
  // long since been picked up by an earlier run.
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const url = `https://${cred.domain}/admin/api/${API}/orders.json?status=any&created_at_min=${since}&limit=250&fields=id,name,created_at,customer,line_items`;
  const data = await fetch(url, { headers: { "X-Shopify-Access-Token": token }, cache: "no-store" })
    .then(r => r.json()).catch(() => null);
  if (!data?.orders) return { ok: false, recorded: 0, error: "Couldn't read orders" };

  const rows: Record<string, unknown>[] = [];
  const touchedItems = new Set<string>();

  for (const order of data.orders) {
    const buyer = [order.customer?.first_name, order.customer?.last_name].filter(Boolean).join(" ") || null;
    for (const li of (order.line_items || []) as LineItem[]) {
      const props = li.properties || [];
      const reg = props.find(p => p.name === "_registry")?.value;
      const itemId = props.find(p => p.name === "_registry_item")?.value;
      if (!reg || !itemId) continue;
      rows.push({
        registry_id: null,          // filled below once the share token resolves
        registry_item_id: itemId,
        order_id: String(order.id),
        order_name: order.name || null,
        line_item_id: String(li.id),
        quantity: Math.max(1, Number(li.quantity) || 1),
        buyer_name: buyer,
        _share: reg,
      });
      touchedItems.add(itemId);
    }
  }
  if (!rows.length) return { ok: true, recorded: 0 };

  // Resolve share tokens to registry ids in one go.
  const tokens = [...new Set(rows.map(r => String(r._share)))];
  const inList = tokens.map(t => `"${t.replace(/"/g, "")}"`).join(",");
  const regRes = await rest(`registries?share_token=in.(${encodeURIComponent(inList)})&select=id,share_token`);
  const regs: { id: string; share_token: string }[] = (await regRes.json().catch(() => [])) || [];
  const byToken = new Map(regs.map(r => [r.share_token, r.id]));

  const payload = rows
    .map(r => { const { _share, ...rest2 } = r; return { ...rest2, registry_id: byToken.get(String(_share)) }; })
    .filter(r => r.registry_id);
  if (!payload.length) return { ok: true, recorded: 0 };

  // ignore-duplicates: a line already recorded on an earlier run is not an
  // error, it is the normal case on every run after the first.
  const ins = await rest("registry_purchases?on_conflict=order_id,line_item_id", {
    method: "POST",
    headers: h({ Prefer: "resolution=ignore-duplicates,return=representation" }),
    body: JSON.stringify(payload),
  });
  const inserted = ins.ok ? ((await ins.json().catch(() => [])) || []).length : 0;

  // Recompute each touched item's purchased count from its purchases, rather
  // than incrementing. Recomputing is idempotent; incrementing is not.
  for (const itemId of touchedItems) {
    const pRes = await rest(`registry_purchases?registry_item_id=eq.${encodeURIComponent(itemId)}&select=quantity`);
    const qtys: { quantity: number }[] = (await pRes.json().catch(() => [])) || [];
    const total = qtys.reduce((n, q) => n + (Number(q.quantity) || 0), 0);
    await rest(`registry_items?id=eq.${encodeURIComponent(itemId)}`, {
      method: "PATCH", headers: h({ Prefer: "return=minimal" }),
      body: JSON.stringify({ purchased: total }),
    });
    // A confirmed gift makes any outstanding hold on it redundant.
    await rest(`registry_holds?registry_item_id=eq.${encodeURIComponent(itemId)}`, { method: "DELETE" });
  }

  await rest("registry_sync?id=eq.1", {
    method: "PATCH", headers: h({ Prefer: "return=minimal" }),
    body: JSON.stringify({ last_run_at: new Date().toISOString(), last_count: inserted }),
  });

  return { ok: true, recorded: inserted };
}
