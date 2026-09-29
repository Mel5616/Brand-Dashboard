import { cin7Fetch, cin7Configured } from "./cin7";

// Resolves a single exact Cin7 SKU (ProductOptions.code) to the
// productId/productOptionId pair createCin7SalesOrder needs. Used where a
// SKU is already known (captured at catalogue-pick time) rather than
// searched interactively — e.g. influencer agreement product lines.
export async function resolveCin7Sku(code: string): Promise<{ product_id: number; product_option_id: number; code: string; retail_price: number | null } | null> {
  if (!cin7Configured()) { console.error("[cin7SkuLookup] cin7Configured() is false — CIN7_USERNAME/CIN7_API_KEY missing in this environment"); return null; }
  if (!code.trim()) return null;
  const where = encodeURIComponent(`Code='${code.trim().replace(/'/g, "''")}'`);
  const res = await cin7Fetch(`/v1/ProductOptions?where=${where}&limit=1`);
  if (!res) { console.error(`[cin7SkuLookup] cin7Fetch returned null for code=${code} — request never got a response`); return null; }
  if (!res.ok) { const body = await res.text().catch(() => "<unreadable>"); console.error(`[cin7SkuLookup] Cin7 returned ${res.status} for code=${code}: ${body.slice(0, 300)}`); return null; }
  const rows: any[] = await res.json().catch(() => []);
  const row = rows[0];
  if (!row) { console.error(`[cin7SkuLookup] Cin7 returned 200 but zero rows for code=${code}`); return null; }
  return { product_id: row.productId, product_option_id: row.id, code: row.code, retail_price: row.retailPrice ?? null };
}
