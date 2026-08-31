import { mintToken, type StoreCred } from "@/lib/shopifyMint";

// Tune-Up Day bookings run through a single, permanent $20 Shopify product
// (created once, manually, in Shopify admin — see TUNEUP_VARIANT_ID) rather
// than one product per event. The specific day + our booking row id ride
// through checkout as cart-level "attributes", which Shopify stores as
// note_attributes on the resulting order — that's what syncOrders() reads
// back to match a paid order to the pending_payment row that created it.
const API = "2024-01";

export function cartPermalink(domain: string, variantId: string, bookingId: string, dayLabel: string): string {
  const params = new URLSearchParams({
    "attributes[Booking ID]": bookingId,
    "attributes[Tune-Up Day]": dayLabel,
  });
  return `https://${domain}/cart/${variantId}:1?${params.toString()}`;
}

async function shopGet(domain: string, token: string, path: string): Promise<any> {
  const res = await fetch(`https://${domain}/admin/api/${API}/${path}`, { headers: { "X-Shopify-Access-Token": token }, cache: "no-store" });
  return res.json();
}

// Scans recent orders for ones containing the Tune-Up product, extracts the
// "Booking ID" note attribute from each. Polling, not a webhook — matches
// this codebase's existing sync style (nothing here uses webhooks).
export async function syncTuneupOrders(cred: StoreCred, variantId: string, sinceIso: string): Promise<{ bookingId: string; orderId: string; orderNumber: string; email: string; createdAt: string }[]> {
  const token = await mintToken(cred);
  if (!token) throw new Error("Couldn't authenticate with Shopify");
  const out: { bookingId: string; orderId: string; orderNumber: string; email: string; createdAt: string }[] = [];
  const url = `orders.json?status=any&created_at_min=${sinceIso}&limit=250`;
  // orders.json doesn't expose a Link header the same way checkouts.json does
  // in this codebase's other routes — one page (250) covers this low-volume
  // use case, so no pagination loop.
  const data = await shopGet(cred.domain, token, url);
  const orders = data.orders || [];
  for (const o of orders) {
    const hasVariant = (o.line_items || []).some((li: { variant_id: number | string }) => String(li.variant_id) === String(variantId));
    if (!hasVariant) continue;
    const bookingId = (o.note_attributes || []).find((a: { name: string; value: string }) => a.name === "Booking ID")?.value;
    if (!bookingId) continue;
    out.push({ bookingId, orderId: String(o.id), orderNumber: o.name, email: o.email || o.customer?.email || "", createdAt: o.created_at });
  }
  return out;
}

// Full refund of the original sale transaction, no restock (it's a booking
// fee, not real inventory movement worth reversing).
export async function refundTuneupOrder(cred: StoreCred, orderId: string, amount: number): Promise<void> {
  const token = await mintToken(cred);
  if (!token) throw new Error("Couldn't authenticate with Shopify");
  const txns = await shopGet(cred.domain, token, `orders/${orderId}/transactions.json`);
  const sale = (txns.transactions || []).find((t: any) => (t.kind === "sale" || t.kind === "capture") && t.status === "success");
  if (!sale) throw new Error("No successful sale transaction found on this order");

  const mutation = `mutation refundCreate($input: RefundInput!) {
    refundCreate(input: $input) { refund { id } userErrors { field message } }
  }`;
  const variables = {
    input: {
      orderId: `gid://shopify/Order/${orderId}`,
      notify: true,
      note: "Tune-Up Day booking fee — refunded after check-in",
      transactions: [{ orderId: `gid://shopify/Order/${orderId}`, kind: "REFUND", gateway: sale.gateway, parentId: `gid://shopify/OrderTransaction/${sale.id}`, amount: amount.toFixed(2) }],
    },
  };
  const res = await fetch(`https://${cred.domain}/admin/api/${API}/graphql.json`, {
    method: "POST", headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query: mutation, variables }), cache: "no-store",
  }).then(r => r.json());
  const errs = res?.data?.refundCreate?.userErrors ?? [];
  if (errs.length || !res?.data?.refundCreate?.refund) throw new Error(errs[0]?.message || res?.errors?.[0]?.message || "Refund failed");
}
