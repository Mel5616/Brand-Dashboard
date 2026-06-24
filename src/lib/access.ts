import { createAuthServerClient } from "./supabase/auth-server";
import { createAdminClient } from "./supabase/admin";

// Tab ids must match the TABS in DashboardTabs.tsx
export const ALL_TABS = ["brands", "shopify", "google-ads", "meta-ads", "tradeshows", "budget", "calendar", "content", "influencer"] as const;
export type TabId = (typeof ALL_TABS)[number];

// Tabs that expose cost / margin / budget — admin-only even if otherwise granted
export const FINANCIAL_TABS: TabId[] = ["budget"];

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
    const { data } = await admin.from("profiles").select("role, allowed_tabs").eq("id", user.id).maybeSingle();
    if (data?.role === "admin") return { user: u, role: "admin", allowedTabs: [...ALL_TABS] };
    return { user: u, role: "member", allowedTabs: (data?.allowed_tabs ?? []) as string[] };
  } catch {
    return { user: u, role: "member", allowedTabs: [] };
  }
}
