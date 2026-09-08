import { mintToken, storeCreds } from "@/lib/shopifyMint";

// Real on/off for a live Shopify discount code — looks it up live via
// codeDiscountNodeByCode (works whether the code was created via the legacy
// Price Rules REST API or the newer Discounts GraphQL API, since Shopify
// unifies both under CodeDiscountNode), then calls
// discountCodeActivate/Deactivate. Reversible — flips Shopify's own status,
// doesn't touch dates or delete anything. Shared by /api/discount-codes/toggle
// and /api/site-promotions (which also has to hit real Shopify state when a
// tracked promotion has a code attached).
export async function toggleShopifyDiscountCode(brandId: number, code: string, action: "activate" | "deactivate"): Promise<{ ok: boolean; error?: string }> {
  const store = storeCreds().find(s => s.id === brandId);
  if (!store) return { ok: false, error: "No Shopify credentials for this brand" };
  const token = await mintToken(store);
  if (!token) return { ok: false, error: "Couldn't authenticate with Shopify" };

  const gql = async (query: string, variables: Record<string, unknown>) => {
    const res = await fetch(`https://${store.domain}/admin/api/2024-10/graphql.json`, {
      method: "POST", headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    const json = await res.json();
    if (!res.ok || json.errors) throw new Error(json.errors?.[0]?.message || `Shopify ${res.status}`);
    return json.data;
  };

  try {
    const lookup = await gql(`query($code: String!) { codeDiscountNodeByCode(code: $code) { id } }`, { code });
    const nodeId = lookup?.codeDiscountNodeByCode?.id;
    if (!nodeId) return { ok: false, error: "Code not found in Shopify" };

    const mutationName = action === "activate" ? "discountCodeActivate" : "discountCodeDeactivate";
    const result = await gql(`mutation($id: ID!) { ${mutationName}(id: $id) { userErrors { field message } } }`, { id: nodeId });
    const userErrors = result?.[mutationName]?.userErrors;
    if (userErrors?.length) return { ok: false, error: userErrors.map((e: { message: string }) => e.message).join("; ") };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e).slice(0, 300) };
  }
}
