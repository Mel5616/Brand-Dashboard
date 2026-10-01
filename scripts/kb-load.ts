// Load the UPPAbaby knowledge base: website answers from src/data/uppababy-knowledge.json, then seeds.
// Safe to re-run: new rows are added in full; existing website rows get only their text refreshed
// (topic, question, answer, link, source_ref, sort_order); existing seed rows are left alone; corrects
// is only filled where it is still empty. Approvals, edits and corrections are never changed.
// Usage: node scripts/kb-load.ts [--dry-run]   (needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)
//        node scripts/kb-load.ts --sql <dir>   (no secrets: writes SQL files to <dir> to apply in name order)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { websiteRows, seedRows, sqlUpsert, sqlCorrects, dbRow, WEBSITE_TEXT_COLS, type SeedEntry, type Row } from "../src/lib/kb/load.ts";
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
  const batches = (prefix: string, rows: Row[], kind: "website" | "seed") => {
    for (let i = 0, n = 1; i < rows.length; i += 100, n++) {
      const f = `${sqlDir}/${prefix}-${String(n).padStart(2, "0")}.sql`;
      writeFileSync(f, sqlUpsert(rows.slice(i, i + 100), kind)); files.push(f);
    }
  };
  batches("01-website", web, "website");
  batches("02-seeds", seeded, "seed");
  writeFileSync(`${sqlDir}/03-corrects.sql`, sqlCorrects(BRAND, seeded)); files.push(`${sqlDir}/03-corrects.sql`);
  const md5 = createHash("md5").update(fileWrittenAnswers(faq), "utf8").digest("hex");
  console.log(`rows: website ${web.length}, seeds ${seeded.length}, corrections ${seeded.filter(r => r.corrects_key).length}`);
  console.log(`md5 of fileWrittenAnswers(faq): ${md5}`);
  files.forEach(f => console.log("  wrote", f));
  process.exit(0);
}

// REST mode. PostgREST cannot update only some columns on conflict, so: read what is there, insert
// the rows that are new (ignore-duplicates), PATCH the text columns of website rows whose text changed,
// then fill corrects where it is still empty. Pages through the table (PostgREST caps each read at 1000 rows).
type Existing = { id: number; ext_key: string; corrects: number | null } & Record<string, unknown>;
async function existingRows(): Promise<Existing[]> {
  const out: Existing[] = [];
  const cols = ["id", "ext_key", "corrects", ...WEBSITE_TEXT_COLS].join(",");
  for (let from = 0; ; from += 1000) {
    const res = await fetch(`${url}/rest/v1/kb_entries?select=${cols}&brand=eq.${BRAND}&order=id.asc&limit=1000&offset=${from}`, { headers: H });
    if (!res.ok) throw new Error(`read ${res.status}: ${await res.text()}`);
    const page = await res.json() as Existing[];
    out.push(...page);
    if (page.length < 1000) return out;
  }
}
const before = new Map((await existingRows()).map(r => [r.ext_key, r]));
const fresh = [...web, ...seeded].filter(r => !before.has(r.ext_key)).map(dbRow);
for (let i = 0; i < fresh.length; i += 200) {
  const res = await fetch(`${url}/rest/v1/kb_entries?on_conflict=brand,ext_key`, {
    method: "POST", headers: { ...H, Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify(fresh.slice(i, i + 200)) });
  if (!res.ok) throw new Error(`insert ${res.status}: ${await res.text()}`);
}
let refreshed = 0;
for (const r of web) {
  const cur = before.get(r.ext_key);
  if (!cur || WEBSITE_TEXT_COLS.every(c => cur[c] === r[c])) continue;
  const text = Object.fromEntries(WEBSITE_TEXT_COLS.map(c => [c, r[c]]));
  const res = await fetch(`${url}/rest/v1/kb_entries?brand=eq.${BRAND}&ext_key=eq.${encodeURIComponent(r.ext_key)}`, {
    method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify(text) });
  if (!res.ok) throw new Error(`refresh ${r.ext_key}: ${res.status}`);
  refreshed++;
}
// Resolve corrects: seed ext_key -> website id, only where corrects is still empty.
const after = new Map((await existingRows()).map(r => [r.ext_key, r]));
for (const r of seeded) {
  if (!r.corrects_key || after.get(r.ext_key)?.corrects != null) continue;
  const res = await fetch(`${url}/rest/v1/kb_entries?brand=eq.${BRAND}&ext_key=eq.${encodeURIComponent(r.ext_key)}`, {
    method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify({ corrects: after.get(r.corrects_key)?.id }) });
  if (!res.ok) throw new Error(`corrects ${r.ext_key}: ${res.status}`);
}
console.log(`loaded: ${fresh.length} new rows, ${refreshed} website answers refreshed`);
