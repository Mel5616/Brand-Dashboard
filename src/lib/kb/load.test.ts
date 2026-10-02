import { test } from "node:test";
import assert from "node:assert/strict";
import { websiteRows, seedRows, sqlUpsert, sqlCorrects, dbRow } from "./load.ts";
import { websiteKey } from "./core.ts";

test("websiteRows keeps text byte-for-byte and the file order", () => {
  const faq = [{ topic: "Vista V3", q: " Q1? ", a: "A1.\n\nLine", link: "/x" }, { topic: "Cruz", q: "Q2?", a: "A2." }];
  const rows = websiteRows("uppababy", faq);
  assert.equal(rows[0].question, " Q1? ");
  assert.equal(rows[0].answer, "A1.\n\nLine");
  assert.equal(rows[1].link, null);
  assert.deepEqual(rows.map(r => r.sort_order), [0, 1]);
  assert.equal(rows[0].ext_key, websiteKey("Vista V3", " Q1? "));
  assert.equal(rows[0].status, "approved");
  assert.equal(rows[0].source, "website");
});

test("seedRows takes the sort position of the corrected website entry and flags customer details", () => {
  const key = websiteKey("Vista V3", "Can I fold with the seat on?");
  const { rows, problems } = seedRows("uppababy", [
    { ext_key: "fact:fold", topic: "Vista V3", question: "Can I fold with the seat on?", answer: "Yes, facing forward.", source: "confirmed", source_ref: "David 1 Oct 2026",
      corrects_question: { topic: "Vista V3", q: "Can I fold with the seat on?" }, status: "approved", decided_by: "david@coolkidz.com.au", decided_reason: "confirmed" },
    { ext_key: "fact:bad", topic: "T", question: "Q", answer: "Email me at a@b.com", source: "confirmed", source_ref: "x", status: "approved", decided_by: "d", decided_reason: "r" },
  ], new Map([[key, 42]]));
  assert.equal(rows[0].sort_order, 42);
  assert.equal(rows[0].corrects_key, key);
  assert.equal(rows.length, 1);
  assert.match(problems[0], /fact:bad.*email/);
});

test("sqlLiteral keeps quotes, $, newlines and an em dash byte-for-byte between unique dollar tags", async () => {
  const { sqlLiteral } = await import("./load.ts");
  const cases = [
    "It's \"fine\" at $1,799 — really.\n\nLine two\r\n",
    "Contains $kb$ already, and costs $5",
    "Ends with $kb",
    "",
  ];
  for (const text of cases) {
    const lit = sqlLiteral(text);
    const tag = lit.match(/^\$[A-Za-z0-9_]*\$/)![0];
    assert.ok(lit.endsWith(tag), "closes with the same tag");
    assert.equal(lit.slice(tag.length, lit.length - tag.length), text);
    // Postgres ends the string at the first closing tag after the opening one: it must be the final one.
    assert.equal(lit.indexOf(tag, tag.length), lit.length - tag.length);
  }
  assert.equal(sqlLiteral(null), "NULL");
});

test("sqlTextArray builds a text[] expression", async () => {
  const { sqlTextArray } = await import("./load.ts");
  assert.equal(sqlTextArray([]), "'{}'::text[]");
  assert.equal(sqlTextArray(["Vista V3", "Mesa"]), "array[$kb$Vista V3$kb$, $kb$Mesa$kb$]::text[]");
});

test("sqlUpsert for website rows only refreshes the text columns on conflict", () => {
  const rows = websiteRows("uppababy", [{ topic: "T", q: "Q?", a: "A." }]);
  const sql = sqlUpsert(rows, "website");
  assert.ok(sql.startsWith("insert into public.kb_entries (brand, topic, models, question, answer, link, source, source_ref, ext_key, sort_order, status, decided_by, decided_reason) values\n"));
  assert.ok(sql.endsWith(
    "\non conflict (brand, ext_key) do update set topic = excluded.topic, question = excluded.question, answer = excluded.answer, " +
    "link = excluded.link, source_ref = excluded.source_ref, sort_order = excluded.sort_order\n" +
    "where (kb_entries.topic, kb_entries.question, kb_entries.answer, kb_entries.link, kb_entries.source_ref, kb_entries.sort_order) " +
    "is distinct from (excluded.topic, excluded.question, excluded.answer, excluded.link, excluded.source_ref, excluded.sort_order);\n"));
  for (const c of ["status =", "decided_by =", "decided_reason =", "corrects ="]) assert.equal(sql.includes(c), false, c);
});

test("sqlUpsert for seed rows does nothing on conflict", () => {
  const { rows } = seedRows("uppababy", [{ ext_key: "fact:x", topic: "T", question: "Q", answer: "A", source: "confirmed", source_ref: "r",
    status: "approved", decided_by: "d", decided_reason: "r" }], new Map());
  const sql = sqlUpsert(rows, "seed");
  assert.ok(sql.endsWith("\non conflict (brand, ext_key) do nothing;\n"));
  assert.equal(sql.includes("do update"), false);
});

test("sqlCorrects only fills corrects that are still empty", () => {
  const key = websiteKey("T", "Q");
  const { rows } = seedRows("uppababy", [{ ext_key: "fact:x", topic: "T", question: "Q", answer: "A", source: "confirmed", source_ref: "r",
    corrects_question: { topic: "T", q: "Q" }, status: "approved", decided_by: "d", decided_reason: "r" }], new Map([[key, 3]]));
  const sql = sqlCorrects("uppababy", rows);
  assert.ok(sql.endsWith("where s.brand = $kb$uppababy$kb$ and s.ext_key = v.seed_key and s.corrects is null;\n"));
});

test("dbRow drops corrects_key and keeps the other columns", () => {
  const { rows } = seedRows("uppababy", [{ ext_key: "fact:x", topic: "T", question: "Q", answer: "A", source: "confirmed", source_ref: "r",
    corrects_question: { topic: "T", q: "Q" }, status: "approved", decided_by: "d", decided_reason: "r" }], new Map());
  const r = dbRow(rows[0]);
  assert.equal("corrects_key" in r, false);
  assert.equal(r.ext_key, "fact:x");
  assert.equal(rows[0].corrects_key, websiteKey("T", "Q"));
});
