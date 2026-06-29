import { createAuthServerClient } from "./supabase/auth-server";
import { createAdminClient } from "./supabase/admin";
import { ALL_TABS, ADMIN_ONLY_TABS, type TabId } from "./tabs";

// Re-exported so existing importers keep working; the source of truth is lib/tabs.ts.
export { ALL_TABS };
export type { TabId };
export const FINANCIAL_TABS: TabId[] = ADMIN_ONLY_TABS;

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "mel@coolkidz.com.au")
  .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

export type Access = {
  user: { id: string; email: string } | null;
  role: "admin" | "member" | null;
  allowedTabs: string[];
};

// Resolve the current user's role + which tabs they can open.
export async function getAccess(): Promise<Access> {
  const supabase = await createAuthServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, role: null, allowedTabs: [] };

  const email = (user.email || "").toLowerCase();
  const u = { id: user.id, email };
  if (ADMIN_EMAILS.includes(email)) return { user: u, role: "admin", allowedTabs: [...ALL_TABS] };

  // member: read role + allowed_tabs from profiles (service role; gracefully empty if absent)
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (data?.disabled) return { user: u, role: "member", allowedTabs: [] }; // suspended → no sections
    if (data?.role === "admin") return { user: u, role: "admin", allowedTabs: [...ALL_TABS] };
    return { user: u, role: "member", allowedTabs: (data?.allowed_tabs ?? []) as string[] };
  } catch {
    return { user: u, role: "member", allowedTabs: [] };
  }
}

// Resolve a specific user's effective access (for the admin "View as" preview).
// Does NOT change anyone's session — purely computes what that user would see.
export async function getAccessForUser(userId: string): Promise<Access> {
  try {
    const admin = createAdminClient();
    const { data: got } = await admin.auth.admin.getUserById(userId);
    if (!got?.user) return { user: null, role: null, allowedTabs: [] };
    const email = (got.user.email || "").toLowerCase();
    const u = { id: userId, email };
    if (ADMIN_EMAILS.includes(email)) return { user: u, role: "admin", allowedTabs: [...ALL_TABS] };
    const { data } = await admin.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (data?.disabled) return { user: u, role: "member", allowedTabs: [] };
    if (data?.role === "admin") return { user: u, role: "admin", allowedTabs: [...ALL_TABS] };
    return { user: u, role: "member", allowedTabs: (data?.allowed_tabs ?? []) as string[] };
  } catch {
    return { user: null, role: null, allowedTabs: [] };
  }
}
