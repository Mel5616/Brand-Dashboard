import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPatch, buildNewRow, restoreFromHistory, buildSearchFilter } from "./api.ts";

const EMAIL = "david@coolkidz.com.au";

test("buildPatch rejects an unknown status", () => {
  const r = buildPatch({ status: "published" }, EMAIL);
  assert.deepEqual(r, { ok: false, error: "Unknown status" });
});

test("buildPatch accepts each of the four statuses", () => {
  for (const status of ["approved", "draft", "needs_review", "retired"]) {
    const r = buildPatch({ status }, EMAIL);
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.patch.status, status);
  }
});

test("buildPatch rejects customer details in the answer (email, phone)", () => {
  const e = buildPatch({ answer: "Email jane@example.com for help" }, EMAIL);
  assert.equal(e.ok, false);
  if (!e.ok) {
    assert.match(e.error, /^Not saved\. It contains an email address\./);
    assert.match(e.error, /Answers must not hold customer details\.$/);
  }
  const p = buildPatch({ answer: "Call 0412 345 678 today" }, EMAIL);
  assert.equal(p.ok, false);
  if (!p.ok) assert.match(p.error, /phone number/);
});

test("buildPatch rejects customer details in the question too", () => {
  const r = buildPatch({ question: "Is jane@example.com right?" }, EMAIL);
  assert.equal(r.ok, false);
});

test("buildPatch always sets decided_by and decided_reason (default reason)", () => {
  const r = buildPatch({ answer: "Fine." }, EMAIL);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.patch.decided_by, EMAIL);
    assert.equal(r.patch.decided_reason, "Edited in the Knowledge tab");
    assert.equal(r.patch.answer, "Fine.");
    assert.match(String(r.patch.checked_at), /^\d{4}-\d{2}-\d{2}T/);
  }
  const g = buildPatch({ answer: "Fine.", decided_reason: "Fixed wording" }, EMAIL);
  assert.equal(g.ok && g.patch.decided_reason, "Fixed wording");
});

test("buildPatch sets decided_by even for an empty or non-object patch", () => {
  for (const p of [{}, null, undefined, "x"]) {
    const r = buildPatch(p, EMAIL);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.patch.decided_by, EMAIL);
      assert.equal(r.patch.decided_reason, "Edited in the Knowledge tab");
    }
  }
});

test("buildPatch slices fields and the reason, and ignores other keys and non-strings", () => {
  const r = buildPatch({ question: "q".repeat(5000), answer: "a".repeat(5000), link: "l".repeat(5000), topic: "t".repeat(5000),
    decided_reason: "r".repeat(900), id: 9, source: "website", status: 5 }, EMAIL);
  assert.equal(r.ok, true);
  if (r.ok) {
    for (const f of ["question", "answer", "link", "topic"]) assert.equal(String(r.patch[f]).length, 4000);
    assert.equal(String(r.patch.decided_reason).length, 500);
    assert.equal("id" in r.patch, false);
    assert.equal("source" in r.patch, false);
    assert.equal("status" in r.patch, false);
  }
});

const good = { brand: "uppababy", topic: "Vista V3", question: "Q?", answer: "A.", source: "confirmed" };

test("buildNewRow builds an approved manual row", () => {
  const r = buildNewRow({ ...good, link: "/x", source_ref: "ref", corrects: "7" }, EMAIL);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.row.status, "approved");
    assert.match(String(r.row.ext_key), /^manual:/);
    assert.equal(r.row.decided_by, EMAIL);
    assert.equal(r.row.decided_reason, "Added in the Knowledge tab");
    assert.equal(r.row.corrects, 7);
    assert.equal(r.row.link, "/x");
    assert.equal(r.row.brand, "uppababy");
  }
});

test("buildNewRow defaults brand and nulls missing optionals", () => {
  const r = buildNewRow({ ...good, brand: undefined }, EMAIL);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.row.brand, "uppababy");
    assert.equal(r.row.link, null);
    assert.equal(r.row.source_ref, null);
    assert.equal(r.row.corrects, null);
  }
});

test("buildNewRow requires topic, question, answer and a valid source", () => {
  const msg = "topic, question, answer and source are required";
  for (const over of [{ topic: "" }, { question: "" }, { answer: "" }, { source: "" }, { source: "blog" }, { topic: undefined }]) {
    assert.deepEqual(buildNewRow({ ...good, ...over }, EMAIL), { ok: false, error: msg });
  }
  assert.deepEqual(buildNewRow(null, EMAIL), { ok: false, error: msg });
});

test("buildNewRow rejects customer details", () => {
  const r = buildNewRow({ ...good, answer: "Write to jane@example.com" }, EMAIL);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /^Not saved\. It contains an email address\./);
});

test("buildNewRow slices long fields", () => {
  const r = buildNewRow({ ...good, topic: "t".repeat(200), question: "q".repeat(2000), answer: "a".repeat(5000), brand: "b".repeat(50) }, EMAIL);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(String(r.row.topic).length, 80);
    assert.equal(String(r.row.question).length, 1000);
    assert.equal(String(r.row.answer).length, 4000);
    assert.equal(String(r.row.brand).length, 20);
  }
});

