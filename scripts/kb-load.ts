// Load the UPPAbaby knowledge base: website answers from src/data/uppababy-knowledge.json, then seeds.
// Usage: node scripts/kb-load.ts [--dry-run]   (needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)
import { readFileSync } from "node:fs";
import { websiteRows, seedRows, type SeedEntry } from "../src/lib/kb/load.ts";

const BRAND = "uppababy";
const dry = process.argv.includes("--dry-run");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!dry && (!url || !key)) { console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
const H = { apikey: key!, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

const faq = JSON.parse(readFileSync("src/data/uppababy-knowledge.json", "utf8")).faq;
const web = websiteRows(BRAND, faq);
const keyToSort = new Map(web.map(r => [r.ext_key, r.sort_order]));
const seeds: SeedEntry[] = ["data/kb-seed/uppababy-confirmed.json", "data/kb-seed/uppababy-help-centre.json"]
  .flatMap(f => JSON.parse(readFileSync(f, "utf8")).entries);
const { rows: seeded, problems } = seedRows(BRAND, seeds, keyToSort);
const dupes = web.length - keyToSort.size;
const missing = seeded.filter(r => r.corrects_key && !keyToSort.has(r.corrects_key)).map(r => r.ext_key);
console.log(`website ${web.length} (duplicate keys ${dupes}), seeds ${seeded.length}, rejected ${problems.length}, corrections pointing nowhere ${missing.length}`);
problems.forEach(p => console.log("  rejected:", p));
missing.forEach(k => console.log("  correction target not found:", k));
if (dupes || missing.length) { console.error("Fix duplicates or correction targets first"); process.exit(1); }
if (dry) process.exit(0);

async function upsert(rows: object[]) {
  for (let i = 0; i < rows.length; i += 200) {
    const res = await fetch(`${url}/rest/v1/kb_entries?on_conflict=brand,ext_key`, {
      method: "POST", headers: { ...H, Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(rows.slice(i, i + 200)) });
    if (!res.ok) throw new Error(`upsert ${res.status}: ${await res.text()}`);
  }
}
await upsert(web);
await upsert(seeded.map(({ corrects_key, ...r }) => r));
// Resolve corrects: seed ext_key -> website id
const ids = await (await fetch(`${url}/rest/v1/kb_entries?select=id,ext_key&brand=eq.${BRAND}`, { headers: H })).json() as { id: number; ext_key: string }[];
const idOf = new Map(ids.map(r => [r.ext_key, r.id]));
for (const r of seeded) {
  if (!r.corrects_key) continue;
  const res = await fetch(`${url}/rest/v1/kb_entries?brand=eq.${BRAND}&ext_key=eq.${encodeURIComponent(r.ext_key)}`, {
    method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify({ corrects: idOf.get(r.corrects_key) }) });
  if (!res.ok) throw new Error(`corrects ${r.ext_key}: ${res.status}`);
}
console.log("loaded");
