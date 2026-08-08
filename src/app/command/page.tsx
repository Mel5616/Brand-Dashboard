import { getAccess } from "@/lib/access";
import { CommandCentre } from "@/components/CommandCentre";

// Command Centre — Marketing Director's single-screen view. Strictly admin-only,
// same restriction pattern as /team. Not linked from the sidebar for anyone else.
export const revalidate = 0;
export const metadata = { title: "Command · Coolkidz Australia" };

export default async function CommandPage() {
  const access = await getAccess();
  if (access.role !== "admin") {
    return <main className="min-h-screen grid place-items-center bg-slate-50 text-slate-500 text-sm">This page is restricted to the Marketing Director.</main>;
  }
  return <CommandCentre />;
}
