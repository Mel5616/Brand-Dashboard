import { getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { BRAND_LOGOS } from "@/components/BrandCard";

export const revalidate = 0;
const esc = (s = "") => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const lines = (s?: string | null) => (s || "").split(/\r?\n/).map(x => x.replace(/^[-*•\s]+/, "").trim()).filter(Boolean);

// Print-ready A4 product sheet. The lead saves as PDF from the browser.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAccess()).role) return new Response("Unauthorised", { status: 401 });
  const { id } = await params;
  const sb = await createClient();
  const { data: p } = await sb.from("new_products").select("*, brands(name)").eq("id", id).single();
  if (!p) return new Response("Not found", { status: 404 });
  const brand = (p as any).brands?.name;
  const dims = [p.length, p.width, p.height].every((v: any) => v != null) ? `${p.length} × ${p.width} × ${p.height} cm` : null;
  const launch = p.launch_date ? new Date(p.launch_date + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }) : null;
  const statusLabel = ({ coming_soon: "Coming soon", launching: "Launching", launched: "Available now", archived: "Archived" } as any)[p.status] || "Coming soon";
  const logo = (p.brand_id != null && BRAND_LOGOS[p.brand_id]) ? `<img src="${encodeURI(BRAND_LOGOS[p.brand_id])}" style="height:28px;max-width:160px;object-fit:contain"/>` : `<span style="font-weight:600">${esc(brand || "Coolkidz Australia")}</span>`;
  const ul = (s?: string | null, mark = "•") => lines(s).map(x => `<li style="margin-top:3px"><span style="color:#9aa6b4">${mark}</span> ${esc(x)}</li>`).join("");
  const paras = lines((p.long_description || "").replace(/\n\n+/g, "\n")).map(x => `<p style="margin:8px 0">${esc(x)}</p>`).join("");
  const fact = (l: string, v: string) => v ? `<div style="border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8">${l}</div><div style="font-weight:500">${esc(v)}</div></div>` : "";

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(p.name)}</title><style>
    @page { size: A4; margin: 14mm; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; color: #0f172a; background: #fff; font-size: 12.5px; line-height: 1.5; }
    .card { max-width: 680px; margin: 0 auto; }
    h1 { font-size: 22px; margin: 4px 0 0; }
    h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .14em; color: #94a3b8; margin: 18px 0 6px; }
    ul { margin: 4px 0 0; padding-left: 2px; list-style: none; }
  </style></head><body>
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e2e8f0;padding-bottom:12px">
        ${logo}
        <span style="font-size:11px;font-weight:600;color:#fff;background:#0891b2;border-radius:999px;padding:3px 10px">${statusLabel}${launch ? " · " + esc(launch) : ""}</span>
      </div>
      <h1>${esc(p.name)}</h1>
      ${p.short_description ? `<p style="color:#64748b;margin:4px 0 0">${esc(p.short_description)}</p>` : ""}
      ${paras ? `<div style="margin-top:10px">${paras}</div>` : ""}
      ${lines(p.features).length ? `<h2>Key features</h2><ul>${ul(p.features, "✓")}</ul>` : ""}
      ${lines(p.whats_in_box).length ? `<h2>What's in the box</h2><ul>${ul(p.whats_in_box)}</ul>` : ""}
      <h2>Details</h2>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
        ${fact("SKU", p.sku)}${fact("Barcode", p.barcode)}${fact("Dimensions", dims || "")}${fact("Weight", p.weight != null ? p.weight + " kg" : "")}
      </div>
    </div>
    <script>window.onload=function(){window.print()}</script>
  </body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
