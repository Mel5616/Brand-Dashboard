import { notFound } from "next/navigation";
import { DownloadForm } from "@/components/DownloadForm";

export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = { apikey: sbKey!, Authorization: `Bearer ${sbKey}` };

// Public signup page for a digital download. ?src= tags where the person came
// from; ?embed=1 gives a bare version for an iframe on a brand's own site.
export default async function DownloadPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ src?: string; embed?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const dl = (await fetch(`${sbUrl}/rest/v1/digital_downloads?select=slug,title,description,brand_id&slug=eq.${encodeURIComponent(slug)}&active=eq.true`, { headers: h, cache: "no-store" }).then(r => r.json()).catch(() => []))[0];
  if (!dl) notFound();
  const brand = (await fetch(`${sbUrl}/rest/v1/brands?select=name&id=eq.${dl.brand_id}`, { headers: h, cache: "no-store" }).then(r => r.json()).catch(() => []))[0]?.name ?? "";
  return <DownloadForm slug={dl.slug} title={dl.title} description={dl.description} brand={brand} src={sp.src ?? ""} embed={sp.embed === "1"} />;
}
