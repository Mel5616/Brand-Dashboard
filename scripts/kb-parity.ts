// Parity check: the WRITTEN ANSWERS block built from the knowledge file must be byte-identical to the one
// built by the database-mode code path (website rows -> chooseEntriesForChat -> formatWrittenAnswers), and
// to the one the database would produce from its approved website rows.
// Usage: node scripts/kb-parity.ts                    (prints the file md5 and the SQL to run in the database)
//        node scripts/kb-parity.ts --db-md5 <hash>    (compares the database result with the file md5)
// No secrets needed. Exit 0 = identical.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileWrittenAnswers, formatWrittenAnswers, chooseEntriesForChat, type KbEntry } from "../src/lib/kb/core.ts";
import { websiteRows } from "../src/lib/kb/load.ts";

const faq = JSON.parse(readFileSync("src/data/uppababy-knowledge.json", "utf8")).faq;
const rows: KbEntry[] = websiteRows("uppababy", faq).map((r, i) => ({
  id: i + 1, brand: r.brand, topic: r.topic, models: r.models, question: r.question, answer: r.answer, link: r.link,
  source: "website", source_ref: r.source_ref, ext_key: r.ext_key, sort_order: r.sort_order, corrects: null,
  status: "approved", decided_by: r.decided_by, decided_reason: r.decided_reason, updated_at: "2026-01-01T00:00:00Z",
}));
const a = fileWrittenAnswers(faq), b = formatWrittenAnswers(chooseEntriesForChat(rows));
if (a !== b) {
  let i = 0; while (i < a.length && a[i] === b[i]) i++;
  console.log(`PARITY FAILED at char ${i}\nfile: ${JSON.stringify(a.slice(Math.max(0, i - 80), i + 80))}\ndb path: ${JSON.stringify(b.slice(Math.max(0, i - 80), i + 80))}`);
  process.exit(1);
}
const md5 = createHash("md5").update(a, "utf8").digest("hex");

const at = process.argv.indexOf("--db-md5");
if (at > -1) {
  const dbMd5 = (process.argv[at + 1] || "").trim().toLowerCase();
  if (dbMd5 === md5) { console.log(`PARITY OK: ${a.length} chars`); process.exit(0); }
  console.log(`PARITY FAILED: file ${md5} db ${dbMd5}`);
  process.exit(1);
}
console.log(`file path and database code path agree: ${a.length} chars`);
console.log(`md5 of the file WRITTEN ANSWERS: ${md5}`);
console.log("Run this in the database, then rerun with --db-md5 <result>:");
console.log(`select md5('WRITTEN ANSWERS' || chr(10) || string_agg('[' || topic || '] Q: ' || question || chr(10) || 'A: ' || answer || case when coalesce(link,'') <> '' then chr(10) || 'More: ' || link else '' end, chr(10) || chr(10) order by sort_order, id)) as md5 from public.kb_entries where brand='uppababy' and source='website' and status='approved';`);
