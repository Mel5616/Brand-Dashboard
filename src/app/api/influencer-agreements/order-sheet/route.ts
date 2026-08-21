import { getAccess } from "@/lib/access";
import { buildGiftOrderSheet } from "@/lib/giftOrderSheet";

// Printable "Gift order sheet" for one agreement — influencer name, delivery
// address, email, phone and product/quantities, for handing to invoicing or
// keying into Shopify manually. Not a live Shopify order (see Option A vs B
// in chat) — this is a print/PDF handoff document only.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = () => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}` });
const canUse = (acc: { role: string | null; allowedTabs: string[] }) => acc.role === "admin" || (!!acc.role && acc.allowedTabs.includes("influencer-agreements"));

export async function GET(req: Request) {
  const acc = await getAccess();
  if (!canUse(acc)) return new Response("Unauthorised", { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return new Response("Missing id", { status: 400 });

  const select = "select=reference,agreement_date,campaign_name,status,brands(name),influencers:agreement_influencers(*),influencer_agreement_products(*)";
  const res = await fetch(`${sbUrl}/rest/v1/influencer_agreements?id=eq.${id}&${select}&limit=1`, { headers: h(), cache: "no-store" });
  if (!res.ok) return new Response("Could not load the agreement", { status: 502 });
  const rows = await res.json();
  const a = rows[0];
  if (!a) return new Response("Not found", { status: 404 });

  const html = buildGiftOrderSheet({
    reference: a.reference, agreement_date: a.agreement_date, campaign_name: a.campaign_name, status: a.status,
    brand_name: a.brands?.name ?? "—", influencer: a.influencers, products: a.influencer_agreement_products ?? [],
  });
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
