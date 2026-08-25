import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMail, shell } from "@/lib/releaseMail";

// PUBLIC endpoint behind the opening order form (/order/<token>).
// Gated by the send token (doc_kind "order"). GET returns the wholesale
// catalogue for the send's brand (+ prefill); POST recomputes every price
// server-side from order_form_products — client quantities only — then saves
// the order and emails marketing@ + the sender.
export const revalidate = 0;
const MARKETING = "marketing@coolkidz.com.au";
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const esc = (s: any) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
const money = (n: number) => `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function resolveSend(sb: any, token: string) {
  if (!/^[0-9a-f-]{36}$/.test(token || "")) return null;
  const { data } = await sb.from("sales_sends").select("id,doc_kind,brand_name,customer_id,created_by,recipient_name,recipient_email").eq("token", token).maybeSingle();
  return data?.doc_kind === "order" ? data : null;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// A send's brand_name may hold several brands ("Frida, Zazu") — one order
// form can cover multiple brands, grouped by brand on the page.
async function catalogue(sb: any, brandCsv: string | null) {
  const brandList = String(brandCsv || "").split(",").map(s => s.trim()).filter(Boolean);
  let q = sb.from("order_form_products").select("id,brand_name,category,sku,name,short_desc,wholesale,rrp,pack_qty").eq("active", true).order("sort");
  if (brandList.length) q = q.in("brand_name", brandList);
  const { data: products, error } = await q;
  if (error) return { error };
  const { data: brands } = await sb.from("brands").select("name,color");
  const colorOf = (n: string) => (brands || []).find((b: any) => b.name.toLowerCase() === (n || "").toLowerCase())?.color || "#54697C";
  // Product photos live at a conventional bucket path; the page hides any that 404.
  const withImages = (products || []).map((p: any) => ({
    ...p,
    image_url: sb.storage.from("sales-hub").getPublicUrl(`order-products/${slug(p.brand_name)}/${slug(p.sku || p.name)}.jpg`).data.publicUrl,
    brand_color: colorOf(p.brand_name),
  }));
  return { products: withImages, brandList };
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const token = sp.get("token") || "";
  const sb = createAdminClient();

  // Dashboard-only preview: signed-in users can view the form without a send
  // token. "preview" never resolves as a real send, so POST rejects it.
  if (token === "preview") {
    const { getAccess } = await import("@/lib/access");
    if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
    const cat = await catalogue(sb, sp.get("brand"));
    if (cat.error) return NextResponse.json({ ok: false, error: "Order form isn't set up yet." }, { status: 503 });
    return NextResponse.json({ ok: true, brand: sp.get("brand") || null, products: cat.products, prefill: {}, preview: true });
  }

  const send = await resolveSend(sb, token);
  if (!send) return NextResponse.json({ ok: false }, { status: 404 });

  const cat = await catalogue(sb, send.brand_name);
  if (cat.error) return NextResponse.json({ ok: false, error: "Order form isn't set up yet." }, { status: 503 });

  let prefill: any = { contact_name: send.recipient_name, email: send.recipient_email };
  if (send.customer_id) {
    const { data: c } = await sb.from("sales_customers").select("store_name,contact_name,email,phone").eq("id", send.customer_id).maybeSingle();
    if (c) prefill = { ...c, contact_name: c.contact_name || send.recipient_name, email: c.email || send.recipient_email };
  }
  return NextResponse.json({ ok: true, brand: send.brand_name, products: cat.products, prefill });
}

export async function POST(req: Request) {
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const sb = createAdminClient();
  const send = await resolveSend(sb, String(b.token || ""));
  if (!send) return NextResponse.json({ ok: false, error: "This order link is no longer valid." }, { status: 404 });

  const storeName = String(b.store_name || "").trim();
  const email = String(b.email || "").trim().toLowerCase();
  if (!storeName) return NextResponse.json({ ok: false, error: "Store / business name is required." }, { status: 400 });
  if (!isEmail(email)) return NextResponse.json({ ok: false, error: "A valid email is required." }, { status: 400 });

  // Recompute prices server-side; the client only supplies quantities.
  const qtys = new Map<string, number>();
  for (const l of Array.isArray(b.lines) ? b.lines : []) {
    const q = Math.floor(Number(l?.qty));
    if (l?.id && q > 0 && q <= 100000) qtys.set(String(l.id), q);
  }
  if (qtys.size === 0) return NextResponse.json({ ok: false, error: "Add at least one item to the order." }, { status: 400 });
  const { data: products } = await sb.from("order_form_products").select("id,sku,name,wholesale").in("id", [...qtys.keys()]).eq("active", true);
  const lines = (products || []).map((p: any) => {
    const qty = qtys.get(p.id)!;
    return { sku: p.sku, name: p.name, wholesale: Number(p.wholesale || 0), qty, line_total: Math.round(Number(p.wholesale || 0) * qty * 100) / 100 };
  }).filter(l => l.qty > 0);
  if (!lines.length) return NextResponse.json({ ok: false, error: "Add at least one item to the order." }, { status: 400 });
  const total = Math.round(lines.reduce((t, l) => t + l.line_total, 0) * 100) / 100;

  const row = {
    send_id: send.id, customer_id: send.customer_id, brand_name: send.brand_name,
    store_name: storeName, contact_name: String(b.contact_name || "").trim() || null,
    email, phone: String(b.phone || "").trim() || null,
    po_number: String(b.po_number || "").trim() || null, notes: String(b.notes || "").trim() || null,
    lines, total_ex_gst: total,
  };
  const { error } = await sb.from("opening_orders").insert(row);
  if (error) return NextResponse.json({ ok: false, error: "Couldn't save your order — please try again." }, { status: 500 });

  const to = [MARKETING];
  if (isEmail(send.created_by || "") && send.created_by !== MARKETING) to.push(send.created_by);
  const rowsHtml = lines.map(l => `<tr>
    <td style="padding:6px 10px 6px 0;font-family:ui-monospace,monospace;font-size:12px;color:#64748b">${esc(l.sku || "—")}</td>
    <td style="padding:6px 10px 6px 0;font-size:13px;color:#1e293b;font-weight:600">${esc(l.name)}</td>
    <td style="padding:6px 10px 6px 0;font-size:13px;color:#334155;text-align:right">${l.qty}</td>
    <td style="padding:6px 10px 6px 0;font-size:13px;color:#334155;text-align:right">${money(l.wholesale)}</td>
    <td style="padding:6px 0;font-size:13px;color:#0f172a;font-weight:700;text-align:right">${money(l.line_total)}</td>
  </tr>`).join("");
  sendMail({
    to,
    subject: `Opening order — ${storeName}${send.brand_name ? ` (${send.brand_name})` : ""} · ${money(total)} ex GST`,
    html: shell(`
      <p style="font-size:15px;color:#0f172a;margin:0 0 4px"><strong>${esc(storeName)}</strong> submitted an opening order${send.brand_name ? ` for <strong>${esc(send.brand_name)}</strong>` : ""}.</p>
      <p style="font-size:13px;color:#64748b;margin:0 0 14px">${esc(row.contact_name || "")} · ${esc(email)}${row.phone ? ` · ${esc(row.phone)}` : ""}${row.po_number ? ` · PO ${esc(row.po_number)}` : ""}</p>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;text-align:left">
          <th style="padding:0 10px 6px 0">SKU</th><th style="padding:0 10px 6px 0">Product</th><th style="padding:0 10px 6px 0;text-align:right">Qty</th><th style="padding:0 10px 6px 0;text-align:right">Each ex GST</th><th style="padding:0 0 6px;text-align:right">Total</th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot><tr><td colspan="4" style="padding:10px 10px 0 0;text-align:right;font-size:13px;font-weight:700;color:#0f172a;border-top:2px solid #e2e8f0">Order total (ex GST)</td><td style="padding:10px 0 0;text-align:right;font-size:15px;font-weight:800;color:#0f172a;border-top:2px solid #e2e8f0">${money(total)}</td></tr></tfoot>
      </table>
      ${row.notes ? `<p style="font-size:13px;color:#334155;background:#f8fafc;border-radius:8px;padding:10px 12px;margin:14px 0 0;white-space:pre-line"><strong>Notes:</strong> ${esc(row.notes)}</p>` : ""}
      <p style="font-size:12px;color:#94a3b8;margin-top:16px">Also saved in the dashboard under Retailer Hub → Order Forms${send.customer_id ? " and on the customer's record" : ""}.</p>`),
  }).catch(() => {});

  return NextResponse.json({ ok: true, total });
}
