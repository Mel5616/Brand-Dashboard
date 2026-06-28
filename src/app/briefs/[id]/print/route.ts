import { getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

export const revalidate = 0;

const esc = (s = "") => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Print-ready A4 brief. A route handler (not a page) so it owns the whole document
// and prints clean. The lead saves as PDF from the browser.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAccess()).role) return new Response("Unauthorised", { status: 401 });
  const { id } = await params;
  const sb = await createClient();
  const { data: brief } = await sb.from("briefs").select("*, brand_profiles(name, tier)").eq("id", id).single();
  if (!brief) return new Response("Not found", { status: 404 });
  const brand = (brief as any).brand_profiles;

  const deliv = (brief.deliverables || []).map((d: any) =>
    `<div class="block"><strong>${esc(d.id)}</strong> <span style="opacity:.6">${esc(d.presets)}</span><br/>${esc(d.copy_direction)} ${esc(d.visual_direction)}</div>`).join("");
  const mand = (brief.mandatory || []).map((m: string) => `<li>${esc(m)}</li>`).join("");
  const flags = (brief.compliance_flags || []).map((f: any) =>
    `<li class="${f.level === "must" ? "flag-must" : "flag-check"}"><strong>${esc(f.level.toUpperCase())}:</strong> ${esc(f.note)}</li>`).join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(brief.title)}</title><style>
    @page { size: A4; margin: 18mm; }
    body { font-family: Georgia, serif; color: #0B1530; }
    .meta { font-family: system-ui, sans-serif; }
    h1 { color: #11224A; margin: 4px 0 8px; }
    .sand { color: #C9A24B; letter-spacing: .15em; text-transform: uppercase; font-size: 11px; }
    .flag-must { color: #B43A3A; } .flag-check { color: #B5852A; }
    .block { border: 1px solid #E2DBCB; padding: 10px 14px; border-radius: 6px; margin: 8px 0; }
    h3 { margin: 16px 0 6px; }
  </style></head><body>
    <div class="sand">${esc(brand.name)} · Tier ${esc(brand.tier)} · ${esc(brief.moment)}</div>
    <h1>${esc(brief.title)}</h1>
    <p>${esc(brief.concept)}</p>
    <div class="meta">
      <div class="block"><strong>Key message.</strong> ${esc(brief.key_message)}</div>
      <div class="block"><strong>Audience.</strong> ${esc(brief.audience_note)}</div>
      <h3>Channel deliverables</h3>${deliv}
      <h3>Mandatory inclusions</h3><ul>${mand}</ul>
      <h3>Compliance flags</h3><ul>${flags}</ul>
      <p style="opacity:.6;font-size:12px">Owner: ${esc(brief.owner || "Unassigned")} · Due: ${esc(brief.due_date || "Not set")}</p>
    </div>
    <script>window.onload=function(){window.print()}</script>
  </body></html>`;

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
