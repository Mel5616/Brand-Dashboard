import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Channel sales (wider business, uploaded monthly as XLSX). Admin-only writes.
// Rows: month_key, brand, customer_group, register, value, is_online.
// A POST replaces all rows for the month_keys it carries (re-upload overwrites).

export const revalidate = 0;

const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function headers(extra: Record<string, string> = {}) {
  return { apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra };
}
function isMissingTable(status: number, body: string) {
  return status === 404 || /PGRST205|does not exist|schema cache/i.test(body);
}

export async function GET() {
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false, items: [] }, { status: 500 });
  const res = await fetch(`${sbUrl}/rest/v1/channel_sales?select=*`, { headers: headers(), cache: "no-store" });
  const text = await res.text();
  if (!res.ok) {
    if (isMissingTable(res.status, text)) return NextResponse.json({ ok: false, needsSetup: true, items: [] });
    return NextResponse.json({ ok: false, items: [] }, { status: 500 });
  }
  return NextResponse.json({ ok: true, items: JSON.parse(text || "[]") });
}

export async function POST(req: Request) {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, message: "Admins only" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const rows: any[] = Array.isArray(b.rows) ? b.rows : [];
  if (!rows.length) return NextResponse.json({ ok: false, message: "No rows" }, { status: 400 });
  const months = [...new Set(rows.map(r => r.month_key))];

  // Replace the months this upload covers
  const del = await fetch(`${sbUrl}/rest/v1/channel_sales?month_key=in.(${months.map(m => `"${m}"`).join(",")})`, { method: "DELETE", headers: headers() });
  if (!del.ok) {
    const t = await del.text();
    return NextResponse.json({ ok: false, needsSetup: isMissingTable(del.status, t), message: "Delete failed" }, { status: 500 });
  }
  // Insert in chunks
  for (let i = 0; i < rows.length; i += 500) {
    const res = await fetch(`${sbUrl}/rest/v1/channel_sales`, { method: "POST", headers: headers(), body: JSON.stringify(rows.slice(i, i + 500)) });
    if (!res.ok) {
      const t = await res.text();
      return NextResponse.json({ ok: false, needsSetup: isMissingTable(res.status, t), message: t.slice(0, 200) }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true, inserted: rows.length, months });
}
