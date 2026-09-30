import { test } from "node:test";
import assert from "node:assert/strict";
import { websiteRows, seedRows } from "./load.ts";
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
  assert.equal((rows[0] as any).corrects_key, key);
  assert.equal(rows.length, 1);
  assert.match(problems[0], /fact:bad.*email/);
});
