import { cin7Fetch, cin7Configured } from "./cin7";

// Creates a Cin7 SalesOrder at stage "New" — the start of Cin7's own
// fulfilment pipeline (New -> Picking -> Packing -> Dispatched). Nothing
// ships until someone in Cin7 advances it past "New", same "reviewed
// handoff" principle as the Shopify draft-order push (shopifyDraftOrder.ts).
//
// Went SalesOrders -> Quotes -> back to SalesOrders: the real bug the whole
// time was that Cin7's own API docs (POST api/v1/SalesOrders /
// api/v1/Quotes: "Create a list of ...") expect the request body wrapped in
// an ARRAY, which nothing here was doing — that's what "Missing or
// malformed JSON data" / the earlier content-free 500s actually meant.
// SalesOrders' Create permission was confirmed enabled from the very start
// (unlike Quotes, whose permission kept reverting/not saving cleanly), so
// this is now the more reliable endpoint of the two.
//
// Always billed to the fixed "Coolkidz Marketing 26/27" account (Cin7
// contact id 67298, confirmed with Mel directly) — real recipient details
// go in the delivery fields and deliveryInstructions/customerOrderNo, not
// the billing contact.
//
// The delivery address goes into Cin7's structured delivery1/city/
// state/postcode fields whenever the caller has genuine structured address
// data (deliveryAddress opt) — Influencer Agreements' contact record does.
// Callers without structured data (Giveaways/Product Requests — their
// source is one free-text ship_to_address blob) fall back to the fixed
// Coolkidz placeholder address for the structured fields, with the real
// address only in deliveryInstructions free text; parsing a free-text blob
// into structured fields isn't safe to guess. Either way the free-text
// deliveryInstructions also always carries the real address as a backup.
//
// Line items carry the real retail unitPrice with a 100% discount (net $0)
// — Mel's own instruction, matching how gifted stock is entered manually
// elsewhere in Cin7: the product/quantity still shows for stock-accounting
// purposes, but nothing is actually charged. lineComments and
// internalComments both spell out why.
const CIN7_MEMBER_ID = 67298;
const CIN7_COMPANY = "Coolkidz Marketing 26/27";
const CIN7_BRANCH_ID = 3;
const CIN7_PLACEHOLDER_ADDRESS = { address1: "1 Beyer Road", city: "Braeside", state: "Victoria", postalCode: "3195", country: "Australia" };

export type Cin7LineItem = { product_id: number; product_option_id: number; code: string; name: string; quantity: number; retail_price?: number | null };
export type Cin7DeliveryAddress = { address1: string; address2?: string | null; city: string; state: string; postcode: string; country?: string; isPoBox?: boolean };

type Result = { ok: true; id: number; reference: string } | { ok: false; error: string };

