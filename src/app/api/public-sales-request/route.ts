import { NextResponse } from "next/server";
import { salesRequestOk } from "@/lib/salesRequestKey";
import { sbUrl, h, missing, REQUEST_TYPES, buildRequestRow, insertRequest, logEvent, notifyNewRequest } from "@/lib/salesRequests";

// The no-login Sales Hub form (/request). Same table + SLA/notification logic
// as the authenticated /api/sales-requests, the only difference is identity:
// there's no session, so the requester's name/email come from the form itself.
export const revalidate = 0;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(req: Request) {
  if (!(await salesRequestOk(req))) return NextResponse.json({ ok: false, error: "No access" }, { status: 403 });
  const res = await fetch(`${sbUrl}/rest/v1/brands?select=name,color&order=id`, { headers: h(), cache: "no-store" });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ ok: true, needsSetup: missing(res.status, text), brands: [] });
  return NextResponse.json({ ok: true, brands: JSON.parse(text || "[]") });
}

export async function POST(req: Request) {
  if (!(await salesRequestOk(req))) return NextResponse.json({ ok: false, error: "No access" }, { status: 403 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const requesterEmail = String(b.requester_email || "").trim().toLowerCase();
  const requesterName = String(b.requester_name || "").trim();
  if (!requesterName) return NextResponse.json({ ok: false, error: "Your name is required" }, { status: 400 });
  if (!EMAIL_RE.test(requesterEmail)) return NextResponse.json({ ok: false, error: "A valid email is required" }, { status: 400 });
  if (!REQUEST_TYPES.includes(String(b.request_type) as any)) return NextResponse.json({ ok: false, error: "Invalid request type" }, { status: 400 });
  if (!String(b.end_use || "").trim()) return NextResponse.json({ ok: false, error: "\"Where will this be used\" is required" }, { status: 400 });

  const row = buildRequestRow(String(b.request_type), requesterEmail, requesterName, b);
  const { ok, status, text, created } = await insertRequest(row);
  if (!ok) return NextResponse.json({ ok: false, needsSetup: missing(status, text), error: text.slice(0, 200) }, { status: 500 });

  await logEvent(created.id, requesterEmail, null, "new", "Request submitted (public form)");
  const mail = await notifyNewRequest(created);
  return NextResponse.json({ ok: true, item: created, emailed: mail.ok });
}
