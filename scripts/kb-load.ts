// Load the UPPAbaby knowledge base: website answers from src/data/uppababy-knowledge.json, then seeds.
// Usage: node scripts/kb-load.ts [--dry-run]   (needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)
//        node scripts/kb-load.ts --sql <dir>   (no secrets: writes SQL files to <dir> to apply in name order)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { websiteRows, seedRows, sqlUpsert, sqlCorrects, type SeedEntry, type Row } from "../src/lib/kb/load.ts";
import { fileWrittenAnswers } from "../src/lib/kb/core.ts";

const BRAND = "uppababy";
const dry = process.argv.includes("--dry-run");
const sqlAt = process.argv.indexOf("--sql"), sqlDir = sqlAt > -1 ? process.argv[sqlAt + 1] : null;
if (sqlAt > -1 && !sqlDir) { console.error("--sql needs a directory"); process.exit(1); }
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!dry && !sqlDir && (!url || !key)) { console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
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

if (sqlDir) {
  mkdirSync(sqlDir, { recursive: true });
  const files: string[] = [];
  const batches = (prefix: string, rows: Row[]) => {
    for (let i = 0, n = 1; i < rows.length; i += 100, n++) {
      const f = `${sqlDir}/${prefix}-${String(n).padStart(2, "0")}.sql`;
      writeFileSync(f, sqlUpsert(rows.slice(i, i + 100))); files.push(f);
    }
  };
  batches("01-website", web);
  batches("02-seeds", seeded.map(({ corrects_key, ...r }) => r));
  writeFileSync(`${sqlDir}/03-corrects.sql`, sqlCorrects(BRAND, seeded)); files.push(`${sqlDir}/03-corrects.sql`);
  const md5 = createHash("md5").update(fileWrittenAnswers(faq), "utf8").digest("hex");
  console.log(`rows: website ${web.length}, seeds ${seeded.length}, corrections ${seeded.filter(r => r.corrects_key).length}`);
  console.log(`md5 of fileWrittenAnswers(faq): ${md5}`);
  files.forEach(f => console.log("  wrote", f));
  process.exit(0);
}

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
