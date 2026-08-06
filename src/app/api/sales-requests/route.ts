import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { sendMail, shell } from "@/lib/releaseMail";
import { sbUrl, h, missing, STATUSES, GUIDELINE_LINKS, BASE, addBusinessDays, slaDays, buildRequestRow, insertRequest, logEvent, notifyNewRequest } from "@/lib/salesRequests";

// Sales Hub intake, authenticated side, used by the dashboard (Marketing
// triage queue) and by any signed-in sales-hub member. Sales reps without a
// dashboard login use /api/public-sales-request instead (same underlying
// table and SLA/notification logic, via src/lib/salesRequests.ts).
export const revalidate = 0;
const canUse = (acc: { role: string | null; allowedTabs: string[] }) => acc.role === "admin" || (!!acc.role && acc.allowedTabs.includes("sales-hub"));

export async function GET(req: Request) {
  const acc = await getAccess();
  if (!canUse(acc)) return NextResponse.json({ ok: false, error: "No access" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const id = sp.get("id");

  if (id) {
    const [reqRes, filesRes, eventsRes] = await Promise.all([
      fetch(`${sbUrl}/rest/v1/marketing_requests?id=eq.${encodeURIComponent(id)}&limit=1`, { headers: h(), cache: "no-store" }),
      fetch(`${sbUrl}/rest/v1/request_files?request_id=eq.${encodeURIComponent(id)}&order=created_at.asc`, { headers: h(), cache: "no-store" }),
      fetch(`${sbUrl}/rest/v1/request_events?request_id=eq.${encodeURIComponent(id)}&order=created_at.asc`, { headers: h(), cache: "no-store" }),
    ]);
    const text = await reqRes.text();
    if (!reqRes.ok) return NextResponse.json({ ok: false, needsSetup: missing(reqRes.status, text) }, { status: 200 });
    const item = JSON.parse(text || "[]")[0];
    if (!item) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    if (acc.role !== "admin" && item.requester_email !== acc.user?.email) return NextResponse.json({ ok: false, error: "No access" }, { status: 403 });
    return NextResponse.json({ ok: true, item, files: await filesRes.json().catch(() => []), events: await eventsRes.json().catch(() => []) });
  }

  const res = await fetch(`${sbUrl}/rest/v1/marketing_requests?select=*&order=created_at.desc&limit=1000`, { headers: h(), cache: "no-store" });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: true, needsSetup: missing(res.status, text), items: [] });
  let items = JSON.parse(text || "[]");
  if (acc.role !== "admin") items = items.filter((r: any) => r.requester_email === acc.user?.email);
  return NextResponse.json({ ok: true, items, isAdmin: acc.role === "admin" });
}

export async function POST(req: Request) {
  const acc = await getAccess();
  if (!canUse(acc)) return NextResponse.json({ ok: false, error: "No access" }, { status: 403 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  if (!String(b.end_use || "").trim()) return NextResponse.json({ ok: false, error: "\"Where will this be used\" is required" }, { status: 400 });

  const row = buildRequestRow(String(b.request_type || ""), acc.user!.email, b.requester_name, b);
  const { ok, status, text, created } = await insertRequest(row);
  if (!ok) return NextResponse.json({ ok: false, needsSetup: missing(status, text), error: text.slice(0, 200) }, { status: 500 });

  await logEvent(created.id, acc.user!.email, null, "new", "Request submitted");
  const mail = await notifyNewRequest(created);
  return NextResponse.json({ ok: true, item: created, emailed: mail.ok });
}

export async function PATCH(req: Request) {
  const acc = await getAccess();
  if (acc.role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const id = String(b.id || "");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });

  const get = await fetch(`${sbUrl}/rest/v1/marketing_requests?id=eq.${encodeURIComponent(id)}&limit=1`, { headers: h(), cache: "no-store" });
  const item = (await get.json())[0];
  if (!item) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const fields: any = { updated_at: new Date().toISOString() };
  let toStatus = item.status;
  if (b.status) {
    if (!STATUSES.includes(b.status)) return NextResponse.json({ ok: false, error: "Invalid status" }, { status: 400 });
    if (b.status === "declined" && !String(b.decline_reason || "").trim()) return NextResponse.json({ ok: false, error: "Decline reason required" }, { status: 400 });
    fields.status = toStatus = b.status;
    if (b.status === "declined") fields.decline_reason = String(b.decline_reason).slice(0, 500);
    // Clock starts at triage, not creation.
    if (b.status === "triaged" && !item.sla_due_at) {
      const days = slaDays(item.request_type, item.brief);
      if (days != null) fields.sla_due_at = addBusinessDays(new Date(), days).toISOString();
    }
  }
  if (b.assignee_email !== undefined) fields.assignee_email = b.assignee_email ? String(b.assignee_email).slice(0, 200) : null;

  const res = await fetch(`${sbUrl}/rest/v1/marketing_requests?id=eq.${id}`, { method: "PATCH", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify(fields) });
  if (!res.ok) return NextResponse.json({ ok: false, error: (await res.text()).slice(0, 200) }, { status: 500 });

  if (b.status && b.status !== item.status) {
    await logEvent(id, acc.user!.email, item.status, toStatus, b.note ? String(b.note).slice(0, 500) : (b.decline_reason ? String(b.decline_reason).slice(0, 500) : null));
    if (item.requester_email) {
      const declined = toStatus === "declined";
      const guideLink = declined && GUIDELINE_LINKS[item.request_type] ? `${BASE}?tab=sales-hub&guide=${GUIDELINE_LINKS[item.request_type]}` : null;
      await sendMail({
        to: [item.requester_email],
        subject: declined ? `Request declined: ${item.title}` : `Request update: ${item.title}, ${toStatus.replace(/_/g, " ")}`,
        html: shell(`
          <p style="font-size:15px">Your ${item.request_type.replace(/_/g, " ")} request "<strong>${item.title}</strong>" is now <strong>${toStatus.replace(/_/g, " ")}</strong>.</p>
          ${declined && b.decline_reason ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:12px 16px;margin:14px 0"><p style="margin:0;font-size:13px;color:#991b1b"><strong>Reason:</strong> ${String(b.decline_reason)}</p></div>` : ""}
          ${guideLink ? `<p style="font-size:13px"><a href="${guideLink}">Review the relevant guidelines</a> before resubmitting.</p>` : ""}
          <p style="text-align:center;margin:22px 0"><a href="${BASE}" style="background:#10b981;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 26px;border-radius:8px">Open the Sales Hub</a></p>
        `),
      });
    }
  }
  return NextResponse.json({ ok: true });
}
