import { cin7Fetch, cin7Configured } from "./cin7";

// Creates a Cin7 SalesOrder at stage "New" — the start of Cin7's own
// pipeline (New -> Picking -> Packing -> Dispatched). Nothing is picked or
// shipped until someone in Cin7 advances it, same "reviewed handoff"
// principle as the Shopify draft-order push (shopifyDraftOrder.ts).
//
// Always billed to the fixed "Coolkidz Marketing 26/27" account (Cin7
// contact id 67298, confirmed with Mel directly) — real recipient details
// go in the delivery fields and deliveryInstructions/customerOrderNo, not
// the billing contact.
//
// Delivery address is passed as free text inside deliveryInstructions, not
// Cin7's structured delivery1/city/state/postcode fields — the source data
// (site_deals.ship_to_address / giveaways.ship_to_address) is one free-text
// blob, and parsing that into structured fields reliably isn't safe to
// guess. Whoever advances the order past "New" in Cin7 reads it from there
// and enters/verifies the structured address themselves.
const CIN7_MEMBER_ID = 67298;
const CIN7_COMPANY = "Coolkidz Marketing 26/27";

export type Cin7LineItem = { product_id: number; product_option_id: number; code: string; name: string; quantity: number };

type Result = { ok: true; id: number; reference: string } | { ok: false; error: string };

export async function createCin7SalesOrder(opts: {
  lineItems: Cin7LineItem[]; recipientName: string; shipToText: string; customerOrderNo: string;
}): Promise<Result> {
  if (!cin7Configured()) return { ok: false, error: "Cin7 isn't configured (CIN7_USERNAME/CIN7_API_KEY)" };
  if (!opts.lineItems.length) return { ok: false, error: "No products selected — search and add at least one before pushing." };

  const [firstName, ...rest] = (opts.recipientName || "Recipient").trim().split(/\s+/);
  const body = {
    memberId: CIN7_MEMBER_ID,
    company: CIN7_COMPANY,
    firstName: firstName || "Recipient",
    lastName: rest.join(" ") || "",
    deliveryFirstName: firstName || "Recipient",
    deliveryLastName: rest.join(" ") || "",
    customerOrderNo: opts.customerOrderNo.slice(0, 100),
    deliveryInstructions: `${opts.shipToText}\n\nSHIPPING ADDRESS NOT VERIFIED — enter/confirm the real delivery address before dispatching.`.slice(0, 2000),
    stage: "New",
    lineItems: opts.lineItems.map(li => ({ productId: li.product_id, productOptionId: li.product_option_id, qty: Math.max(1, Math.floor(li.quantity) || 1) })),
  };

  const res = await cin7Fetch("/v1/SalesOrders", { method: "POST", body: JSON.stringify(body) });
  if (!res) return { ok: false, error: "Cin7 isn't configured" };
  const text = await res.text();
  if (!res.ok) {
    console.error(`[cin7SalesOrder] POST /v1/SalesOrders failed, status=${res.status}, body=${text.slice(0, 500)}, requestBody=${JSON.stringify(body).slice(0, 500)}`);
    return { ok: false, error: text.slice(0, 300) || `Cin7 request failed (${res.status})` };
  }
  const json = JSON.parse(text || "{}");
  const order = Array.isArray(json) ? json[0] : json;
  if (!order?.id) return { ok: false, error: "Cin7 returned no order id" };
  return { ok: true, id: order.id, reference: order.reference || String(order.id) };
}
