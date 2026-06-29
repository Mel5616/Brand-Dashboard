import { redirect } from "next/navigation";
import { getAccess } from "@/lib/access";
import { TAB_SECTIONS, ADMIN_ONLY_TABS } from "@/lib/tabs";
import { UsersAdmin } from "@/components/UsersAdmin";

export const revalidate = 0;

export default async function UsersPage() {
  const access = await getAccess();
  if (!access.user) redirect("/login");
  if (access.role !== "admin") redirect("/");
  return <UsersAdmin sections={TAB_SECTIONS} adminOnly={ADMIN_ONLY_TABS} />;
}
