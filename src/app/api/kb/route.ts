import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { isApprover } from "@/lib/kb/approvers";
import { buildPatch, buildNewRow, restoreFromHistory } from "@/lib/kb/api";
import type { KbEntry } from "@/lib/kb/core";

const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL, sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = () => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey!}`, "Content-Type": "application/json" });

async function who() { const a = await getAccess(); return isApprover(a.user?.email) ? a.user!.email! : null; }
const forbidden = () => NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
const badRequest = (error: string) => NextResponse.json({ ok: false, error }, { status: 400 });

// Approvers only. List/search entries (?brand, ?q, ?status, ?source, ?topic) or one entry's history (?history=<id>).
export async function GET(req: Request) {
  if (!(await who())) return forbidden();
  const sp = new URL(req.url).searchParams;
  const hist = Number(sp.get("history"));
  if (hist) {
    const r = await fetch(`${sbUrl}/rest/v1/kb_history?select=*&entry_id=eq.${hist}&order=changed_at.desc&limit=50`, { headers: H(), cache: "no-store" });
    return NextResponse.json({ ok: r.ok, history: r.ok ? await r.json() : [] });
  }
  const brand = sp.get("brand") || "uppababy";
  const parts = [`select=*`, `brand=eq.${encodeURIComponent(brand)}`, `order=sort_order.asc,id.asc`, `limit=5000`];
  for (const f of ["status", "source", "topic"]) { const v = sp.get(f); if (v) parts.push(`${f}=eq.${encodeURIComponent(v)}`); }
  const q = (sp.get("q") || "").trim();
  if (q) parts.push(`or=(question.ilike.*${encodeURIComponent(q)}*,answer.ilike.*${encodeURIComponent(q)}*)`);
  const r = await fetch(`${sbUrl}/rest/v1/kb_entries?${parts.join("&")}`, { headers: H(), cache: "no-store" });
  if (!r.ok) return NextResponse.json({ ok: false, rows: [], fixes: [] });
  const rows: KbEntry[] = await r.json();
  const byId = new Map(rows.map(e => [e.id, e]));
  const fixes = rows.filter(e => e.corrects && e.status === "approved" && byId.get(e.corrects)?.source === "website")
    .map(e => ({ website: byId.get(e.corrects!)!, correction: e }));
  return NextResponse.json({ ok: true, rows, fixes });
}

// Edit one entry. The audit trigger records history from decided_by / decided_reason, which buildPatch always sets.
export async function PATCH(req: Request) {
  const email = await who(); if (!email) return forbidden();
  let b: { id?: unknown; patch?: unknown } | null;
  try { b = await req.json(); } catch { return badRequest("Bad request"); }
  const id = Number(b?.id);
  if (!id) return badRequest("id required");
  const built = buildPatch(b?.patch, email);
  if (!built.ok) return badRequest(built.error);
  const r = await fetch(`${sbUrl}/rest/v1/kb_entries?id=eq.${id}`, { method: "PATCH", headers: { ...H(), Prefer: "return=minimal" }, body: JSON.stringify(built.patch) });
  return NextResponse.json({ ok: r.ok });
}

// Add an entry, or undo a change ({ undo: <historyId> }).
export async function POST(req: Request) {
  const email = await who(); if (!email) return forbidden();
  let b: { undo?: unknown } | null;
  try { b = await req.json(); } catch { return badRequest("Bad request"); }
  if (b?.undo) {
    const hr = await fetch(`${sbUrl}/rest/v1/kb_history?select=*&id=eq.${Number(b.undo)}`, { headers: H(), cache: "no-store" });
    const h = hr.ok ? await hr.json() : [];
    const restored = restoreFromHistory(h?.[0], email);
    if (!restored.ok) return badRequest(restored.error);
    const r = await fetch(`${sbUrl}/rest/v1/kb_entries?id=eq.${restored.id}`, { method: "PATCH", headers: { ...H(), Prefer: "return=minimal" }, body: JSON.stringify(restored.patch) });
    return NextResponse.json({ ok: r.ok });
  }
  const built = buildNewRow(b, email);
  if (!built.ok) return badRequest(built.error);
  const r = await fetch(`${sbUrl}/rest/v1/kb_entries`, { method: "POST", headers: { ...H(), Prefer: "return=representation" }, body: JSON.stringify(built.row) });
  if (!r.ok) return NextResponse.json({ ok: false, error: "Not saved" }, { status: 500 });
  const [saved] = await r.json();
  return NextResponse.json({ ok: true, row: saved });
}
