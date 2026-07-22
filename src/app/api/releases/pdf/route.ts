import { getAccess } from "@/lib/access";
import { buildReleasePdf } from "@/lib/releasePdf";

// Admin-only: on-demand PDF for a release. Unsigned releases get a printable
// copy with a blank signature block; signed ones get the full signed render.
export const revalidate = 0;
export const maxDuration = 60;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = { apikey: sbKey!, Authorization: `Bearer ${sbKey}` };

export async function GET(req: Request) {
  if ((await getAccess()).role !== "admin") return new Response("Admins only", { status: 403 });
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Bad id", { status: 400 });
  const res = await fetch(`${sbUrl}/rest/v1/media_releases?id=eq.${id}&limit=1`, { headers: h, cache: "no-store" });
  const r = (await res.json().catch(() => []))[0];
  if (!r) return new Response("Not found", { status: 404 });

  let sig: Uint8Array | null = null;
  if (r.status === "signed" && r.signature_image_path) {
    const s = await fetch(`${sbUrl}/storage/v1/object/media-releases/${r.signature_image_path}`, { headers: h });
    if (s.ok) sig = new Uint8Array(await s.arrayBuffer());
  }
  const logo = await fetch("https://marketing.coolkidz.com.au/logos/coolkidz-logo.png")
    .then(x => (x.ok ? x.arrayBuffer() : null)).then(b => (b ? new Uint8Array(b) : null)).catch(() => null);
  const pdf = await buildReleasePdf(r, sig, logo);
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Coolkidz-media-release-${(r.child_first_name || "child").replace(/[^\w-]/g, "")}.pdf"`,
    },
  });
}