export async function createCin7SalesOrder(opts: {
  lineItems: Cin7LineItem[]; recipientName: string; recipientEmail?: string | null; recipientPhone?: string | null;
  deliveryAddress?: Cin7DeliveryAddress | null; shipToText: string; customerOrderNo: string;
}): Promise<Result> {
  if (!cin7Configured()) return { ok: false, error: "Cin7 isn't configured (CIN7_USERNAME/CIN7_API_KEY)" };
  if (!opts.lineItems.length) return { ok: false, error: "No products selected — search and add at least one before pushing." };

  const [firstName, ...rest] = (opts.recipientName || "Recipient").trim().split(/\s+/);
  const lastName = rest.join(" ") || "";
  const giftNote = "Gifted product — 100% discount, no charge";
  const body = {
    memberId: CIN7_MEMBER_ID,
    company: CIN7_COMPANY,
    branchId: CIN7_BRANCH_ID,
    firstName: firstName || "Recipient",
    lastName,
    email: opts.recipientEmail || "orders@coolkidz.com.au",
    phone: opts.recipientPhone || undefined,
    currencyCode: "AUD",
    taxStatus: "Incl",
    taxRate: 10, // AU GST — required by Cin7 whenever taxStatus is set explicitly
    deliveryFirstName: firstName || "Recipient",
    deliveryLastName: lastName,
    deliveryAddress1: opts.deliveryAddress?.address1 || CIN7_PLACEHOLDER_ADDRESS.address1,
    deliveryAddress2: opts.deliveryAddress?.address2 || undefined,
    deliveryCity: opts.deliveryAddress?.city || CIN7_PLACEHOLDER_ADDRESS.city,
    deliveryState: opts.deliveryAddress?.state || CIN7_PLACEHOLDER_ADDRESS.state,
    deliveryPostalCode: opts.deliveryAddress?.postcode || CIN7_PLACEHOLDER_ADDRESS.postalCode,
    deliveryCountry: opts.deliveryAddress?.country || CIN7_PLACEHOLDER_ADDRESS.country,
    billingFirstName: firstName || "Recipient",
    billingLastName: lastName,
    billingAddress1: CIN7_PLACEHOLDER_ADDRESS.address1,
    billingCity: CIN7_PLACEHOLDER_ADDRESS.city,
    billingState: CIN7_PLACEHOLDER_ADDRESS.state,
    billingPostalCode: CIN7_PLACEHOLDER_ADDRESS.postalCode,
    billingCountry: CIN7_PLACEHOLDER_ADDRESS.country,
    customerOrderNo: opts.customerOrderNo.slice(0, 100),
    // When we've filled a real structured delivery address, don't also
    // repeat it here — it's already on the order. Only add a short PO Box
    // flag (not represented in any structured field) and, when we had no
    // structured address to work with, the full fallback free-text address.
    deliveryInstructions: [
      opts.shipToText,
      opts.deliveryAddress
        ? (opts.deliveryAddress.isPoBox ? "⚠ PO BOX on file — cannot ship courier." : null)
        : "SHIPPING ADDRESS NOT VERIFIED — enter/confirm the real delivery address before dispatching.",
    ].filter(Boolean).join("\n\n").slice(0, 2000),
    internalComments: `${giftNote}. ${opts.customerOrderNo}`.slice(0, 500),
    stage: "New",
    // ProductId is read-only per Cin7's docs — ProductOptionId or Code is
    // what actually links the product. Sending both since ProductOptionId
    // alone silently failed to attach (stored as 0) on the first real push.
    lineItems: opts.lineItems.map(li => {
      const qty = Math.max(1, Math.floor(li.quantity) || 1);
      const unitPrice = li.retail_price ?? 0;
      return {
        productOptionId: li.product_option_id, code: li.code, qty,
        unitPrice, discount: Number((unitPrice * qty).toFixed(2)), lineComments: giftNote,
      };
    }),
  };

  // Cin7's own API docs (POST api/v1/SalesOrders: "Create a list of Sales
  // Orders") say this endpoint takes an ARRAY, and responds with an array
  // of {index, success, id, code, errors} batch results — not a single
  // order object either way round.
  const res = await cin7Fetch("/v1/SalesOrders", { method: "POST", body: JSON.stringify([body]) });
  if (!res) return { ok: false, error: "Cin7 isn't configured" };
  const text = await res.text();
  if (!res.ok) {
    console.error(`[cin7SalesOrder] POST /v1/SalesOrders failed, status=${res.status}, body=${text.slice(0, 500)}, requestBody=${JSON.stringify([body]).slice(0, 500)}`);
    return { ok: false, error: text.slice(0, 300) || `Cin7 request failed (${res.status})` };
  }
  const json = JSON.parse(text || "[]");
  const result = Array.isArray(json) ? json[0] : json;
  if (!result?.success || !result?.id) {
    const errText = Array.isArray(result?.errors) ? result.errors.join("; ") : "";
    console.error(`[cin7SalesOrder] POST /v1/SalesOrders batch item failed: ${JSON.stringify(result).slice(0, 500)}`);
    return { ok: false, error: errText || "Cin7 didn't confirm the order was created" };
  }
  // The batch result only carries id/code, not the human-readable reference
  // — fetch it so the dashboard shows the same reference Cin7's own UI does.
  let reference = String(result.id);
  const getRes = await cin7Fetch(`/v1/SalesOrders/${result.id}`);
  if (getRes?.ok) {
    const order = await getRes.json().catch(() => null);
    if (order?.reference) reference = order.reference;
  }
  return { ok: true, id: result.id, reference };
}
