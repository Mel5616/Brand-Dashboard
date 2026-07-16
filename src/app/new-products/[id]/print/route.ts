import { getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { BRAND_LOGOS } from "@/lib/brandLogos";

export const revalidate = 0;
const esc = (s = "") => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const lines = (s?: string | null) => (s || "").split(/\r?\n/).map(x => x.replace(/^[-*•\s]+/, "").trim()).filter(Boolean);
const baseSku = (sku?: string | null) => { const s = String(sku || "").trim(); const b = s.includes("-") ? s.slice(0, s.lastIndexOf("-")) : s; return b.length >= 3 ? b : s; }; // base ≥3 chars: short stubs are brand prefixes, not product lines
function commonPrefix(names: string[]): string {
  if (!names.length) return "";
  const split = names.map(n => n.trim().split(/\s+/)); const out: string[] = [];
  for (let i = 0; i < split[0].length; i++) { const w = split[0][i]; if (split.every(s => s[i] === w)) out.push(w); else break; }
  return out.join(" ").trim() || names[0];
}
const dimOf = (m: any) => [m.length, m.width, m.height].every((v: any) => v != null) ? `${m.length} × ${m.width} × ${m.height} cm` : "";

const NAVY = "#1f2a44", INK = "#0f172a", MUTE = "#64748b", PANEL = "#f1f5f9", LINE = "#e2e8f0";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAccess()).role) return new Response("Unauthorised", { status: 401 });
  const { id } = await params;
  const sb = await createClient();
  const { data: p } = await sb.from("new_products").select("*").eq("id", id).single();
  if (!p) return new Response("Not found", { status: 404 });

  // Gather the whole colour line.
  const base = baseSku(p.sku);
  let members: any[] = [p];
  if (base) {
    const { data } = await sb.from("new_products").select("*").or(`sku.like.${base}-*,sku.eq.${base}`);
    if (data && data.length) members = data;
  }
  members.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  const title = commonPrefix(members.map(m => m.name)) || p.name;
  const variantLabel = (name: string) => name.replace(title, "").trim() || name;

  let brand: string | undefined, accent = "#C9A24B";
  if (p.brand_id != null) { const { data: b } = await sb.from("brands").select("name,color").eq("id", p.brand_id).single(); brand = b?.name ?? undefined; if (b?.color) accent = b.color; }
  const logo = (p.brand_id != null && BRAND_LOGOS[p.brand_id]) ? `<img src="${encodeURI(BRAND_LOGOS[p.brand_id])}" style="height:30px;max-width:170px;object-fit:contain"/>` : `<span style="font-weight:700;font-size:16px;color:${NAVY}">${esc(brand || "Coolkidz Australia")}</span>`;
  const hero = members.find(m => m.attrs?.image_url)?.attrs?.image_url || p.attrs?.image_url;
  const launch = p.launch_date ? new Date(p.launch_date + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }) : null;
  const created = p.created_at ? new Date(p.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "Australia/Melbourne" }) : "";
  const statusLabel = ({ coming_soon: "Coming soon", launching: "Launching", launched: "Available now", archived: "Archived" } as any)[p.status] || "Coming soon";
  const multi = members.length > 1;

  const h = (t: string) => `<div style="background:${PANEL};color:${NAVY};font-weight:700;text-transform:uppercase;letter-spacing:.12em;font-size:10px;padding:5px 10px;border-radius:5px;margin:0 0 8px">${esc(t)}</div>`;
  const para = lines((p.long_description || "").replace(/\n\n+/g, "\n")).map(x => `<p style="margin:0 0 7px">${esc(x)}</p>`).join("");
  const feat = lines(p.features).map(x => `<li style="display:flex;gap:6px;margin-top:4px;list-style:none"><span style="color:${accent};font-weight:700">✓</span><span>${esc(x)}</span></li>`).join("");
  const box = lines(p.whats_in_box).map(x => `<li style="display:flex;gap:6px;margin-top:4px;list-style:none"><span style="color:#94a3b8">•</span><span>${esc(x)}</span></li>`).join("");

  // Small inline icons for each spec label (stroke uses the surrounding text colour).
  const svg = (paths: string) => `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:6px;flex-shrink:0">${paths}</svg>`;
  const SPEC_ICON: Record<string, string> = {
    Dimensions: svg('<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>'),
    Weight: svg('<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>'),
    SKU: svg('<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>'),
    Barcode: svg('<path d="M3 5v14"/><path d="M8 5v14"/><path d="M12 5v14"/><path d="M17 5v14"/><path d="M21 5v14"/>'),
    RRP: svg('<circle cx="12" cy="12" r="10"/><path d="M14.5 9a2.5 2.5 0 0 0-2.5-1.5h-.5a2 2 0 0 0 0 4h1a2 2 0 0 1 0 4h-.5A2.5 2.5 0 0 1 9.5 15"/><path d="M12 6v1.5M12 16.5V18"/>'),
    Wholesale: svg('<circle cx="12" cy="12" r="10"/><path d="M14.5 9a2.5 2.5 0 0 0-2.5-1.5h-.5a2 2 0 0 0 0 4h1a2 2 0 0 1 0 4h-.5A2.5 2.5 0 0 1 9.5 15"/><path d="M12 6v1.5M12 16.5V18"/>'),
  };
  const money = (n: any) => n == null ? "" : `$${Number(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Specification rows. Dimensions/weight/RRP/wholesale are shared across colours;
  // SKU/barcode vary per colour so they show here only for a single-colour product.
  const specRows: [string, string][] = [];
  if (dimOf(p)) specRows.push(["Dimensions", dimOf(p)]);
  if (p.weight != null) specRows.push(["Weight", `${p.weight} kg`]);
  if (p.rrp != null) specRows.push(["RRP", money(p.rrp)]);
  if (p.wholesale_price != null) specRows.push(["Wholesale", money(p.wholesale_price)]);
  if (!multi) { if (p.sku) specRows.push(["SKU", p.sku]); if (p.barcode) specRows.push(["Barcode", p.barcode]); }
  const spec = specRows.map((r, i) => `<tr style="background:${i % 2 ? "#fff" : "#f8fafc"}"><td style="padding:6px 10px;color:${MUTE};border:1px solid ${LINE};white-space:nowrap">${SPEC_ICON[r[0]] || ""}${esc(r[0])}</td><td style="padding:6px 10px;font-weight:600;border:1px solid ${LINE}">${esc(r[1])}</td></tr>`).join("");

  const variantRows = members.map(m => `<tr>
    <td style="padding:4px 6px;border:1px solid ${LINE};width:44px;text-align:center">${m.attrs?.image_url ? `<img src="${esc(m.attrs.image_url)}" style="width:34px;height:34px;object-fit:contain;display:inline-block;background:#f8fafc;border-radius:3px"/>` : ""}</td>
    <td style="padding:6px 9px;border:1px solid ${LINE};font-weight:600">${esc(variantLabel(m.name))}</td>
    <td style="padding:6px 9px;border:1px solid ${LINE}">${esc(m.sku || "")}</td>
    <td style="padding:6px 9px;border:1px solid ${LINE}">${esc(m.barcode || "")}</td>
    <td style="padding:6px 9px;border:1px solid ${LINE}">${esc(dimOf(m))}</td>
    <td style="padding:6px 9px;border:1px solid ${LINE}">${m.weight != null ? esc(m.weight + " kg") : ""}</td>
  </tr>`).join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)} — data sheet</title><style>
    @page { size: A4; margin: 0; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: ${INK}; font-size: 11px; line-height: 1.5; }
    table { border-collapse: collapse; width: 100%; }
  </style></head><body>
    <div style="padding:13mm 14mm 7mm">
      <div style="display:flex;align-items:center;justify-content:space-between">
        ${logo}
        <span style="font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#94a3b8">Product Data Sheet</span>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12mm;margin-top:9mm">
        <div style="flex:1;min-width:0">
          <div style="font-size:27px;font-weight:800;color:${NAVY};line-height:1.08">${esc(title)}</div>
          <span style="display:inline-block;margin-top:9px;background:${accent};color:#fff;font-weight:700;letter-spacing:.07em;text-transform:uppercase;font-size:11px;padding:6px 14px;border-radius:6px">${esc(brand || "Coolkidz")}</span>
          <div style="margin-top:7px;font-size:11px;color:${MUTE}">${statusLabel}${launch ? " · " + esc(launch) : ""}${multi ? " · " + members.length + " colours" : ""}</div>
        </div>
        ${hero ? `<div style="width:52mm;height:52mm;flex-shrink:0;overflow:hidden;border-radius:8px;background:#f8fafc;display:flex;align-items:center;justify-content:center"><img src="${esc(hero)}" style="max-width:100%;max-height:100%;object-fit:contain"/></div>` : ""}
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1.1fr 0.9fr;gap:10mm;padding:2mm 14mm 6mm">
      <div>
        ${(p.short_description || para) ? `${h("Description")}${p.short_description ? `<p style="color:#ea580c;font-style:italic;font-size:12px;line-height:1.45;margin:0 0 9px">${esc(p.short_description)}</p>` : ""}${para ? `<div style="color:#334155">${para}</div>` : ""}` : ""}
      </div>
      <div>
        ${specRows.length ? `${h("Specification data")}<table>${spec}</table>` : ""}
        ${feat ? `<div style="margin-top:14px">${h("Key features")}<ul style="margin:0;padding:0">${feat}</ul></div>` : ""}
        ${box ? `<div style="margin-top:14px">${h("What's in the box")}<ul style="margin:0;padding:0">${box}</ul></div>` : ""}
      </div>
    </div>

    ${multi ? `<div style="padding:0 14mm 8mm">${h("Colours")}
      <table>
        <thead><tr style="background:${NAVY};color:#fff">
          <th style="padding:7px 6px;width:44px"></th>
          <th style="padding:7px 9px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.06em">Colour</th>
          <th style="padding:7px 9px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.06em;white-space:nowrap">${SPEC_ICON.SKU}SKU</th>
          <th style="padding:7px 9px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.06em;white-space:nowrap">${SPEC_ICON.Barcode}Barcode</th>
          <th style="padding:7px 9px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.06em;white-space:nowrap">${SPEC_ICON.Dimensions}Dimensions</th>
          <th style="padding:7px 9px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.06em;white-space:nowrap">${SPEC_ICON.Weight}Weight</th>
        </tr></thead>
        <tbody>${variantRows}</tbody>
      </table></div>` : ""}

    <div style="background:${NAVY};color:#cbd5e1;padding:6mm 14mm;font-size:9px;letter-spacing:.04em;margin-top:6mm">Coolkidz Australia | New Product Submission${brand ? " | " + esc(brand) : ""}${created ? " | " + esc(created) : ""}</div>
    <script>window.onload=function(){window.print()}</script>
  </body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
