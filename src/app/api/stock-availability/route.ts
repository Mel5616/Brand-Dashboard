import { NextResponse } from "next/server";
import { getAccess, canManage } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { loadStockFeed, type StockGroup } from "@/lib/stockFeed";

// Retailer Hub → Stock Availability: turns the live Asana Stock Report feed
// (asana_tasks, project_label "Stock Report" — sections are brands, custom
// fields hold Code / Stock Status / Ordering For) into a branded customer-
// facing availability report. Internal notes never leave the building.
// GET             → the feed grouped by brand (+ published report docs).
// GET ?preview=1  → the generated report HTML (&brand= for one brand).
// POST {brand}    → freeze the report into sales_documents (category
//                   stock_report) so it can be sent & tracked like any doc.
export const revalidate = 0;
const BUCKET = "sales-hub";
const missing = (m: string) => /PGRST205|does not exist|schema cache|relation .* does not exist/i.test(m || "");
const esc = (s: any) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
type Group = StockGroup;

const statusStyle = (s: string) => {
  const v = (s || "").toLowerCase();
  if (/out/.test(v)) return "background:#ffe4e6;color:#be123c";
  if (/low/.test(v)) return "background:#fef3c7;color:#b45309";
  if (/back|order|transit/.test(v)) return "background:#e0f2fe;color:#0369a1";
  return "background:#f1f5f9;color:#475569";
};

function buildReport(groups: Group[], brandFilter: string | null, dateLabel: string) {
  const shown = brandFilter ? groups.filter(g => g.brand.toLowerCase() === brandFilter.toLowerCase()) : groups;
  const title = brandFilter ? `${brandFilter} Stock Availability` : "Stock Availability";
  const sections = shown.map(g => `
    <section style="margin:0 0 26px;border:1px solid #e2e8f0;border-top:3px solid ${g.color};border-radius:14px;overflow:hidden;page-break-inside:avoid">
      <div style="display:flex;align-items:center;gap:10px;padding:12px 18px;background:${g.color}12">
        <span style="width:10px;height:10px;border-radius:99px;background:${g.color}"></span>
        <span style="font-size:15px;font-weight:800;color:#0f172a">${esc(g.brand)}</span>
        <span style="font-size:11px;font-weight:700;color:${g.color};background:${g.color}22;border-radius:99px;padding:2px 10px">${g.items.length} line${g.items.length === 1 ? "" : "s"} affected</span>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="background:#0f172a;color:#fff;font-size:10px;text-transform:uppercase;letter-spacing:.08em">
          <th style="text-align:left;padding:8px 18px">Product</th><th style="text-align:left;padding:8px 12px">Code</th>
          <th style="text-align:left;padding:8px 12px">Status</th><th style="text-align:left;padding:8px 18px">Expected back</th>
        </tr></thead>
        <tbody>${g.items.map((it, i) => `
          <tr style="border-top:1px solid #f1f5f9;${i % 2 ? "background:#f8fafc" : ""}">
            <td style="padding:9px 18px;font-weight:600;color:#1e293b">${esc(it.name)}</td>
            <td style="padding:9px 12px;font-family:ui-monospace,monospace;font-size:12px;color:#64748b">${esc(it.code || "—")}</td>
            <td style="padding:9px 12px">${it.status ? `<span style="font-size:11px;font-weight:700;border-radius:99px;padding:3px 10px;${statusStyle(it.status)}">${esc(it.status)}</span>` : "—"}</td>
            <td style="padding:9px 18px;color:#334155">${esc(it.expected || "TBC")}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </section>`).join("");

  return `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} | Coolkidz Australia</title></head>
<body style="margin:0;background:#f1f5f9;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:780px;margin:0 auto;padding:28px 16px">
    <div style="background:#132741;border-radius:18px 18px 0 0;padding:30px 36px">
      <img src="https://marketing.coolkidz.com.au/logos/coolkidz-logo.png" alt="Coolkidz Australia" height="32" style="display:block;height:32px" />
      <p style="color:#fff;font-size:25px;font-weight:800;margin:20px 0 4px">${esc(title)}</p>
      <p style="color:#8fb0cc;font-size:13px;margin:0">Current as at ${esc(dateLabel)}</p>
    </div>
    <div style="background:#fff;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 18px 18px;padding:30px 36px">
      <p style="font-size:14px;color:#334155;line-height:1.65;margin:0 0 22px">The lines below are currently affected by availability constraints. <strong>Everything else in the range is in stock and shipping as normal.</strong> Expected-back dates are our best current estimate and we'll keep you posted if anything moves.</p>
      ${sections || `<p style="text-align:center;color:#16a34a;font-weight:700;font-size:15px;padding:28px 0">🎉 Nothing to report — the full range is in stock and shipping as normal.</p>`}
      <p style="font-size:12.5px;color:#64748b;line-height:1.6;margin:8px 0 0">Questions about a specific line or your backorders — reply to the email this came with, or contact your Coolkidz representative.</p>
    </div>
    <p style="color:#94a3b8;font-size:11px;text-align:center;margin:16px 0 0;line-height:1.6">Coolkidz Australia Pty Ltd · 1 Beyer Road, Braeside VIC 3195</p>
  </div>
</body></html>`;
}

export async function GET(req: Request) {
  if (!(await getAccess()).role) return NextResponse.json({ ok: false }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const sb = await createClient();
  const { groups, error } = await loadStockFeed(sb);
  if (error) return NextResponse.json({ ok: false, needsSetup: missing(error), error });

  if (sp.get("preview") === "1") {
    const dateLabel = new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
    return new NextResponse(buildReport(groups, sp.get("brand") || null, dateLabel), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  }

  const { data: docs } = await sb.from("sales_documents").select("*").eq("category", "stock_report").order("created_at", { ascending: false }).limit(50);
  return NextResponse.json({ ok: true, groups, docs: docs || [] });
}

export async function POST(req: Request) {
  const a = await getAccess();
  if (!(await canManage("stock-availability"))) return NextResponse.json({ ok: false, error: "No access" }, { status: 403 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const brand = String(b.brand || "").trim() || null;
  const sb = await createClient();
  const { groups, error } = await loadStockFeed(sb);
  if (error) return NextResponse.json({ ok: false, error });

  const now = new Date();
  const dateLabel = now.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
  const html = buildReport(groups, brand, dateLabel);
  const title = brand ? `${brand} Stock Availability` : "Stock Availability — All Brands";

  await sb.storage.createBucket(BUCKET, { public: true }).catch(() => {});
  const path = `stock_report/${Date.now()}-${(brand || "all-brands").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.html`;
  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, new Blob([html], { type: "text/html" }), { contentType: "text/html; charset=utf-8" });
  if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
  const html_url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

  await sb.from("sales_documents").update({ status: "archived" }).eq("category", "stock_report").eq("status", "current").eq("title", title);
  const { data: doc, error: insErr } = await sb.from("sales_documents").insert({
    category: "stock_report", brand_name: brand, title, version: now.toISOString().slice(0, 10),
    html_url, status: "current", created_by: a.user?.email || null,
  }).select().single();
  if (insErr) return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
  return NextResponse.json({ ok: true, doc });
}
