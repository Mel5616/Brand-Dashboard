import { GUIDELINE_SECTIONS, Icon } from "@/components/salesHubGuidelines";
import { baloo, body } from "@/components/salesRequestForms";

export const revalidate = 0;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = GUIDELINE_SECTIONS.find(s => s.id === id);
  return { title: g ? `${g.title} — Coolkidz Sales Hub` : "Sales Hub Guidelines" };
}

export default async function GuidelinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = GUIDELINE_SECTIONS.find(s => s.id === id);

  if (!g) return (
    <div className={`min-h-screen bg-[#F5FAFC] flex items-center justify-center p-4 ${body}`}>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-md text-center">
        <p className={`text-lg font-bold text-gray-800 ${baloo}`}>This link isn&apos;t valid</p>
        <p className="text-sm text-gray-400 mt-1">Ask Mel for the current guideline link.</p>
      </div>
    </div>
  );

  return (
    <div className={`min-h-screen bg-[#F5FAFC] pb-14 ${body}`}>
      <div className="bg-gradient-to-br from-[#3EC0E4] to-[#1E9DC2] px-5 pt-8 pb-10 sm:px-8">
        <div className="max-w-2xl mx-auto">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/coolkidz-logo.png" alt="Coolkidz" className="h-6 mb-4 brightness-0 invert" />
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center shrink-0"><Icon path={g.icon} className="w-4.5 h-4.5 text-white" /></span>
            <h1 className={`text-2xl sm:text-3xl font-extrabold text-white ${baloo}`}>{g.title}</h1>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-0 -mt-5">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="prose-sm max-w-none text-slate-700">{g.body}</div>
          <div className="mt-6 pt-3 border-t border-gray-100 text-[11px] text-gray-400">Owner: {g.owner} · v{g.version} · last reviewed {g.lastReviewed}</div>
        </div>
      </div>
    </div>
  );
}
