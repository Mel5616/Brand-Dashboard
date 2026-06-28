import { getAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

export const revalidate = 0;

const esc = (s = "") => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const C = { ink: "#0B1530", navy: "#11224A", cream: "#F5F1E8", paper: "#FBF9F3", sand: "#C9A24B", line: "#E2DBCB", must: "#B43A3A", check: "#B5852A" };

// Print-ready brief that matches the on-screen preview card. A route handler so it
// owns the whole document and prints clean to A4. The lead saves as PDF from the browser.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAccess()).role) return new Response("Unauthorised", { status: 401 });
  const { id } = await params;
  const sb = await createClient();
  const { data: brief } = await sb.from("briefs").select("*, brand_profiles(name, tier, profile)").eq("id", id).single();
  if (!brief) return new Response("Not found", { status: 404 });
  const brand = (brief as any).brand_profiles;
  const cname = (cid: string) => (brand?.profile?.channels?.find((c: any) => c.id === cid)?.name) || cid;

  const lbl = (t: string) => `<div style="font-size:11px;text-transform:uppercase;letter-spacing:.15em;opacity:.5">${esc(t)}</div>`;
  const field = (label: string, val: string) => `<div style="margin-top:14px">${lbl(label)}<div style="margin-top:3px;line-height:1.5">${esc(val)}</div></div>`;

  const deliv = (brief.deliverables || []).map((d: any) =>
    `<div style="border:1px solid ${C.line};background:${C.paper};border-radius:8px;padding:12px 14px;margin-top:6px">
      <div style="font-weight:600;color:${C.navy}">${esc(cname(d.id))}</div>
      <div style="font-size:12px;opacity:.6;margin-top:1px">${esc(d.presets)}</div>
      <div style="margin-top:6px"><span style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;opacity:.5">Copy. </span>${esc(d.copy_direction)}</div>
      <div style="margin-top:2px"><span style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;opacity:.5">Visual. </span>${esc(d.visual_direction)}</div>
    </div>`).join("");

  const mand = (brief.mandatory || []).map((m: string) =>
    `<li style="display:flex;gap:8px;margin-top:4px;list-style:none"><span style="color:${C.sand}">+</span><span>${esc(m)}</span></li>`).join("");

  const flags = (brief.compliance_flags || []).map((f: any) =>
    `<div style="display:flex;gap:8px;font-size:12px;margin-top:6px">
      <span style="background:${f.level === "must" ? C.must : C.check};color:#fff;padding:2px 6px;border-radius:4px;text-transform:uppercase;height:fit-content;white-space:nowrap">${esc(f.level)}</span>
      <span>${esc(f.note)}</span>
    </div>`).join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(brief.title)}</title><style>
    @page { size: A4; margin: 14mm; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, -apple-system, sans-serif; color: ${C.ink}; background: ${C.paper}; }
    .card { max-width: 760px; margin: 0 auto; border: 1px solid ${C.line}; border-radius: 10px; overflow: hidden; background: #fff; }
    .serif { font-family: Georgia, "Times New Roman", serif; }
    h1 { margin: 4px 0 0; font-size: 26px; }
    ul { margin: 6px 0 0; padding: 0; }
  </style></head><body>
    <div class="card">
      <div style="background:${C.navy};color:${C.cream};padding:18px 22px">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.18em;color:${C.sand}">${esc(brief.moment)}</div>
        <h1 class="serif">${esc(brief.title)}</h1>
        <div style="font-size:12px;margin-top:8px;opacity:.85">${esc(brand.name)} &middot; Tier ${esc(brand.tier)} &middot; ${esc(brief.pillar)}</div>
      </div>
      <div style="padding:18px 22px">
        ${field("Concept", brief.concept || "")}
        ${field("Key message", brief.key_message || "")}
        ${field("Audience angle", brief.audience_note || "")}
        <div style="margin-top:16px">${lbl("Channel deliverables")}${deliv}</div>
        <div style="margin-top:16px">${lbl("Mandatory inclusions")}<ul>${mand}</ul></div>
        <div style="margin-top:16px;border:1px solid ${C.must};background:#FBF1F1;border-radius:8px;padding:12px 14px">
          ${lbl("Compliance flags")}${flags}
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12px;opacity:.7;margin-top:16px">
          <span>Owner: ${esc(brief.owner || "Unassigned")}</span><span>Due: ${esc(brief.due_date || "Not set")}</span>
        </div>
      </div>
    </div>
    <script>window.onload=function(){window.print()}</script>
  </body></html>`;

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
