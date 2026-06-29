import { redirect } from "next/navigation";
import { getAccess } from "@/lib/access";
import { ActivityLog } from "@/components/ActivityLog";

export const revalidate = 0;

export default async function ActivityPage() {
  const access = await getAccess();
  if (!access.user) redirect("/login");
  if (access.role !== "admin") redirect("/");
  return <ActivityLog />;
}
