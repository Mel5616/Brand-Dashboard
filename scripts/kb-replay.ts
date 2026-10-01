// Replay questions against a chat endpoint and record the answers for comparison.
// Usage: node scripts/kb-replay.ts <endpoint> <questions.json> <out.json>
// questions.json is { "questions": string[] } or { "items": { "question": string, "before": string | null }[] }.
// Needs KB_REPLAY_SECRET (same value as the target deployment). VERCEL_BYPASS is optional (preview protection).
import { readFileSync, writeFileSync } from "node:fs";

const [endpoint, input, out] = process.argv.slice(2);
const secret = process.env.KB_REPLAY_SECRET;
if (!endpoint || !input || !out || !secret) {
  console.error("usage: node scripts/kb-replay.ts <endpoint> <questions.json> <out.json> (KB_REPLAY_SECRET must be set)");
  process.exit(1);
}

type Item = { question: string; before: string | null };
const data = JSON.parse(readFileSync(input, "utf8"));
const items: Item[] = Array.isArray(data.items)
  ? data.items.map((i: Item) => ({ question: i.question, before: i.before ?? null }))
  : (data.questions as string[]).map((q) => ({ question: q, before: null }));

const headers: Record<string, string> = { "Content-Type": "application/json", "x-kb-replay": secret };
if (process.env.VERCEL_BYPASS) headers["x-vercel-protection-bypass"] = process.env.VERCEL_BYPASS;

const results: { question: string; before: string | null; after: string }[] = [];
for (const it of items) {
  let after: string;
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ messages: [{ role: "user", content: it.question }], session: `kb-replay-${Date.now()}`, page: "/kb-replay" }),
    });
    const j = await res.json().catch(() => ({}));
    after = j.reply || `ERROR ${res.status} ${j.error || ""}`.trim();
  } catch (e) {
    after = `ERROR ${(e as Error).message}`;
  }
  results.push({ ...it, after });
  console.log(`${results.length}/${items.length}`);
}
writeFileSync(out, JSON.stringify(results, null, 1));
console.log(`wrote ${out}`);
