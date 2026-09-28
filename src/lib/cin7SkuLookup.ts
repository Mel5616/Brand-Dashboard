import { cin7Fetch, cin7Configured } from "./cin7";

// Resolves a single exact Cin7 SKU (ProductOptions.code) to the
// productId/productOptionId pair createCin7SalesOrder needs. Used where a
// SKU is already known (captured at catalogue-pick time) rather than
// searched interactively — e.g. influencer agreement product lines.
export async function resolveCin7Sku(code: string): Promise<{ product_id: number; product_option_id: number; code: string } | null> {
  if (!cin7Configured() || !code.trim()) return null;
  const where = encodeURIComponent(`Code='${code.trim().replace(/'/g, "''")}'`);
  const res = await cin7Fetch(`/v1/ProductOptions?where=${where}&limit=1`);
  if (!res?.ok) return null;
  const rows: any[] = await res.json().catch(() => []);
  const row = rows[0];
  if (!row) return null;
  return { product_id: row.productId, product_option_id: row.id, code: row.code };
}