test("restoreFromHistory refuses an insert (before null) or a missing row", () => {
  assert.deepEqual(restoreFromHistory({ id: 3, before: null }, EMAIL), { ok: false, error: "Nothing to undo" });
  assert.deepEqual(restoreFromHistory(undefined, EMAIL), { ok: false, error: "Nothing to undo" });
});

test("restoreFromHistory restores the before row with the right patch", () => {
  const before = { id: 42, created_at: "c", updated_at: "u", answer: "Old.", status: "approved", topic: "T" };
  const r = restoreFromHistory({ id: 11, before }, EMAIL);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.id, 42);
    assert.deepEqual(r.patch, { answer: "Old.", status: "approved", topic: "T", decided_by: EMAIL, decided_reason: "Undo of change 11" });
  }
});

// Decode the way PostgREST sees it: URL-decode the parameter value first.
const decoded = (f: string | null) => decodeURIComponent(String(f).replace(/^or=/, ""));

test("buildSearchFilter returns null for empty or whitespace queries", () => {
  assert.equal(buildSearchFilter(""), null);
  assert.equal(buildSearchFilter("   \n "), null);
});

test("buildSearchFilter wraps a plain word in quoted ilike operands", () => {
  const f = buildSearchFilter("bassinet");
  assert.ok(f && f.startsWith("or="));
  assert.equal(decoded(f), `(question.ilike."*bassinet*",answer.ilike."*bassinet*")`);
});

test("buildSearchFilter keeps a value with a comma as one operand", () => {
  const f = buildSearchFilter("bassinet, stand");
  assert.equal(decoded(f), `(question.ilike."*bassinet, stand*",answer.ilike."*bassinet, stand*")`);
});

test("buildSearchFilter keeps ) and * inside the quotes", () => {
  const f = buildSearchFilter("a) b*c");
  assert.equal(decoded(f), `(question.ilike."*a) b*c*",answer.ilike."*a) b*c*")`);
});

test("buildSearchFilter escapes double quote and backslash", () => {
  const f = buildSearchFilter(`say "hi" \\ there`);
  assert.equal(decoded(f), `(question.ilike."*say \\"hi\\" \\\\ there*",answer.ilike."*say \\"hi\\" \\\\ there*")`);
});

test("buildSearchFilter cannot be used to inject an extra filter", () => {
  for (const evil of ["x*,id.gt.0", `x"),id.gt.0,(a.eq."`, "x),or(id.gt.0", `x\\",id.gt.0`]) {
    const d = decoded(buildSearchFilter(evil));
    assert.equal(d.match(/\.ilike\./g)?.length, 2);
    // Remove quoted strings (honouring backslash escapes): only the fixed structure may remain.
    const structure = d.replace(/"(?:[^"\\]|\\.)*"/g, '""');
    assert.equal(structure, `(question.ilike.""` + `,answer.ilike."")`);
  }
});

const STORED = { question: "How do I contact Coolkidz?", answer: "Call us on 1300 722 302 or visit 1 Beyer Road Braeside." };

test("buildPatch allows an edit that keeps business details already in the stored entry", () => {
  const r = buildPatch({ answer: "Ring us on 1300 722 302 any weekday, or visit 1 Beyer Road Braeside." }, EMAIL, STORED);
  assert.equal(r.ok, true);
  const q = buildPatch({ question: "How can I reach Coolkidz?" }, EMAIL, STORED);
  assert.equal(q.ok, true);
});

test("buildPatch rejects a phone number or email the edit newly adds", () => {
  const p = buildPatch({ answer: "Call us on 1300 722 302 or 0412 345 678." }, EMAIL, STORED);
  assert.equal(p.ok, false);
  if (!p.ok) assert.match(p.error, /phone number/);
  const e = buildPatch({ answer: "Call us on 1300 722 302 or email jane@example.com." }, EMAIL, STORED);
  assert.equal(e.ok, false);
  if (!e.ok) assert.match(e.error, /email address/);
  const q = buildPatch({ question: "Is jane@example.com right?" }, EMAIL, STORED);
  assert.equal(q.ok, false);
});

test("buildPatch rejects a blank question or answer", () => {
  for (const p of [{ question: "   " }, { answer: "" }, { answer: " \n\t" }]) {
    const r = buildPatch(p, EMAIL, STORED);
    assert.deepEqual(r, { ok: false, error: "Not saved. The question and the answer cannot be blank." });
  }
});

test("buildNewRow for a correction allows details already in the entry it corrects", () => {
  const body = { ...good, question: STORED.question, answer: "Call 1300 722 302, Monday to Friday.", corrects: 7 };
  assert.equal(buildNewRow(body, EMAIL, STORED).ok, true);
  assert.equal(buildNewRow(body, EMAIL).ok, false);
  const added = buildNewRow({ ...body, answer: "Call 1300 722 302 or 0412 345 678." }, EMAIL, STORED);
  assert.equal(added.ok, false);
});
