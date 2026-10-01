import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPatch, buildNewRow, restoreFromHistory } from "./api.ts";

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
