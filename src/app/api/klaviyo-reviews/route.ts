import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { klaviyoKeyForBrand } from "@/lib/klaviyoBrandKeys";

// Aggregates Klaviyo Reviews across every brand that has it turned on, into
// one list — read-only (Klaviyo's Reviews API is private-key/export only,
// it can't power a write flow or a custom on-site widget). Reviews is a
// separate paid add-on per Klaviyo account, so most of these brands will
// 403/404 until it's enabled there — that's expected, not a bug, and is
// surfaced per brand rather than failing the whole request.
export const revalidate = 300;
const BASE = "https://a.klaviyo.com/api";
const REVISION = "2024-07-15.pre";

// The brands Mel wants reviews for right now (UPPAbaby already has Reviews;
// the rest need it enabled in Klaviyo before this returns anything for them).
const TARGET_BRANDS: { id: number; name: string }[] = [
  { id: 5, name: "UPPAbaby" },
  { id: 8, name: "Frida" },
  { id: 6, name: "Zazu" },
  { id: 2, name: "Hannie" },
  { id: 11, name: "Mamave" },
  { id: 10, name: "Matchstick Monkey" },
];

export async function GET() {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false }, { status: 403 });

  const results = await Promise.all(TARGET_BRANDS.map(async (b) => {
    const apiKey = klaviyoKeyForBrand(b.id);
    if (!apiKey) return { brand: b.name, enabled: false, reviews: [] as any[] };
    try {
      const res = await fetch(`${BASE}/reviews/?sort=-created&page[size]=25`, {
        headers: { Authorization: `Klaviyo-API-Key ${apiKey}`, revision: REVISION },
        cache: "no-store",
      });
      if (!res.ok) return { brand: b.name, enabled: false, reviews: [] as any[] };
      const json = await res.json();
      const reviews = (json.data || []).map((r: any) => ({
        id: r.id, rating: r.attributes?.rating, content: r.attributes?.content,
        author: r.attributes?.author, product: r.attributes?.product?.name,
        productUrl: r.attributes?.product?.url, created: r.attributes?.created,
        verified: r.attributes?.verified, status: r.attributes?.status,
      }));
      return { brand: b.name, enabled: true, reviews };
    } catch {
      return { brand: b.name, enabled: false, reviews: [] as any[] };
    }
  }));

  return NextResponse.json({ ok: true, brands: results });
}
