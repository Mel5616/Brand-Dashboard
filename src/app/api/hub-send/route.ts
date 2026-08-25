import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { sendMail } from "@/lib/releaseMail";
import { buildHubEmail } from "@/lib/hubMail";

// Retailer Hub send engine. Every send (email or copied link) creates a
// sales_sends row with a token; the recipient opens /hub/<token> and every
// open is logged — same mechanic as snapshot_shares / deal sheets.
// GET  → list sends (?customer_id= | ?kind= | recent). Any signed-in role.
// POST → { customer_id?, recipient_email, recipient_name?, items:[{kind, id?, title?, brand?}],
//          subject?, message?, via: "email"|"link" } → creates tokens; emails if via=email.
export const revalidate = 0;
const BASE = "https://marketing.coolkidz.com.au";
const KINDS = ["price_list", "brand_overview", "terms", "fact_sheet", "form"] as const;
const KIND_LABEL: Record<string, string> = { price_list: "Price List", brand_overview: "Brand Overview", terms: "Trading Terms", fact_sheet: "Fact Sheet", form: "Credit Application Form" };
const missing = (m: string) => /PGRST205|does not exist|schema cache|relation .* does not exist/i.test(m || "");
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export async function GET(req: Request) {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false, sends: [] }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const sb = await createClient();
  let q = sb.from("sales_sends").select("*").order("created_at", { ascending: false }).limit(300);
  if (sp.get("customer_id")) q = q.eq("customer_id", sp.get("customer_id"));
  if (sp.get("kind")) q = q.eq("doc_kind", sp.get("kind"));
  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, needsSetup: missing(error.message), sends: [] });
  return NextResponse.json({ ok: true, sends: data || [] });
}

export async function POST(req: Request) {
  const a = await getAccess();
  if (!a.role) return NextResponse.json({ ok: false }, { status: 401 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }

  const via = b.via === "link" ? "link" : "email";
  const items: any[] = Array.isArray(b.items) ? b.items.filter((i: any) => KINDS.includes(i?.kind)) : [];
  if (!items.length) return NextResponse.json({ ok: false, error: "Nothing selected to send" }, { status: 400 });
  const recipientEmail = String(b.recipient_email || "").trim().toLowerCase();
  if (via === "email" && !isEmail(recipientEmail)) return NextResponse.json({ ok: false, error: "A valid recipient email is required" }, { status: 400 });

  const sb = await createClient();

  // Resolve document titles/brands server-side so tracking rows are trustworthy.
  const rows: any[] = [];
  for (const it of items) {
    let title = String(it.title || "").trim() || KIND_LABEL[it.kind];
    let brand = String(it.brand || "").trim() || null;
    if (it.kind !== "form" && it.id) {
      const table = it.kind === "fact_sheet" ? "product_fact_sheets" : "sales_documents";
      const { data: doc } = await sb.from(table).select("*").eq("id", it.id).maybeSingle();
      if (!doc) return NextResponse.json({ ok: false, error: `Document not found (${KIND_LABEL[it.kind]})` }, { status: 400 });
      brand = doc.brand_name || brand;
      title = it.kind === "fact_sheet" ? `${doc.brand_name} Fact Sheet` : doc.title;
    }
    rows.push({
      token: randomUUID(),
      customer_id: b.customer_id || null,
      recipient_email: recipientEmail || null,
      recipient_name: String(b.recipient_name || "").trim() || null,
      doc_kind: it.kind, doc_id: it.kind === "form" ? null : it.id || null,
      doc_title: title, brand_name: brand,
      sent_via: via, subject: String(b.subject || "").trim() || null,
      created_by: a.user?.email || null,
    });
  }

  // Preview mode: render the exact email that would go out (placeholder links,
  // nothing written to the database, nothing sent).
  if (b.preview) {
    const previewLinks = rows.map(r => ({ url: "#", title: r.doc_title, kind: r.doc_kind, brand: r.brand_name }));
    return NextResponse.json({ ok: true, html: buildHubEmail({ recipientName: b.recipient_name, message: b.message, links: previewLinks }) });
  }

  const { data: inserted, error } = await sb.from("sales_sends").insert(rows).select();
  if (error) return NextResponse.json({ ok: false, needsSetup: missing(error.message), error: error.message }, { status: 500 });
  const links = (inserted || []).map((r: any) => ({ id: r.id, kind: r.doc_kind, title: r.doc_title, brand: r.brand_name, url: `${BASE}/hub/${r.token}` }));

  if (via === "link") return NextResponse.json({ ok: true, links });

  // Email via Resend — one designed email listing every included link
  // (buildHubEmail is also what the modal's preview renders).
  const subject = String(b.subject || "").trim() || `Coolkidz Australia — ${links.map(l => l.title).join(", ")}`;
  const html = buildHubEmail({ recipientName: b.recipient_name, message: b.message, links: links.map(l => ({ url: l.url, title: l.title, kind: l.kind, brand: l.brand })) });

  const sent = await sendMail({ to: [recipientEmail], subject, html });
  await sb.from("sales_sends").update({ email_status: sent.ok ? "sent" : "failed" }).in("id", (inserted || []).map((r: any) => r.id));
  if (!sent.ok) return NextResponse.json({ ok: false, links, error: `Links created but the email failed: ${sent.error}` }, { status: 500 });
  return NextResponse.json({ ok: true, links });
}

export async function DELETE(req: Request) {
  // Revoke a link — admin only (the token stops resolving).
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "Admins only" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const sb = await createClient();
  const { error } = await sb.from("sales_sends").delete().eq("id", id);
  return NextResponse.json({ ok: !error }, { status: error ? 500 : 200 });
}
