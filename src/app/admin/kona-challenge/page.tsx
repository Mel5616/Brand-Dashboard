import { redirect } from "next/navigation";
import { getAccess } from "@/lib/access";
import { KonaChallengeAdmin } from "@/components/KonaChallengeAdmin";

export const revalidate = 0;

export default async function KonaChallengeAdminPage() {
  const access = await getAccess();
  if (!access.user) redirect("/login");
  if (access.role !== "admin") redirect("/");
  return (
    <div className="min-h-screen bg-[#F5FAFC] p-4 sm:p-8">
      <div className="max-w-5xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800">Kona Challenge entries</h1>
          <p className="text-sm text-gray-400 mt-1">Baby Village, Baby Kingdom, BabyRoad, Whole Bubs, Coolkidz Head Office.</p>
        </div>
        <KonaChallengeAdmin />
      </div>
    </div>
  );
}
