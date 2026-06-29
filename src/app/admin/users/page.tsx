import { redirect } from "next/navigation";
import { getAccess, ALL_TABS } from "@/lib/access";
import { UsersAdmin } from "@/components/UsersAdmin";

export const revalidate = 0;

export default async function UsersPage() {
  const access = await getAccess();
  if (!access.user) redirect("/login");
  if (access.role !== "admin") redirect("/");
  return <UsersAdmin allTabs={[...ALL_TABS]} />;
}
