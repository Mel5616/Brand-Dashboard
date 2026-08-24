import { createClient } from "@/lib/supabase/server";
import { BRAND_LOGOS } from "@/lib/brandLogos";
import { KitViewer } from "@/components/KitViewer";

export const revalidate = 0;

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sb = await createClient();
  const { data: kit } = await sb.from("retailer_kits").select("title, tagline").eq("share_token", token).eq("status", "published").single();
  if (!kit) return { title: "Retailer kit — Coolkidz Australia" };
  return { title: `${kit.title} — Retailer kit`, description: kit.tagline ?? undefined };
}

export default async function RetailerKitPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sb = await createClient();

  const { data: kit } = await sb.from("retailer_kits").select("*").eq("share_token", token).eq("status", "published").single();
  if (!kit) {
    return <main className="min-h-screen grid place-items-center bg-slate-50 text-slate-400 text-sm">This retailer kit link isn't valid, or hasn't been published yet.</main>;
  }

  const { data: brand } = await sb.from("brands").select("name, color").eq("id", kit.brand_id).single();

  const [{ data: productsRaw }, { data: priceRowsRaw }, { data: questionsRaw }] = await Promise.all([
    sb.from("retailer_kit_products").select("id, name, image_url, description").eq("kit_id", kit.id).order("sort_order"),
    sb.from("retailer_kit_price_rows").select("id, sku, product_name, rrp, wholesale_price, moq").eq("kit_id", kit.id).order("sort_order"),
    sb.from("retailer_kit_quiz_questions").select("id, question, options").eq("kit_id", kit.id).order("sort_order"),
  ]);

  // Strip the "correct" flag before it ever reaches the client — grading
  // happens server-side in /api/kit-quiz.
  const questions = (questionsRaw ?? []).map(q => ({ id: q.id, question: q.question, options: (q.options ?? []).map((o: any) => ({ text: o.text })) }));

  // Best-effort open log — never blocks rendering.
  const now = new Date().toISOString();
  sb.from("retailer_kits").update({ open_count: (kit.open_count || 0) + 1, first_opened_at: kit.first_opened_at || now, last_opened_at: now }).eq("id", kit.id).then(() => {}, () => {});

  return (
    <KitViewer kit={{
      token,
      title: kit.title, tagline: kit.tagline, hero_image_url: kit.hero_image_url, overview: kit.overview, order_info: kit.order_info,
      brand_name: brand?.name ?? "", brand_color: brand?.color ?? "#132741", brand_logo: BRAND_LOGOS[kit.brand_id] ?? null,
      products: productsRaw ?? [], priceRows: priceRowsRaw ?? [], questions,
    }} />
  );
}
