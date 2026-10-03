import { getAccess } from "@/lib/access";

export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b: Uint8Array) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

// All of a draft's slide images as one zip (store-only, PNGs don't compress).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const acc = await getAccess();
  const ok = acc.role === "admin" || ["alison@coolkidz.com.au"].includes((acc.user?.email ?? "").toLowerCase());
  if (!ok) return new Response("No access", { status: 403 });
  const { id } = await params;
  const d = (await fetch(`${sbUrl}/rest/v1/social_drafts?select=images,image_url&id=eq.${encodeURIComponent(id)}`, { headers: { apikey: sbKey!, Authorization: `Bearer ${sbKey}` }, cache: "no-store" }).then(r => r.json()).catch(() => []))[0];
  const urls: string[] = (Array.isArray(d?.images) && d.images.length ? d.images : d?.image_url ? [d.image_url] : []) as string[];
  if (!urls.length) return new Response("No images", { status: 404 });

  const files = await Promise.all(urls.map(async (u, i) => ({ name: `slide-${i + 1}.png`, data: new Uint8Array(await (await fetch(u)).arrayBuffer()) })));
  const parts: Uint8Array[] = []; const central: Uint8Array[] = []; let offset = 0;
  const enc = new TextEncoder();
  for (const f of files) {
    const name = enc.encode(f.name); const crc = crc32(f.data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint32(14, crc, true); lh.setUint32(18, f.data.length, true); lh.setUint32(22, f.data.length, true); lh.setUint16(26, name.length, true);
    parts.push(new Uint8Array(lh.buffer), name, f.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint32(16, crc, true); ch.setUint32(20, f.data.length, true); ch.setUint32(24, f.data.length, true); ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + f.data.length;
  }
  const cdSize = central.reduce((s, b) => s + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, b) => s + b.length, 0)); let p = 0; for (const b of all) { out.set(b, p); p += b.length; }
  return new Response(out, { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="social-${id.slice(0, 8)}.zip"` } });
}
