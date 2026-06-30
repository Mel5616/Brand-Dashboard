import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "@/components/PrintButton";
import { CampaignBriefSheet } from "@/components/CampaignBriefSheet";

export const revalidate = 0;

const PRINT_CSS = `
@page { size: A4; margin: 12mm; }
@media print {
  html, body { background: #fff !important; }
  .no-print { display: none !important; }
  main.sheet-wrap { min-height: 0 !important; padding: 0 !important; }
  .sheet { box-shadow: none !important; border: none !important; border-radius: 0 !important; max-width: none !important; margin: 0 !important; overflow: visible !important; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
}
`;

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sb = await createClient();
  const { data: c } = await sb.from("campaigns").select("campaign, brief, image_url").eq("share_token", token).single();
  if (!c) return { title: "Campaign brief — Coolkidz Australia" };
  const title = `${c.campaign || "Campaign brief"} — Coolkidz Australia`;
  const description = c.brief?.oneLiner || "Campaign brief · Coolkidz Australia";
  const img: string | undefined = c.image_url || undefined;
  return {
    title, description,
    openGraph: { title, description, type: "website", siteName: "Coolkidz Australia", images: img ? [{ url: img, alt: c.campaign }] : undefined },
    twitter: { card: img ? "summary_large_image" : "summary", title, description, images: img ? [img] : undefined },
  };
}

// Public, token-protected campaign brief (no login). Shareable with the team.
export default async function CampaignShare({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sb = await createClient();
  const { data: c } = await sb.from("campaigns").select("*").eq("share_token", token).single();
  if (!c) return <main className="min-h-screen grid place-items-center bg-slate-50 text-slate-500 text-sm">This brief link is not valid.</main>;

  return (
    <main className="sheet-wrap min-h-screen bg-slate-100 py-8 px-4 print:p-0 print:bg-white">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div className="max-w-[860px] mx-auto mb-4 flex justify-end no-print">
        <PrintButton />
      </div>
      <CampaignBriefSheet c={c} />
    </main>
  );
}
