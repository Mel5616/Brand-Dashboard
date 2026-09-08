import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { judgeMeConfigured, listJudgeMeReviews } from "@/lib/judgeMe";

// Aggregates Judge.me reviews across every brand that has it set up —
// currently just Frida, growing as more brands install it. Judge.me has a
// real read+write API (unlike Klaviyo Reviews), so this list is live data,
// not a mirror.
export const revalidate = 300;

const TARGET_BRANDS: { id: number; name: string }[] = [
  { id: 8, name: "Frida" },
  { id: 6, name: "Zazu" },
  { id: 2, name: "Hannie" },
  { id: 11, name: "Mamave" },
  { id: 10, name: "Matchstick Monkey" },
];

export async function GET() {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false }, { status: 403 });

  const results = await Promise.all(TARGET_BRANDS.map(async (b) => {
    if (!judgeMeConfigured(b.id)) return { brand: b.name, enabled: false, reviews: [] as any[] };
    const data = await listJudgeMeReviews(b.id);
    const reviews = (data?.reviews || []).map((r: any) => ({
      id: r.id, rating: r.rating, content: r.body, title: r.title,
      author: r.reviewer?.name, product: r.product_title || r.product_handle,
      created: r.created_at, verified: r.verified === "buyer" || r.verified === true,
    }));
    return { brand: b.name, enabled: true, reviews };
  }));

  return NextResponse.json({ ok: true, brands: results });
}
