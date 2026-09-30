import { test } from "node:test";
import assert from "node:assert/strict";
import { websiteKey, formatWrittenAnswers, fileWrittenAnswers, chooseEntriesForChat, customerDetailProblem, type KbEntry } from "./core.ts";

const entry = (over: Partial<KbEntry>): KbEntry => ({
  id: 1, brand: "uppababy", topic: "Vista V3", models: [], question: "Q?", answer: "A.", link: null,
  source: "website", source_ref: null, ext_key: "k", sort_order: 0, corrects: null, status: "approved",
  decided_by: null, decided_reason: null, updated_at: "2026-10-01T00:00:00Z", ...over,
});

test("websiteKey is stable, 16 hex chars, and ignores case and spacing", () => {
  const a = websiteKey("Vista V3", "Can I use the Vista V3 from birth?");
  assert.match(a, /^[0-9a-f]{16}$/);
  assert.equal(a, websiteKey("vista v3", "  Can I use the   Vista V3 from birth? "));
  assert.notEqual(a, websiteKey("Cruz V3", "Can I use the Vista V3 from birth?"));
});

test("fileWrittenAnswers matches the chat route's current format exactly", () => {
  const faq = [
    { topic: "Vista V3", q: "Q1?", a: "A1.", link: "/products/x" },
    { topic: "Warranty", q: "Q2?", a: "A2." },
    { topic: "Warranty", q: "Q3?", a: "A3.", link: "" },
    { topic: "Warranty", q: "Q4?", a: "A4.", link: null },
  ];
  // Same expression as src/app/api/uppababy-chat/route.ts today
  const today = `WRITTEN ANSWERS\n${faq.map((f: any) => `[${f.topic}] Q: ${f.q}\nA: ${f.a}${f.link ? `\nMore: ${f.link}` : ""}`).join("\n\n")}`;
  assert.equal(fileWrittenAnswers(faq), today);
});

test("formatWrittenAnswers on entries equals fileWrittenAnswers on the same data", () => {
  const faq = [{ topic: "T", q: "Q?", a: "A.", link: "/l" }, { topic: "T", q: "Q2?", a: "A2." }];
  const items = faq.map(f => ({ topic: f.topic, question: f.q, answer: f.a, link: f.link ?? null }));
  assert.equal(formatWrittenAnswers(items), fileWrittenAnswers(faq));
});

test("chooseEntriesForChat keeps only approved entries, in sort_order", () => {
  const out = chooseEntriesForChat([
    entry({ id: 1, sort_order: 2, question: "b" }),
    entry({ id: 2, sort_order: 1, question: "a" }),
    entry({ id: 3, sort_order: 3, status: "draft" }),
    entry({ id: 4, sort_order: 4, status: "retired" }),
    entry({ id: 5, sort_order: 5, status: "needs_review" }),
  ]);
  assert.deepEqual(out.map(e => e.id), [2, 1]);
});

test("a correction replaces the website entry in its position", () => {
  const out = chooseEntriesForChat([
    entry({ id: 1, sort_order: 0, question: "first" }),
    entry({ id: 2, sort_order: 1, question: "wrong", source: "website" }),
    entry({ id: 3, sort_order: 2, question: "third" }),
    entry({ id: 10, sort_order: 900, question: "right", source: "confirmed", corrects: 2 }),
  ]);
  assert.deepEqual(out.map(e => e.question), ["first", "right", "third"]);
});

test("two corrections of the same entry: higher precedence wins, then most recent", () => {
  const base = [entry({ id: 2, sort_order: 1, source: "website" })];
  const byPrecedence = chooseEntriesForChat([...base,
    entry({ id: 10, source: "helpdesk", corrects: 2, question: "helpdesk", updated_at: "2026-10-05T00:00:00Z" }),
    entry({ id: 11, source: "confirmed", corrects: 2, question: "confirmed", updated_at: "2026-10-01T00:00:00Z" })]);
  assert.deepEqual(byPrecedence.map(e => e.question), ["confirmed"]);
  const byDate = chooseEntriesForChat([...base,
    entry({ id: 10, source: "help_centre", corrects: 2, question: "older", updated_at: "2026-10-01T00:00:00Z" }),
    entry({ id: 11, source: "help_centre", corrects: 2, question: "newer", updated_at: "2026-10-02T00:00:00Z" })]);
  assert.deepEqual(byDate.map(e => e.question), ["newer"]);
});

test("a correction that is not approved does not hide the website entry", () => {
  const out = chooseEntriesForChat([
    entry({ id: 2, sort_order: 1, question: "website" }),
    entry({ id: 10, source: "confirmed", corrects: 2, status: "draft", question: "draft fix" }),
  ]);
  assert.deepEqual(out.map(e => e.question), ["website"]);
});

test("new entries without corrects go after the website entries", () => {
  const out = chooseEntriesForChat([
    entry({ id: 1, sort_order: 0, question: "w" }),
    entry({ id: 20, sort_order: 1000, source: "helpdesk", question: "new" }),
  ]);
  assert.deepEqual(out.map(e => e.question), ["w", "new"]);
});

test("customerDetailProblem catches emails, phones, addresses and order numbers", () => {
  // Positive cases - should detect PII
  assert.equal(customerDetailProblem("Fold the pram with the seat facing forward."), null);
  assert.match(customerDetailProblem("email jane@example.com")!, /email/);
  assert.match(customerDetailProblem("call 0412 345 678")!, /phone/);
  assert.match(customerDetailProblem("call (03) 9587 1234")!, /phone/);
  assert.match(customerDetailProblem("0412.345.678")!, /phone/);
  assert.match(customerDetailProblem("ring +61 3 9587 1234")!, /phone/);
  assert.match(customerDetailProblem("call 1300 654 321")!, /phone/);
  assert.match(customerDetailProblem("call 1800 123 456")!, /phone/);
  assert.match(customerDetailProblem("ring 13 22 11")!, /phone/);
  assert.match(customerDetailProblem("I live at 12 Smith Street")!, /address/);
  assert.match(customerDetailProblem("12 smith street")!, /address/);
  assert.match(customerDetailProblem("PO Box 123")!, /address/);
  assert.match(customerDetailProblem("order #58213")!, /order/);
  assert.match(customerDetailProblem("SO-58213 was late")!, /order/);
  assert.match(customerDetailProblem("PO#-12345")!, /order/);
  assert.match(customerDetailProblem("INV-4321")!, /order/);
  // Negative cases - should NOT detect PII
  assert.equal(customerDetailProblem("Suits children up to 22.7 kg, 3 years warranty."), null);
  assert.equal(customerDetailProblem("The serial looks like 0000VISXXXXX123456789."), null);
  assert.equal(customerDetailProblem("The Vista V3 weighs 12.1 kg and folds to 86 x 64 x 36 cm."), null);
  assert.equal(customerDetailProblem("Up to 20 MB per upload."), null);
});
