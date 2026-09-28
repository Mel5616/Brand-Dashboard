import { cin7Fetch, cin7Configured } from "./cin7";

// Real restock ETAs from Cin7's own open Purchase Orders — read-only. Maps
// a SKU (Cin7 ProductOptions.code / lineItems[].code, same field the
// dashboard already joins on for Shopify stock sync, see
// scripts/coolkidz_track_stock.py) to the soonest estimatedArrivalDate
// across any open PO carrying it. "Open" = not yet fully received; a PO
// can be split-shipped, so the earliest ETA is the honest one to show.
export type Cin7EtaMap = Map<string, { eta: string; poRef: string }>;

export async function loadCin7RestockEtas(): Promise<Cin7EtaMap> {
  const map: Cin7EtaMap = new Map();
  if (!cin7Configured()) return map;

  const where = encodeURIComponent("FullyReceivedDate IS NULL AND EstimatedArrivalDate IS NOT NULL");
  let page = 1;
  while (page <= 10) { // sane ceiling — open, ETA'd POs are a small subset
    const res = await cin7Fetch(`/v1/PurchaseOrders?where=${where}&limit=50&page=${page}`);
    if (!res?.ok) break;
    const batch: any[] = await res.json().catch(() => []);
    if (!batch.length) break;
    for (const po of batch) {
      const eta: string | null = po.estimatedArrivalDate;
      if (!eta) continue;
      for (const li of po.lineItems || []) {
        // A "Code" field on the Stock Report side sometimes lists more than
        // one SKU ("GSC-WN2/GSC-WN1") — split the same way on both sides so
        // either half matches.
        for (const rawCode of String(li.code || "").split("/")) {
          const code = rawCode.trim().toLowerCase();
          if (!code) continue;
          const existing = map.get(code);
          if (!existing || eta < existing.eta) map.set(code, { eta, poRef: po.reference || String(po.id) });
        }
      }
    }
    if (batch.length < 50) break;
    page++;
  }
  return map;
}
