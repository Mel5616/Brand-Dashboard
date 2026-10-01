import { test } from "node:test";
import assert from "node:assert/strict";
import { createWrittenAnswers } from "./read.ts";
import { fileWrittenAnswers } from "./core.ts";

const faq = [{ topic: "T", q: "Q?", a: "A." }];
const row = (over: object) => ({ id: 1, brand: "uppababy", topic: "T", models: [], question: "Q?", answer: "A.", link: null, source: "website",
  source_ref: null, ext_key: "k", sort_order: 0, corrects: null, status: "approved", decided_by: null, decided_reason: null, updated_at: "2026-10-01", ...over });
const ok = (rows: object[]) => async () => new Response(JSON.stringify(rows), { status: 200 });

test("file mode never calls the database", async () => {
  let called = false;
  const get = createWrittenAnswers({ mode: "file", faq, brand: "uppababy", fetcher: async () => { called = true; return new Response("[]"); } });
  const r = await get();
  assert.equal(r.from, "file"); assert.equal(r.text, fileWrittenAnswers(faq)); assert.equal(called, false);
});

test("unknown or missing mode means file", async () => {
  for (const mode of [undefined, "", "DB ", "yes"]) assert.equal((await createWrittenAnswers({ mode, faq, brand: "uppababy" })()).from, "file");
});

test("db mode builds from approved entries", async () => {
  const get = createWrittenAnswers({ mode: "db", faq, brand: "uppababy", url: "https://x", key: "k", fetcher: ok([row({ answer: "From DB." })]) });
  const r = await get();
  assert.equal(r.from, "db"); assert.match(r.text, /A: From DB\./);
});

test("db mode falls back to the file on error, timeout or empty result", async () => {
  const fail = createWrittenAnswers({ mode: "db", faq, brand: "uppababy", url: "https://x", key: "k", fetcher: async () => new Response("x", { status: 500 }) });
  assert.equal((await fail()).from, "fallback");
  const slow = createWrittenAnswers({ mode: "db", faq, brand: "uppababy", url: "https://x", key: "k", timeoutMs: 20,
    fetcher: (_u, init) => new Promise((_, rej) => init?.signal?.addEventListener("abort", () => rej(new Error("aborted")))) });
  const t0 = Date.now(); const r = await slow();
  assert.equal(r.from, "fallback"); assert.ok(Date.now() - t0 < 1000);
  const empty = createWrittenAnswers({ mode: "db", faq, brand: "uppababy", url: "https://x", key: "k", fetcher: ok([]) });
  assert.equal((await empty()).from, "fallback");
  const noEnv = createWrittenAnswers({ mode: "db", faq, brand: "uppababy" });
  assert.equal((await noEnv()).from, "fallback");
});

test("db mode caches for the ttl, then refreshes", async () => {
  let calls = 0, t = 0;
  const get = createWrittenAnswers({ mode: "db", faq, brand: "uppababy", url: "https://x", key: "k", ttlMs: 1000, now: () => t,
    fetcher: async () => { calls++; return new Response(JSON.stringify([row({ answer: `v${calls}` })])); } });
  await get(); await get(); assert.equal(calls, 1);
  t = 1500; const r = await get(); assert.equal(calls, 2); assert.match(r.text, /v2/);
});

test("after a failure, a previous good result is reused rather than the file", async () => {
  let n = 0, t = 0;
  const get = createWrittenAnswers({ mode: "db", faq, brand: "uppababy", url: "https://x", key: "k", ttlMs: 10, now: () => t,
    fetcher: async () => (++n === 1 ? new Response(JSON.stringify([row({ answer: "good" })])) : new Response("x", { status: 500 })) });
  await get(); t = 100; const r = await get();
  assert.equal(r.from, "db"); assert.match(r.text, /good/);
});
