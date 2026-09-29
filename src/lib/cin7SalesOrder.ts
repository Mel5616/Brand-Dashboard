import { cin7Fetch, cin7Configured } from "./cin7";

// Creates a Cin7 Quote — genuinely uncommitted, unlike a SalesOrder (which
// starts Cin7's real fulfilment pipeline New -> Picking -> Packing ->
// Dispatched). A Quote sits on its own until someone in Cin7 deliberately
// converts it to a SalesOrder, which is the right "reviewed handoff" shape
// for a gifted/influencer product line — Mel asked for exactly this
// ("can we save as a draft in cin?") after three straight SalesOrder
// attempts (with a fully populated address/branch/email/currency body,
// confirmed against ~20 real orders on the same endpoint) all came back
// with the same content-free 500 from Cin7's side.
//
// Always billed to the fixed "Coolkidz Marketing 26/27" account (Cin7
// contact id 67298, confirmed with Mel directly) — real recipient details
// go in the delivery fields and deliveryInstructions/customerOrderNo, not
// the billing contact.
//
// The real delivery address is passed as free text inside
// deliveryInstructions, not Cin7's structured delivery1/city/state/postcode
// fields — the source data (site_deals.ship_to_address /
// giveaways.ship_to_address) is one free-text blob, and parsing that into
// structured fields reliably isn't safe to guess. Whoever converts the
// Quote in Cin7 reads it from there and enters/verifies the structured
// address themselves.
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

type Result = { ok: true; id: number; reference: string } | { ok: false; error: string };

export async function createCin7SalesOrder(opts: {
  lineItems: Cin7LineItem[]; recipientName: string; recipientEmail?: string | null; recipientPhone?: string | null; shipToText: string; customerOrderNo: string;
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
    deliveryFirstName: firstName || "Recipient",
    deliveryLastName: lastName,
    deliveryAddress1: CIN7_PLACEHOLDER_ADDRESS.address1,
    deliveryCity: CIN7_PLACEHOLDER_ADDRESS.city,
    deliveryState: CIN7_PLACEHOLDER_ADDRESS.state,
    deliveryPostalCode: CIN7_PLACEHOLDER_ADDRESS.postalCode,
    deliveryCountry: CIN7_PLACEHOLDER_ADDRESS.country,
    billingFirstName: firstName || "Recipient",
    billingLastName: lastName,
    billingAddress1: CIN7_PLACEHOLDER_ADDRESS.address1,
    billingCity: CIN7_PLACEHOLDER_ADDRESS.city,
    billingState: CIN7_PLACEHOLDER_ADDRESS.state,
    billingPostalCode: CIN7_PLACEHOLDER_ADDRESS.postalCode,
    billingCountry: CIN7_PLACEHOLDER_ADDRESS.country,
    customerOrderNo: opts.customerOrderNo.slice(0, 100),
    deliveryInstructions: `${opts.shipToText}\n\nSHIPPING ADDRESS NOT VERIFIED — enter/confirm the real delivery address before dispatching.`.slice(0, 2000),
    internalComments: `${giftNote}. ${opts.customerOrderNo}`.slice(0, 500),
    // Quote-only fields (SalesOrders don't have these) — a real Quote read
    // back from Cin7 always carries them, so the create endpoint may
    // require them explicitly even though they show as optional on read.
    probability: 100,
    expectedOrderDate: new Date(Date.now() + 7 * 86400000).toISOString(),
    lineItems: opts.lineItems.map(li => {
      const qty = Math.max(1, Math.floor(li.quantity) || 1);
      const unitPrice = li.retail_price ?? 0;
      return {
        productId: li.product_id, productOptionId: li.product_option_id, qty,
        unitPrice, discount: Number((unitPrice * qty).toFixed(2)), lineComments: giftNote,
      };
    }),
  };

  // Cin7's own API docs (POST api/v1/Quotes: "Create a list of Quotes") say
  // this endpoint takes an ARRAY, and responds with an array of
  // {index, success, id, code, errors} batch results — not a single Quote
  // object either way round. A bare object body was the real cause of the
  // "Missing or malformed JSON data" error every attempt hit.
  const res = await cin7Fetch("/v1/Quotes", { method: "POST", body: JSON.stringify([body]) });
  if (!res) return { ok: false, error: "Cin7 isn't configured" };
  const text = await res.text();
  if (!res.ok) {
    console.error(`[cin7SalesOrder] POST /v1/Quotes failed, status=${res.status}, body=${text.slice(0, 500)}, requestBody=${JSON.stringify([body]).slice(0, 500)}`);
    return { ok: false, error: text.slice(0, 300) || `Cin7 request failed (${res.status})` };
  }
  const json = JSON.parse(text || "[]");
  const result = Array.isArray(json) ? json[0] : json;
  if (!result?.success || !result?.id) {
    const errText = Array.isArray(result?.errors) ? result.errors.join("; ") : "";
    console.error(`[cin7SalesOrder] POST /v1/Quotes batch item failed: ${JSON.stringify(result).slice(0, 500)}`);
    return { ok: false, error: errText || "Cin7 didn't confirm the Quote was created" };
  }
  // The batch result only carries id/code, not the human-readable reference
  // — fetch it so the dashboard shows the same reference Cin7's own UI does.
  let reference = String(result.id);
  const getRes = await cin7Fetch(`/v1/Quotes/${result.id}`);
  if (getRes?.ok) {
    const quote = await getRes.json().catch(() => null);
    if (quote?.reference) reference = quote.reference;
  }
  return { ok: true, id: result.id, reference };
}
