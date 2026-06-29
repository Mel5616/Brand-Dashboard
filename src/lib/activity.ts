import { createAdminClient } from "./supabase/admin";

export type ActivityEvent = {
  userId?: string | null;
  email?: string | null;
  action: string;            // login | logout | view | create | update | delete | request
  target?: string | null;    // tab id, table/route, or record reference
  detail?: Record<string, unknown> | null;
  path?: string | null;
  method?: string | null;
  ip?: string | null;
};

// Best-effort write to activity_log. Never throws — tracking must not break a request.
export async function logActivity(e: ActivityEvent): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("activity_log").insert({
      user_id: e.userId ?? null,
      user_email: e.email ?? null,
      action: e.action,
      target: e.target ?? null,
      detail: e.detail ?? null,
      path: e.path ?? null,
      method: e.method ?? null,
      ip: e.ip ?? null,
    });
  } catch {
    // activity_log table may not exist yet, or insert failed — ignore.
  }
}
