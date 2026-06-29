import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";

// Pull monthly marketing budgets + actuals from the planning Google Sheet
// (Brand, Date, Type, Channel, Value) into marketing_monthly. Admin, on-demand.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SHEET_CSV = "https://docs.google.com/spreadsheets/d/12efjpdRQZ2M1-_nG9zSAgF72JPivwYqpcd4JglM_f2U/export?format=csv";
const hdr = (extra: Record<string, string> = {}) => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", ...extra });
const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const KIND: Record<string, string> = { budget: "budget", expenses: "actual" };

function parseCSV(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ""));
}
function monthKey(date: string): string | null {
  const m = date.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);   // d/m/yyyy
  if (!m) return null;
  return `${m[3]}-${String(Number(m[2])).padStart(2, "0")}`;
}

export async function POST() {
  if ((await getAccess()).role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!sbUrl || !sbKey) return NextResponse.json({ ok: false }, { status: 500 });

  let csv: string;
  try { csv = await fetch(SHEET_CSV, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store", redirect: "follow" }).then(r => r.text()); }
  catch { return NextResponse.json({ ok: false, error: "Couldn't fetch the sheet." }, { status: 502 }); }

  const rows = parseCSV(csv);
  if (rows.length < 2) return NextResponse.json({ ok: false, error: "Sheet looks empty." }, { status: 400 });
  const head = rows[0].map(h => h.trim().toLowerCase());
  const ci = (n: string) => head.indexOf(n);
  const [bi, di, ti, chi, vi] = [ci("brand"), ci("date"), ci("type"), ci("channel"), ci("value")];
  if ([bi, di, ti, chi, vi].some(x => x < 0)) return NextResponse.json({ ok: false, error: `Expected Brand/Date/Type/Channel/Value columns, got: ${rows[0].join(", ")}` }, { status: 400 });

  const brands = await fetch(`${sbUrl}/rest/v1/brands?select=id,name`, { headers: hdr(), cache: "no-store" }).then(r => r.json()).catch(() => []);
  const idFor = (name: string) => { const n = norm(name); const h = brands.find((x: any) => { const bn = norm(x.name); return bn === n || bn.startsWith(n) || n.startsWith(bn); }); return h ? h.id : null; };

  const out: any[] = []; const unmatched = new Set<string>();
  for (const r of rows.slice(1)) {
    const kind = KIND[(r[ti] || "").trim().toLowerCase()];
    if (!kind) continue;                                  // skip Income etc.
    const mk = monthKey(r[di] || "");
    const bid = idFor(r[bi] || "");
    const channel = (r[chi] || "").trim();
    const value = Number((r[vi] || "").replace(/[^0-9.\-]/g, ""));
    if (!mk || !channel) continue;
    if (bid == null) { if (r[bi]) unmatched.add(r[bi]); continue; }
    if (!Number.isFinite(value)) continue;
    out.push({ brand_id: bid, month_key: mk, channel, kind, value, source: "sheet" });
  }
  if (out.length === 0) return NextResponse.json({ ok: false, error: "No Budget/Expenses rows parsed." }, { status: 400 });

  // Replace all sheet-sourced rows, then insert.
  await fetch(`${sbUrl}/rest/v1/marketing_monthly?source=eq.sheet`, { method: "DELETE", headers: hdr({ Prefer: "return=minimal" }) }).catch(() => {});
  for (let i = 0; i < out.length; i += 300) {
    const res = await fetch(`${sbUrl}/rest/v1/marketing_monthly?on_conflict=brand_id,month_key,channel,kind`, { method: "POST", headers: hdr({ Prefer: "resolution=merge-duplicates,return=minimal" }), body: JSON.stringify(out.slice(i, i + 300)) });
    if (!res.ok) { const t = await res.text(); return NextResponse.json({ ok: false, needsSetup: /PGRST205|does not exist/i.test(t), error: (t || "Load failed").slice(0, 300) }, { status: 500 }); }
  }
  return NextResponse.json({ ok: true, count: out.length, unmatched: [...unmatched] });
}
