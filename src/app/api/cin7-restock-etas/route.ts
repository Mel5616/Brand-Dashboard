import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { loadCin7RestockEtas } from "@/lib/cin7PurchaseOrders";

// Real restock ETAs from Cin7's open Purchase Orders, keyed by SKU — used
// by the internal Operations > Stock Report tab to show a real date
// alongside the Asana board's hand-typed "Ordering for" field. Read-only.
export const revalidate = 0;
export const maxDuration = 30;

export async function GET() {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
  const map = await loadCin7RestockEtas();
  const etas: Record<string, { eta: string; poRef: string }> = {};
  for (const [code, v] of map) etas[code] = v;
  return NextResponse.json({ ok: true, etas });
}
