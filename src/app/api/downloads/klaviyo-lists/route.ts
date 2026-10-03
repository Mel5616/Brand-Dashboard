import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { klaviyoKeyForBrand } from "@/lib/klaviyoBrandKeys";

// Admin: the Klaviyo lists in a brand's account, for the "subscribe signups to" picker.
export const revalidate = 0;

export async function GET(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false }, { status: 403 });
  const brandId = Number(new URL(req.url).searchParams.get("brand_id"));
  const key = klaviyoKeyForBrand(Number.isFinite(brandId) ? brandId : undefined);
  if (!key) return NextResponse.json({ ok: true, lists: [], note: "No Klaviyo key for this brand" });
  const lists: { id: string; name: string }[] = [];
  let url: string | null = "https://a.klaviyo.com/api/lists/?fields[list]=name";
  for (let i = 0; i < 5 && url; i++) {
    const r: Response = await fetch(url, { headers: { Authorization: `Klaviyo-API-Key ${key}`, revision: "2024-10-15" }, cache: "no-store" });
    if (!r.ok) return NextResponse.json({ ok: false, error: "Couldn't read Klaviyo lists" }, { status: 502 });
    const j: any = await r.json();
    for (const d of j.data ?? []) lists.push({ id: d.id, name: d.attributes?.name ?? d.id });
    url = j.links?.next ?? null;
  }
  return NextResponse.json({ ok: true, lists: lists.sort((a, b) => a.name.localeCompare(b.name)) });
}
