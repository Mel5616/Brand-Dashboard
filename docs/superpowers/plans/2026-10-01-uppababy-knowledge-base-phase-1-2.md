# UPPAbaby Knowledge Base, Phases 1 and 2: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store UPPAbaby's written answers in a Supabase knowledge base with a dashboard Knowledge tab, and let the Ask UPPAbaby chat read its written answers from it behind an off switch, without changing how the chat behaves today.

**Architecture:** Pure logic (keys, winner rules, prompt formatting, customer-detail check) lives in one dependency-free module with Node tests. A SQL migration adds `kb_entries` and `kb_history`. A loader script fills the table from the existing knowledge file plus seed files. A gated API route and a client component give David and Melanie the Knowledge tab. The chat route builds only its `WRITTEN ANSWERS` block from either the file or the table, chosen by `UPPABABY_KB_MODE`, with a parity check and a replay script proving nothing got worse.

**Tech Stack:** Next.js (repo's own version; read `node_modules/next/dist/docs/` before writing route or component code, per AGENTS.md), TypeScript, Supabase (PostgREST via fetch with the service role, as `src/lib/assistantLog.ts` does), Node 26 built-in test runner (`node --test`, native TypeScript type stripping), Tailwind.

**Spec:** `/Users/davidkingsford/Desktop/Working Files/UPPAbaby CS Ai FAQ/uppababy-portal-theme/docs/specs/2026-10-01-uppababy-knowledge-base-design.md`

**Repo:** GitHub `Mel5616/Brand-Dashboard`. Work on branch `kb/uppababy-knowledge-base`. Melanie owns the repo: deliver as a pull request with Melanie as reviewer. Do not push to `main`.

## Global Constraints

- Today's chat must keep working exactly: only the `WRITTEN ANSWERS` block may change; `PERSONA`, the other `STATIC` sections, live products, model, `max_tokens` and caching stay as they are.
- `UPPABABY_KB_MODE` values: `file` (default, today's behaviour) or `db`. Unset or any other value means `file`.
- In `db` mode with only website entries loaded, the `WRITTEN ANSWERS` block must be byte-identical to `file` mode.
- If Supabase fails or takes longer than 2500 ms, `db` mode falls back to the file for that request.
- Approved entries are cached in memory for 5 minutes.
- Only `status = 'approved'` entries reach the chat.
- Winner order: `confirmed` > `help_centre` > `helpdesk` = `team_reply` > `website`.
- Approvers: env `KB_APPROVERS`, default `david@coolkidz.com.au,mel@coolkidz.com.au`. Only approvers can read or write the Knowledge tab API.
- Customer details are never stored: text containing an email address, a phone number, a street address or an order number is rejected.
- Written answer format per entry, exactly: `[${topic}] Q: ${question}\nA: ${answer}` plus `\nMore: ${link}` only when `link` is a non-empty string; entries joined with `\n\n`; block prefixed `WRITTEN ANSWERS\n`.
- Copy in the UI: Australian English, no em dashes, plain words.
- Nothing customer-facing switches until David says go; the go-live step is manual (Task 9).

## Review Focus

- A website FAQ with `link` missing, `null` or `""` must print no `More:` line, exactly as the file mode does (parity test in Task 1 and Task 8).
- Supabase down, slow or returning an error must not break or slow the chat: `db` mode falls back to the file within 2500 ms (test in Task 7).
- Two approved entries correcting the same website entry: exactly one appears, the higher-precedence one, then the most recently updated (test in Task 1).
- An entry moved from approved to draft, needs_review or retired disappears from the chat on the next cache refresh (test in Task 1 via `chooseEntriesForChat`).
- Text with customer details submitted through the API is rejected with a clear message (test in Task 1 for the checker; API wiring in Task 5).

---

### Task 1: Pure knowledge-base logic with tests

**Files:**
- Create: `src/lib/kb/core.ts`
- Create: `src/lib/kb/core.test.ts`
- Modify: `package.json` (add `test` script)
- Modify: `tsconfig.json` (exclude `**/*.test.ts` so `next build` does not type-check test files that import `./core.ts`)

**Interfaces:**
- Produces:
  - `type KbSource = "website" | "confirmed" | "help_centre" | "helpdesk" | "team_reply"`
  - `type KbStatus = "approved" | "draft" | "needs_review" | "retired"`
  - `type KbEntry = { id: number; brand: string; topic: string; models: string[]; question: string; answer: string; link: string | null; source: KbSource; source_ref: string | null; ext_key: string; sort_order: number; corrects: number | null; status: KbStatus; decided_by: string | null; decided_reason: string | null; updated_at: string }`
  - `type FaqItem = { topic: string; q: string; a: string; link?: string | null }`
  - `websiteKey(topic: string, question: string): string` (16 hex chars)
  - `formatWrittenAnswers(items: { topic: string; question: string; answer: string; link?: string | null }[]): string`
  - `fileWrittenAnswers(faq: FaqItem[]): string`
  - `chooseEntriesForChat(entries: KbEntry[]): KbEntry[]`
  - `customerDetailProblem(text: string): string | null` (null = clean, otherwise a plain reason)
  - `PRECEDENCE: Record<KbSource, number>`

- [ ] **Step 1: Add the test script and exclude tests from the Next type check**

`package.json` scripts, add:

```json
"test": "node --test \"src/lib/kb/*.test.ts\""
```

`tsconfig.json`: change `"exclude": ["node_modules"]` to `"exclude": ["node_modules", "**/*.test.ts"]`, and add `"allowImportingTsExtensions": true` to `compilerOptions` (allowed because `noEmit` is true). The kb modules import each other as `./core.ts` so they run under `node --test` with native type stripping; without this setting `next build` rejects the `.ts` extension.

- [ ] **Step 2: Write the failing tests**

`src/lib/kb/core.test.ts`:

```ts
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
  assert.equal(customerDetailProblem("Fold the pram with the seat facing forward."), null);
  assert.match(customerDetailProblem("email jane@example.com")!, /email/);
  assert.match(customerDetailProblem("call 0412 345 678")!, /phone/);
  assert.match(customerDetailProblem("ring +61 3 9587 1234")!, /phone/);
  assert.match(customerDetailProblem("I live at 12 Smith Street")!, /address/);
  assert.match(customerDetailProblem("order #58213")!, /order/);
  assert.equal(customerDetailProblem("Suits children up to 22.7 kg, 3 years warranty."), null);
  assert.equal(customerDetailProblem("The serial looks like 0000VISXXXXX123456789."), null);
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npm test`
Expected: FAIL, `Cannot find module ... core.ts`.

- [ ] **Step 4: Write the implementation**

`src/lib/kb/core.ts`:

```ts
// Pure logic for the UPPAbaby knowledge base. No imports from the app, so it runs
// under `node --test` as well as inside Next. See docs spec 2026-10-01.
import { createHash } from "node:crypto";

export type KbSource = "website" | "confirmed" | "help_centre" | "helpdesk" | "team_reply";
export type KbStatus = "approved" | "draft" | "needs_review" | "retired";
export type KbEntry = {
  id: number; brand: string; topic: string; models: string[]; question: string; answer: string; link: string | null;
  source: KbSource; source_ref: string | null; ext_key: string; sort_order: number; corrects: number | null;
  status: KbStatus; decided_by: string | null; decided_reason: string | null; updated_at: string;
};
export type FaqItem = { topic: string; q: string; a: string; link?: string | null };

// Higher wins when two approved entries correct the same website answer.
export const PRECEDENCE: Record<KbSource, number> = { confirmed: 4, help_centre: 3, helpdesk: 2, team_reply: 2, website: 1 };

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
export function websiteKey(topic: string, question: string): string {
  return createHash("sha1").update(`${norm(topic)}\n${norm(question)}`).digest("hex").slice(0, 16);
}

// Exactly the chat route's format: "[topic] Q: ...\nA: ..." plus "\nMore: link" when there is a link.
export function formatWrittenAnswers(items: { topic: string; question: string; answer: string; link?: string | null }[]): string {
  return `WRITTEN ANSWERS\n${items.map(i => `[${i.topic}] Q: ${i.question}\nA: ${i.answer}${i.link ? `\nMore: ${i.link}` : ""}`).join("\n\n")}`;
}
export function fileWrittenAnswers(faq: FaqItem[]): string {
  return formatWrittenAnswers(faq.map(f => ({ topic: f.topic, question: f.q, answer: f.a, link: f.link ?? null })));
}

// Approved entries only; a correction takes the place of the website entry it corrects;
// entries without a correction keep their own sort_order (new ones sort after the website ones).
export function chooseEntriesForChat(entries: KbEntry[]): KbEntry[] {
  const approved = entries.filter(e => e.status === "approved");
  const winners = new Map<number, KbEntry>();
  for (const e of approved) {
    if (e.corrects == null) continue;
    const cur = winners.get(e.corrects);
    const better = !cur || PRECEDENCE[e.source] > PRECEDENCE[cur.source] ||
      (PRECEDENCE[e.source] === PRECEDENCE[cur.source] && e.updated_at > cur.updated_at);
    if (better) winners.set(e.corrects, e);
  }
  const out: { e: KbEntry; pos: number }[] = [];
  for (const e of approved) {
    if (e.corrects != null) continue;              // placed below, only if it won
    const fix = winners.get(e.id);
    out.push({ e: fix || e, pos: e.sort_order });
  }
  // A winning correction whose target is missing or not approved still counts as an answer on its own.
  const placed = new Set(out.map(o => o.e.id));
  for (const w of winners.values()) if (!placed.has(w.id)) out.push({ e: w, pos: w.sort_order });
  return out.sort((a, b) => a.pos - b.pos || a.e.id - b.e.id).map(o => o.e);
}

// Returns a plain reason when text looks like it holds customer details, else null.
export function customerDetailProblem(text: string): string | null {
  if (/[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(text)) return "It contains an email address.";
  if (/(\+?61[\s-]?\d|\b0[2-478])[\d\s-]{7,11}\d\b/.test(text)) return "It contains a phone number.";
  if (/\b\d{1,5}\s+[A-Z][a-z]+(\s[A-Z][a-z]+)?\s(Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Court|Ct|Lane|Ln|Place|Pl|Crescent|Cres|Parade|Pde|Way|Boulevard|Blvd)\b/.test(text)) return "It contains a street address.";
  if (/\border\s*(number|no\.?|#)?\s*#?\s*\d{4,}/i.test(text) || /#\d{4,}\b/.test(text)) return "It contains an order number.";
  return null;
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npm test`
Expected: PASS, 9 tests. (Model filtering is left out: the website answers carry no model tags; filter by topic, which names the model.)

Note on the "A winning correction whose target is missing" branch: when the corrected website entry is retired, the correction keeps its own `sort_order`. The loader (Task 3) sets a correction's `sort_order` to its target's, so position is kept.

- [ ] **Step 6: Commit**

```bash
git checkout -b kb/uppababy-knowledge-base
git add package.json tsconfig.json src/lib/kb/core.ts src/lib/kb/core.test.ts
git commit -m "Knowledge base: pure logic for keys, winners, prompt format, customer-detail check"
```

---

### Task 2: Database tables

**Files:**
- Create: `supabase/add_kb_entries.sql`

**Interfaces:**
- Produces: tables `public.kb_entries` (columns exactly as `KbEntry` plus `created_at`, `checked_at`), `public.kb_history`; unique `(brand, ext_key)`.

- [ ] **Step 1: Write the migration**

`supabase/add_kb_entries.sql`:

```sql
-- UPPAbaby (and later other brands) knowledge base: one row per question and answer.
-- Feeds the Ask chats and the help centre. See docs spec 2026-10-01.
create table if not exists public.kb_entries (
  id bigint generated always as identity primary key,
  brand text not null,
  topic text not null,
  models text[] not null default '{}',
  question text not null,
  answer text not null,
  link text,
  source text not null check (source in ('website','confirmed','help_centre','helpdesk','team_reply')),
  source_ref text,
  ext_key text not null,
  sort_order integer not null default 100000,
  corrects bigint references public.kb_entries(id) on delete set null,
  status text not null default 'draft' check (status in ('approved','draft','needs_review','retired')),
  decided_by text,
  decided_reason text,
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand, ext_key)
);
create index if not exists kb_entries_brand_status_idx on public.kb_entries (brand, status, sort_order);
alter table public.kb_entries enable row level security;   -- service role only

create table if not exists public.kb_history (
  id bigint generated always as identity primary key,
  entry_id bigint not null references public.kb_entries(id) on delete cascade,
  before jsonb,
  after jsonb not null,
  changed_by text,
  reason text,
  changed_at timestamptz not null default now()
);
create index if not exists kb_history_entry_idx on public.kb_history (entry_id, changed_at desc);
alter table public.kb_history enable row level security;

-- Every insert and update is written to kb_history (after the row exists, so entry_id is known);
-- changed_by / reason come from decided_by / decided_reason. updated_at is touched on update.
create or replace function public.kb_entries_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create or replace function public.kb_entries_audit() returns trigger language plpgsql as $$
begin
  insert into public.kb_history (entry_id, before, after, changed_by, reason)
  values (new.id, case when tg_op = 'UPDATE' then to_jsonb(old) else null end, to_jsonb(new), new.decided_by, new.decided_reason);
  return null;
end $$;
drop trigger if exists kb_entries_touch_trg on public.kb_entries;
create trigger kb_entries_touch_trg before update on public.kb_entries for each row execute function public.kb_entries_touch();
drop trigger if exists kb_entries_audit_trg on public.kb_entries;
create trigger kb_entries_audit_trg after insert or update on public.kb_entries for each row execute function public.kb_entries_audit();
```

- [ ] **Step 2: Apply to the Brand-Dashboard Supabase project**

Find the project ref: `vercel env ls` in the repo (or the Supabase MCP `list_projects`) and match `NEXT_PUBLIC_SUPABASE_URL`. Apply `supabase/add_kb_entries.sql` with the Supabase MCP `apply_migration` (name `add_kb_entries`). Additive only; no existing table changes.

- [ ] **Step 3: Verify**

Run via MCP `execute_sql`:

```sql
insert into public.kb_entries (brand, topic, question, answer, source, ext_key, status, decided_by, decided_reason)
values ('test','T','Q?','A.','website','test-1','approved','claude','verify');
update public.kb_entries set answer = 'A2.' where brand='test' and ext_key='test-1';
select count(*) as history_rows from public.kb_history h join public.kb_entries e on e.id = h.entry_id where e.brand = 'test';
delete from public.kb_entries where brand = 'test';
```

Expected: `history_rows = 2`, and the delete leaves no `test` rows (history cascades).

- [ ] **Step 4: Commit**

```bash
git add supabase/add_kb_entries.sql
git commit -m "Knowledge base: kb_entries and kb_history tables with audit trigger"
```

---

### Task 3: Seed files and loader

**Files:**
- Create: `data/kb-seed/uppababy-confirmed.json`
- Create: `data/kb-seed/uppababy-help-centre.json`
- Create: `scripts/kb-load.ts`
- Test: `src/lib/kb/load.test.ts`
- Create: `src/lib/kb/load.ts`

**Interfaces:**
- Consumes: `websiteKey`, `FaqItem`, `customerDetailProblem` from `src/lib/kb/core.ts`.
- Produces:
  - `type SeedEntry = { ext_key: string; topic: string; models?: string[]; question: string; answer: string; link?: string | null; source: "confirmed" | "help_centre"; source_ref: string; corrects_question?: { topic: string; q: string } | null; status: "approved" | "needs_review"; decided_by: string; decided_reason: string }`
  - `websiteRows(brand: string, faq: FaqItem[]): Row[]` where `Row` is the insert shape of `kb_entries` without `id`, `corrects` resolved later.
  - `seedRows(brand: string, seeds: SeedEntry[], keyToSort: Map<string, number>): { rows: Row[]; problems: string[] }`
  - CLI: `node scripts/kb-load.ts [--dry-run]` using env `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

- [ ] **Step 1: Write the failing tests**

`src/lib/kb/load.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to see them fail**

Run: `npm test`
Expected: FAIL, cannot find `./load.ts`.

- [ ] **Step 3: Implement `src/lib/kb/load.ts`**

```ts
import { websiteKey, customerDetailProblem, type FaqItem } from "./core.ts";

export type Row = {
  brand: string; topic: string; models: string[]; question: string; answer: string; link: string | null;
  source: string; source_ref: string | null; ext_key: string; sort_order: number; status: string;
  decided_by: string; decided_reason: string; corrects_key?: string | null;
};
export type SeedEntry = {
  ext_key: string; topic: string; models?: string[]; question: string; answer: string; link?: string | null;
  source: "confirmed" | "help_centre"; source_ref: string; corrects_question?: { topic: string; q: string } | null;
  status: "approved" | "needs_review"; decided_by: string; decided_reason: string;
};

// Website answers exactly as the knowledge file has them (no trimming: parity depends on it).
export function websiteRows(brand: string, faq: FaqItem[]): Row[] {
  return faq.map((f, i) => ({
    brand, topic: f.topic, models: [], question: f.q, answer: f.a, link: f.link ? f.link : null,
    source: "website", source_ref: f.link || null, ext_key: websiteKey(f.topic, f.q), sort_order: i,
    status: "approved", decided_by: "claude", decided_reason: "From the uppababy.com.au knowledge file",
  }));
}

export function seedRows(brand: string, seeds: SeedEntry[], keyToSort: Map<string, number>): { rows: Row[]; problems: string[] } {
  const rows: Row[] = [], problems: string[] = [];
  for (const s of seeds) {
    const bad = customerDetailProblem(`${s.question}\n${s.answer}`);
    if (bad) { problems.push(`${s.ext_key}: ${bad}`); continue; }
    const ck = s.corrects_question ? websiteKey(s.corrects_question.topic, s.corrects_question.q) : null;
    rows.push({
      brand, topic: s.topic, models: s.models || [], question: s.question, answer: s.answer, link: s.link || null,
      source: s.source, source_ref: s.source_ref, ext_key: s.ext_key,
      sort_order: ck && keyToSort.has(ck) ? keyToSort.get(ck)! : 100000,
      status: s.status, decided_by: s.decided_by, decided_reason: s.decided_reason, corrects_key: ck,
    });
  }
  return { rows, problems };
}
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS (all tests in `src/lib/kb/`).

- [ ] **Step 5: Write the confirmed-facts seed**

Search `src/data/uppababy-knowledge.json` `faq` for every answer that conflicts with David's confirmed facts and write one `confirmed` entry per conflict, with `corrects_question` set to that FAQ's exact `topic` and `q`. Also add the facts with no website counterpart as standalone entries (`corrects_question: null`). Source of the facts: `~/.claude/projects/-Users-davidkingsford-Desktop-Working-Files-UPPAbaby-CS-Ai-FAQ/memory/uppababy-product-facts.md`. Facts to cover (all confirmed by David on 1 Oct 2026):

- Vista and Ridge toddler seat from 6 months (not about three months); Cruz, Minu, Kona from birth.
- RumbleSeat from 6 months.
- Minu V3 limit 22.7 kg (the site says 22 kg).
- BeSafe capsules are not sold in Australia; never list them as compatible.
- Floor display prams bought from a retailer: 12 month warranty.
- Crash Exchange covers only the Mesa capsule and Mesa base, never prams.
- Kona takes the Mesa directly, no adapters.
- The bassinet does not fit the Minu V3.
- Tune-Up Days: anyone with an UPPAbaby pram can attend.
- Part name: UPPAbaby Vista Lower Capsule Adapters.
- Vista V3 and Cruz V3 fold with the seat on only facing forward in the second most upright position; only the Kona folds with the seat facing either way.
- Fabrics: spot clean or hand wash cold with mild detergent, dry flat out of the sun; no machine washing, bleach, ironing or dry cleaning.
- From Birth Kit is not sold in Australia.
- Mesa capsule has a lifetime warranty.
- Designed in Massachusetts, made in China.

Format each answer in the chat's style (plain, under 130 words, `[label](/path)` links to uppababy.com.au pages that exist in `knowledge.pages`). Example entry:

```json
{
  "ext_key": "fact:vista-fold-seat-forward",
  "topic": "Vista V3",
  "models": ["Vista V3"],
  "question": "Can I fold the Vista V3 with the toddler seat on?",
  "answer": "Yes, as long as the seat faces forward, away from you, reclined to the second most upright position. It will not fold with the seat facing you. Take off the bassinet, a RumbleSeat or a Mesa first.",
  "link": null,
  "source": "confirmed",
  "source_ref": "David Kingsford, 1 Oct 2026",
  "corrects_question": { "topic": "<exact topic of the conflicting FAQ>", "q": "<exact q of the conflicting FAQ>" },
  "status": "approved",
  "decided_by": "david@coolkidz.com.au",
  "decided_reason": "Confirmed by David; uppababy.com.au says the seat can face either way"
}
```

File shape: `{ "entries": [ ...SeedEntry ] }`.

- [ ] **Step 6: Write the help centre seed**

Generate `data/kb-seed/uppababy-help-centre.json` from the 34 structured articles in `/Users/davidkingsford/Desktop/Working Files/UPPAbaby CS Ai FAQ/uppababy-portal-theme/article-review/structured/*.json`: one entry per article (question = article title, answer = the article lead plus the key steps condensed to chat length), `ext_key` = `article:<id>`, `source_ref` = `help.uppababy.com.au/support/solutions/articles/<id>`, `status` = `approved`, `decided_by` = `claude`, `decided_reason` = `Help centre article checked against uppababy.com.au on 1 Oct 2026`. Where an article contradicts a website FAQ on a confirmed fact, the confirmed seed already covers it; do not add a second correction.

- [ ] **Step 7: Write the loader CLI `scripts/kb-load.ts`**

```ts
// Load the UPPAbaby knowledge base: website answers from src/data/uppababy-knowledge.json, then seeds.
// Usage: node scripts/kb-load.ts [--dry-run]   (needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)
import { readFileSync } from "node:fs";
import { websiteRows, seedRows, type SeedEntry } from "../src/lib/kb/load.ts";

const BRAND = "uppababy";
const dry = process.argv.includes("--dry-run");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!dry && (!url || !key)) { console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
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
```

Duplicate website keys: if `dupes > 0`, two FAQs share a topic and question; make their `ext_key` unique by suffixing `:2`, `:3` in `websiteRows` (add a test first), keeping file order.

- [ ] **Step 8: Dry run, then load**

Run: `node scripts/kb-load.ts --dry-run`
Expected: `website 495 (duplicate keys 0), seeds <n>, rejected 0, corrections pointing nowhere 0`.
Then with env from `vercel env pull .env.kb --environment=production` (do not commit `.env.kb`; add it to `.gitignore` if not covered): `set -a; . ./.env.kb; set +a; node scripts/kb-load.ts`.
Expected: `loaded`. Verify with MCP `execute_sql`: `select source, status, count(*) from kb_entries where brand='uppababy' group by 1,2;`

- [ ] **Step 9: Commit**

```bash
git add src/lib/kb/load.ts src/lib/kb/load.test.ts scripts/kb-load.ts data/kb-seed/
git commit -m "Knowledge base: loader for website answers, confirmed facts and help centre entries"
```

---

### Task 4: Parity check (proves day-one behaviour is unchanged)

**Files:**
- Create: `scripts/kb-parity.ts`

**Interfaces:**
- Consumes: `fileWrittenAnswers`, `formatWrittenAnswers`, `chooseEntriesForChat`, `KbEntry`.

- [ ] **Step 1: Write the script**

```ts
// Compare the WRITTEN ANSWERS block from the file with the one built from website-only approved entries.
// Usage: node scripts/kb-parity.ts   (needs Supabase env). Exit 0 = byte-identical.
import { readFileSync } from "node:fs";
import { fileWrittenAnswers, formatWrittenAnswers, chooseEntriesForChat, type KbEntry } from "../src/lib/kb/core.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!, key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const H = { apikey: key, Authorization: `Bearer ${key}` };
const faq = JSON.parse(readFileSync("src/data/uppababy-knowledge.json", "utf8")).faq;
const rows = await (await fetch(`${url}/rest/v1/kb_entries?select=*&brand=eq.uppababy&source=eq.website&limit=5000`, { headers: H })).json() as KbEntry[];
const a = fileWrittenAnswers(faq), b = formatWrittenAnswers(chooseEntriesForChat(rows));
if (a === b) { console.log(`PARITY OK: ${a.length} chars`); process.exit(0); }
let i = 0; while (i < a.length && a[i] === b[i]) i++;
console.log(`PARITY FAILED at char ${i}\nfile: ${JSON.stringify(a.slice(i - 80, i + 80))}\ndb:   ${JSON.stringify(b.slice(i - 80, i + 80))}`);
process.exit(1);
```

- [ ] **Step 2: Run it**

Run: `set -a; . ./.env.kb; set +a; node scripts/kb-parity.ts`
Expected: `PARITY OK: <n> chars`. If it fails, the loader changed text; fix the loader, reload, rerun.

- [ ] **Step 3: Commit**

```bash
git add scripts/kb-parity.ts
git commit -m "Knowledge base: parity check against the knowledge file"
```

---

### Task 5: Knowledge API route

**Files:**
- Create: `src/lib/kb/approvers.ts`
- Create: `src/app/api/kb/route.ts`

**Interfaces:**
- Consumes: `getAccess()` from `src/lib/access.ts`; `customerDetailProblem`, `KbEntry` from core.
- Produces (all JSON, approvers only, 403 otherwise):
  - `GET /api/kb?brand=uppababy&q=&status=&source=&topic=` → `{ ok: true, rows: KbEntry[], fixes: { website: KbEntry; correction: KbEntry }[] }`
  - `GET /api/kb?history=<id>` → `{ ok: true, history: { id, before, after, changed_by, reason, changed_at }[] }`
  - `PATCH /api/kb` body `{ id, patch: { question?, answer?, link?, topic?, status?, decided_reason? } }` → `{ ok: true }` or `{ ok: false, error }`
  - `POST /api/kb` body `{ brand, topic, question, answer, link?, source, source_ref?, corrects? }` → `{ ok: true, row }`
  - `POST /api/kb` body `{ undo: <historyId> }` → restores that history row's `before` → `{ ok: true }`
  - `isApprover(email: string | null | undefined): boolean` in `approvers.ts`

- [ ] **Step 1: Write `src/lib/kb/approvers.ts`**

```ts
const APPROVERS = (process.env.KB_APPROVERS || "david@coolkidz.com.au,mel@coolkidz.com.au")
  .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
export const isApprover = (email: string | null | undefined) => !!email && APPROVERS.includes(email.toLowerCase());
```

- [ ] **Step 2: Write the route** (read `node_modules/next/dist/docs/` on route handlers first; mirror `src/app/api/assistant-logs/route.ts`)

```ts
import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { isApprover } from "@/lib/kb/approvers";
import { customerDetailProblem } from "@/lib/kb/core";

const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL, sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = () => ({ apikey: sbKey!, Authorization: `Bearer ${sbKey!}`, "Content-Type": "application/json" });
const SOURCES = new Set(["website", "confirmed", "help_centre", "helpdesk", "team_reply"]);
const STATUSES = new Set(["approved", "draft", "needs_review", "retired"]);

async function who() { const a = await getAccess(); return isApprover(a.user?.email) ? a.user!.email : null; }
const forbidden = () => NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

export async function GET(req: Request) {
  if (!(await who())) return forbidden();
  const sp = new URL(req.url).searchParams;
  const hist = Number(sp.get("history"));
  if (hist) {
    const r = await fetch(`${sbUrl}/rest/v1/kb_history?select=*&entry_id=eq.${hist}&order=changed_at.desc&limit=50`, { headers: H(), cache: "no-store" });
    return NextResponse.json({ ok: r.ok, history: r.ok ? await r.json() : [] });
  }
  const brand = sp.get("brand") || "uppababy";
  const parts = [`select=*`, `brand=eq.${encodeURIComponent(brand)}`, `order=sort_order.asc,id.asc`, `limit=5000`];
  for (const f of ["status", "source", "topic"]) { const v = sp.get(f); if (v) parts.push(`${f}=eq.${encodeURIComponent(v)}`); }
  const q = (sp.get("q") || "").trim();
  if (q) parts.push(`or=(question.ilike.*${encodeURIComponent(q)}*,answer.ilike.*${encodeURIComponent(q)}*)`);
  const r = await fetch(`${sbUrl}/rest/v1/kb_entries?${parts.join("&")}`, { headers: H(), cache: "no-store" });
  if (!r.ok) return NextResponse.json({ ok: false, rows: [], fixes: [] });
  const rows = await r.json();
  const byId = new Map(rows.map((e: any) => [e.id, e]));
  const fixes = rows.filter((e: any) => e.corrects && e.status === "approved" && byId.get(e.corrects)?.source === "website")
    .map((e: any) => ({ website: byId.get(e.corrects), correction: e }));
  return NextResponse.json({ ok: true, rows, fixes });
}

export async function PATCH(req: Request) {
  const email = await who(); if (!email) return forbidden();
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 }); }
  const id = Number(b?.id); const p = b?.patch || {};
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  const patch: Record<string, unknown> = { decided_by: email, decided_reason: String(p.decided_reason || "Edited in the Knowledge tab").slice(0, 500) };
  for (const f of ["question", "answer", "link", "topic"]) if (typeof p[f] === "string") patch[f] = p[f].slice(0, 4000);
  if (typeof p.status === "string") { if (!STATUSES.has(p.status)) return NextResponse.json({ ok: false, error: "Unknown status" }, { status: 400 }); patch.status = p.status; }
  const bad = customerDetailProblem(`${patch.question ?? ""}\n${patch.answer ?? ""}`);
  if (bad) return NextResponse.json({ ok: false, error: `Not saved. ${bad} Answers must not hold customer details.` }, { status: 400 });
  patch.checked_at = new Date().toISOString();
  const r = await fetch(`${sbUrl}/rest/v1/kb_entries?id=eq.${id}`, { method: "PATCH", headers: { ...H(), Prefer: "return=minimal" }, body: JSON.stringify(patch) });
  return NextResponse.json({ ok: r.ok });
}

export async function POST(req: Request) {
  const email = await who(); if (!email) return forbidden();
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 }); }
  if (b?.undo) {
    const h = await (await fetch(`${sbUrl}/rest/v1/kb_history?select=*&id=eq.${Number(b.undo)}`, { headers: H(), cache: "no-store" })).json();
    const before = h?.[0]?.before; if (!before) return NextResponse.json({ ok: false, error: "Nothing to undo" }, { status: 400 });
    const { id, created_at, updated_at, ...restore } = before;
    const r = await fetch(`${sbUrl}/rest/v1/kb_entries?id=eq.${id}`, { method: "PATCH", headers: { ...H(), Prefer: "return=minimal" },
      body: JSON.stringify({ ...restore, decided_by: email, decided_reason: `Undo of change ${b.undo}` }) });
    return NextResponse.json({ ok: r.ok });
  }
  const row = {
    brand: String(b?.brand || "uppababy").slice(0, 20), topic: String(b?.topic || "").slice(0, 80), question: String(b?.question || "").slice(0, 1000),
    answer: String(b?.answer || "").slice(0, 4000), link: b?.link ? String(b.link).slice(0, 300) : null, source: String(b?.source || ""),
    source_ref: b?.source_ref ? String(b.source_ref).slice(0, 300) : null, corrects: b?.corrects ? Number(b.corrects) : null,
    ext_key: `manual:${Date.now().toString(36)}`, status: "approved", decided_by: email, decided_reason: "Added in the Knowledge tab",
  };
  if (!row.topic || !row.question || !row.answer || !SOURCES.has(row.source)) return NextResponse.json({ ok: false, error: "topic, question, answer and source are required" }, { status: 400 });
  const bad = customerDetailProblem(`${row.question}\n${row.answer}`);
  if (bad) return NextResponse.json({ ok: false, error: `Not saved. ${bad} Answers must not hold customer details.` }, { status: 400 });
  const r = await fetch(`${sbUrl}/rest/v1/kb_entries`, { method: "POST", headers: { ...H(), Prefer: "return=representation" }, body: JSON.stringify(row) });
  if (!r.ok) return NextResponse.json({ ok: false, error: "Not saved" }, { status: 500 });
  const [saved] = await r.json();
  return NextResponse.json({ ok: true, row: saved });
}
```

Note: `src/lib/kb/core.ts` imports `node:crypto`; that is fine in a route handler (Node runtime, the default). Do not import `core.ts` into a client component.

- [ ] **Step 3: Check it builds and responds**

Run: `npx tsc --noEmit -p .` then `npm run dev`, and in a browser signed in as an approver open `/api/kb?brand=uppababy&status=needs_review`.
Expected: `{"ok":true,"rows":[...],"fixes":[...]}`. Signed out: 403. Signed in as a non-approver: 403.
Then PATCH with an answer containing `jane@example.com` (browser devtools `fetch('/api/kb',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:<an id>,patch:{answer:'email jane@example.com'}})}).then(r=>r.json())`).
Expected: `{ ok: false, error: "Not saved. It contains an email address. ..." }` and the entry unchanged.

- [ ] **Step 4: Commit**

```bash
git add src/lib/kb/approvers.ts src/app/api/kb/route.ts
git commit -m "Knowledge base: approver-only API for list, edit, add, history and undo"
```

---

### Task 6: Knowledge tab

**Files:**
- Create: `src/components/KnowledgeBase.tsx`
- Modify: `src/lib/tabs.ts` (add `{ id: "knowledge", label: "Knowledge (UPPAbaby)" }` to the "Websites" section after `assistants`)
- Modify: `src/components/DashboardTabs.tsx`: add `"knowledge"` to the `TabId` union, a `TABS` entry after `assistants`, `"knowledge"` in the Websites nav group ids list (next to `"assistants"`), and a render block after the `assistants` block
- Modify: `src/lib/tabs.ts` `ADMIN_ONLY_TABS` if that is how admin-only tabs are listed (check the file); the API gates approvers regardless

**Interfaces:**
- Consumes: `/api/kb` endpoints from Task 5.
- Produces: `export function KnowledgeBase()`.

- [ ] **Step 1: Write the component**

`src/components/KnowledgeBase.tsx` (client; style matches `AssistantFeed.tsx`: Tailwind, white cards, grey borders):

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type Entry = { id: number; topic: string; question: string; answer: string; link: string | null; source: string; source_ref: string | null;
  status: string; corrects: number | null; decided_by: string | null; decided_reason: string | null; updated_at: string };
type Fix = { website: Entry; correction: Entry };
type Hist = { id: number; before: Entry | null; after: Entry; changed_by: string | null; reason: string | null; changed_at: string };

const SOURCE_LABEL: Record<string, string> = { website: "Website", confirmed: "Confirmed fact", help_centre: "Help centre", helpdesk: "Helpdesk", team_reply: "Team reply" };
const STATUS_STYLE: Record<string, string> = { approved: "bg-emerald-100 text-emerald-800", draft: "bg-gray-100 text-gray-700", needs_review: "bg-amber-100 text-amber-800", retired: "bg-gray-200 text-gray-500 line-through" };
const when = (s: string) => new Date(s).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short", timeZone: "Australia/Melbourne" });

export function KnowledgeBase() {
  const [view, setView] = useState<"all" | "needs" | "fixes">("needs");
  const [rows, setRows] = useState<Entry[]>([]);
  const [fixes, setFixes] = useState<Fix[]>([]);
  const [q, setQ] = useState(""); const [source, setSource] = useState(""); const [status, setStatus] = useState(""); const [topic, setTopic] = useState("");
  const [topics, setTopics] = useState<string[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [edit, setEdit] = useState<{ question: string; answer: string; link: string } | null>(null);
  const [hist, setHist] = useState<Hist[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const qs = new URLSearchParams({ brand: "uppababy" });
    if (q) qs.set("q", q); if (source) qs.set("source", source); if (status) qs.set("status", status); if (topic) qs.set("topic", topic);
    const r = await fetch(`/api/kb?${qs}`).then(x => x.json()).catch(() => ({ ok: false }));
    setLoading(false);
    if (!r.ok) { setMsg("Could not load the knowledge base."); return; }
    setRows(r.rows); setFixes(r.fixes); setMsg(null);
    if (!topic) setTopics(Array.from(new Set<string>(r.rows.map((e: Entry) => e.topic))).sort());
  }
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [q, source, status, topic]); // eslint-disable-line react-hooks/exhaustive-deps

  const needs = useMemo(() => rows.filter(r => r.status === "needs_review" || r.status === "draft"), [rows]);
  const shown = view === "needs" ? needs : rows;

  async function openEntry(e: Entry) {
    if (open === e.id) { setOpen(null); return; }
    setOpen(e.id); setEdit(null);
    const r = await fetch(`/api/kb?history=${e.id}`).then(x => x.json()).catch(() => ({ history: [] }));
    setHist(r.history || []);
  }
  async function patch(id: number, p: Record<string, unknown>) {
    const r = await fetch("/api/kb", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, patch: p }) }).then(x => x.json());
    if (!r.ok) { setMsg(r.error || "Not saved."); return; }
    setMsg("Saved."); setEdit(null); load();
  }
  async function undo(h: Hist) {
    const r = await fetch("/api/kb", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ undo: h.id }) }).then(x => x.json());
    setMsg(r.ok ? "Change undone." : r.error || "Could not undo."); load();
  }
  function copyFixes() {
    const text = fixes.map(f => `Page: ${f.website.source_ref || f.website.topic}\nQuestion: ${f.website.question}\nWebsite says: ${f.website.answer}\nShould say: ${f.correction.answer}`).join("\n\n");
    navigator.clipboard?.writeText(text).then(() => setMsg("Website fixes copied."), () => setMsg("Copy did not work; select the text instead."));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        {(["needs", "all", "fixes"] as const).map(v => (
          <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 rounded-full text-sm border ${view === v ? "bg-gray-900 text-white border-gray-900" : "bg-white border-gray-300"}`}>
            {v === "needs" ? `Needs you (${needs.length})` : v === "all" ? `All answers (${rows.length})` : `Website fixes (${fixes.length})`}
          </button>
        ))}
        {msg && <span className="text-sm text-gray-600 ml-2">{msg}</span>}
      </div>

      {view !== "fixes" && (
        <div className="flex flex-wrap gap-2">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search questions and answers" className="border rounded-lg px-3 py-2 text-sm w-72 max-w-full" />
          <select value={source} onChange={e => setSource(e.target.value)} className="border rounded-lg px-2 py-2 text-sm">
            <option value="">All sources</option>{Object.entries(SOURCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={topic} onChange={e => setTopic(e.target.value)} className="border rounded-lg px-2 py-2 text-sm">
            <option value="">All topics</option>{topics.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={status} onChange={e => setStatus(e.target.value)} className="border rounded-lg px-2 py-2 text-sm">
            <option value="">All statuses</option>{["approved", "needs_review", "draft", "retired"].map(s => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
          </select>
        </div>
      )}

      {view === "fixes" ? (
        <div className="space-y-3">
          <button onClick={copyFixes} className="px-3 py-1.5 rounded-lg text-sm bg-gray-900 text-white">Copy all fixes</button>
          {fixes.map(f => (
            <div key={f.correction.id} className="bg-white border rounded-xl p-4 text-sm space-y-2">
              <div className="font-medium">{f.website.question}</div>
              <div><span className="text-gray-500">Website says: </span>{f.website.answer}</div>
              <div><span className="text-gray-500">Should say: </span>{f.correction.answer}</div>
              <div className="text-xs text-gray-500">{SOURCE_LABEL[f.correction.source]} · {f.correction.decided_reason}</div>
            </div>
          ))}
          {!fixes.length && <p className="text-sm text-gray-500">No website fixes waiting.</p>}
        </div>
      ) : (
        <div className="bg-white border rounded-xl divide-y">
          {loading && <p className="p-4 text-sm text-gray-500">Loading…</p>}
          {!loading && !shown.length && <p className="p-4 text-sm text-gray-500">{view === "needs" ? "Nothing needs you right now." : "No answers match."}</p>}
          {shown.slice(0, 300).map(e => (
            <div key={e.id} className="p-3 text-sm">
              <button onClick={() => openEntry(e)} className="w-full text-left flex flex-wrap gap-2 items-baseline">
                <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_STYLE[e.status] || ""}`}>{e.status.replace("_", " ")}</span>
                <span className="text-xs text-gray-500">{SOURCE_LABEL[e.source]} · {e.topic}</span>
                <span className="font-medium flex-1 min-w-0">{e.question}</span>
              </button>
              {open === e.id && (
                <div className="mt-3 space-y-3">
                  {edit ? (
                    <div className="space-y-2">
                      <input value={edit.question} onChange={x => setEdit({ ...edit, question: x.target.value })} className="border rounded-lg px-3 py-2 w-full" />
                      <textarea value={edit.answer} onChange={x => setEdit({ ...edit, answer: x.target.value })} rows={5} className="border rounded-lg px-3 py-2 w-full" />
                      <input value={edit.link} onChange={x => setEdit({ ...edit, link: x.target.value })} placeholder="More link (optional), e.g. /pages/warranty" className="border rounded-lg px-3 py-2 w-full" />
                      <div className="flex gap-2">
                        <button onClick={() => patch(e.id, { question: edit.question, answer: edit.answer, link: edit.link, status: "approved" })} className="px-3 py-1.5 rounded-lg bg-gray-900 text-white">Save and approve</button>
                        <button onClick={() => setEdit(null)} className="px-3 py-1.5 rounded-lg border">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="whitespace-pre-wrap">{e.answer}</p>
                      {e.link && <p className="text-xs text-gray-500">More: {e.link}</p>}
                      <p className="text-xs text-gray-500">{e.decided_reason} · {e.decided_by} · {when(e.updated_at)}{e.source_ref ? ` · ${e.source_ref}` : ""}</p>
                      <div className="flex flex-wrap gap-2">
                        {e.status !== "approved" && <button onClick={() => patch(e.id, { status: "approved", decided_reason: "Approved in the Knowledge tab" })} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white">Approve</button>}
                        <button onClick={() => setEdit({ question: e.question, answer: e.answer, link: e.link || "" })} className="px-3 py-1.5 rounded-lg border">Edit</button>
                        {e.status !== "retired" && <button onClick={() => patch(e.id, { status: "retired", decided_reason: "Retired in the Knowledge tab" })} className="px-3 py-1.5 rounded-lg border">Retire</button>}
                      </div>
                    </>
                  )}
                  {hist.length > 0 && (
                    <details className="text-xs text-gray-600">
                      <summary className="cursor-pointer">History ({hist.length})</summary>
                      <ul className="mt-2 space-y-1">
                        {hist.map(h => (
                          <li key={h.id} className="flex flex-wrap gap-2 items-center">
                            <span>{when(h.changed_at)} · {h.changed_by} · {h.reason}</span>
                            {h.before && <button onClick={() => undo(h)} className="underline">Undo</button>}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Register the tab**

`src/lib/tabs.ts` Websites section: after `{ id: "assistants", label: "AI Assistants" },` add `{ id: "knowledge", label: "Knowledge (UPPAbaby)" },`.

`src/components/DashboardTabs.tsx`:
- import: `import { KnowledgeBase } from "./KnowledgeBase";`
- `TabId` union: add `| "knowledge"`.
- `TABS`: after the `assistants` object add:

```tsx
  {
    id: "knowledge", label: "Knowledge (UPPAbaby)",
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13M12 6.253C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>,
  },
```

- Websites nav group ids: `["assistants", "knowledge", "discount-codes", ...]`.
- Render block after the `assistants` block:

```tsx
          {active === "knowledge" && (
            <>
              <SectionBar title="Knowledge (UPPAbaby)" />
              <KnowledgeBase />
            </>
          )}
```

- [ ] **Step 3: Check it in the browser**

Run: `npm run dev`, sign in as an approver, open the Knowledge tab.
Expected: "Needs you" lists draft and needs_review entries; "All answers" shows about 495 website entries plus seeds; "Website fixes" lists each confirmed correction with the website text beside it; Edit, Approve, Retire and Undo work and each change appears in History; a save containing `0412 345 678` shows "Not saved. It contains a phone number."

- [ ] **Step 4: Lint, type-check, commit**

Run: `npm run lint && npx tsc --noEmit -p . && npm test`
Expected: no errors.

```bash
git add src/components/KnowledgeBase.tsx src/components/DashboardTabs.tsx src/lib/tabs.ts
git commit -m "Knowledge base: Knowledge tab with Needs you, All answers, Website fixes, history and undo"
```

---

### Task 7: Reader with cache and fallback

**Files:**
- Create: `src/lib/kb/read.ts`
- Test: `src/lib/kb/read.test.ts`

**Interfaces:**
- Consumes: `fileWrittenAnswers`, `formatWrittenAnswers`, `chooseEntriesForChat`, `KbEntry`, `FaqItem`.
- Produces:
  - `type Fetcher = (url: string, init?: RequestInit) => Promise<Response>`
  - `createWrittenAnswers(opts: { mode: string | undefined; faq: FaqItem[]; url?: string; key?: string; brand: string; fetcher?: Fetcher; now?: () => number; timeoutMs?: number; ttlMs?: number }): () => Promise<{ text: string; from: "file" | "db" | "fallback" }>`

- [ ] **Step 1: Write the failing tests**

`src/lib/kb/read.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to see them fail**

Run: `npm test`
Expected: FAIL, cannot find `./read.ts`.

- [ ] **Step 3: Implement `src/lib/kb/read.ts`**

```ts
import { fileWrittenAnswers, formatWrittenAnswers, chooseEntriesForChat, type KbEntry, type FaqItem } from "./core.ts";

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

// Returns a function giving the WRITTEN ANSWERS block. "db" mode reads approved entries (cached),
// and falls back to the last good result, then to the file, on any failure or slowness.
export function createWrittenAnswers(opts: { mode: string | undefined; faq: FaqItem[]; url?: string; key?: string; brand: string;
  fetcher?: Fetcher; now?: () => number; timeoutMs?: number; ttlMs?: number }) {
  const fileText = fileWrittenAnswers(opts.faq);
  const mode = opts.mode === "db" ? "db" : "file";
  const fetcher = opts.fetcher || ((u, i) => fetch(u, i));
  const now = opts.now || Date.now, timeoutMs = opts.timeoutMs ?? 2500, ttlMs = opts.ttlMs ?? 5 * 60 * 1000;
  let cache: { at: number; text: string } | null = null;

  return async function get(): Promise<{ text: string; from: "file" | "db" | "fallback" }> {
    if (mode === "file") return { text: fileText, from: "file" };
    if (cache && now() - cache.at < ttlMs) return { text: cache.text, from: "db" };
    if (!opts.url || !opts.key) return { text: fileText, from: "fallback" };
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetcher(`${opts.url}/rest/v1/kb_entries?select=*&brand=eq.${encodeURIComponent(opts.brand)}&status=eq.approved&order=sort_order.asc,id.asc&limit=5000`,
        { headers: { apikey: opts.key, Authorization: `Bearer ${opts.key}` }, cache: "no-store", signal: ctl.signal });
      if (!res.ok) throw new Error(`kb ${res.status}`);
      const rows = (await res.json()) as KbEntry[];
      const chosen = chooseEntriesForChat(rows);
      if (!chosen.length) throw new Error("kb empty");
      cache = { at: now(), text: formatWrittenAnswers(chosen) };
      return { text: cache.text, from: "db" };
    } catch {
      if (cache) { cache = { at: now(), text: cache.text }; return { text: cache.text, from: "db" }; }
      return { text: fileText, from: "fallback" };
    } finally { clearTimeout(timer); }
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/kb/read.ts src/lib/kb/read.test.ts
git commit -m "Knowledge base: reader with 5 minute cache and fallback to the file"
```

---

### Task 8: Chat route reads its written answers through the reader

**Files:**
- Modify: `src/app/api/uppababy-chat/route.ts`

**Interfaces:**
- Consumes: `createWrittenAnswers` from `src/lib/kb/read.ts`.

- [ ] **Step 1: Split STATIC so the written answers come from the reader**

In `route.ts`, replace the `STATIC` constant with a base (every section except written answers, same text and order) and a function that appends the written answers:

```ts
import { createWrittenAnswers } from "@/lib/kb/read";

const STATIC_BASE = [
  `STORE\n${Object.entries(K.store).map(([k, v]) => `${k}: ${v}`).join("\n")}`,
  `PAGES (use these relative links)\n${Object.entries(K.pages).map(([k, v]) => `${k}: ${v}`).join("\n")}`,
  `COLLECTIONS\n${Object.entries(K.collections).map(([k, v]) => `${k}: ${v}`).join("\n")}`,
  `THE RANGE\n${K.models.map((m: any) => `${m.model} — ${m.job}\n${m.intro}\nFacts: ${m.facts}`).join("\n\n")}`,
  `MESA CAR CAPSULE\n${K.capsule.intro}\nDirect fit: ${JSON.stringify(K.capsule.direct_fit)}\nWith adapters: ${JSON.stringify(K.capsule.adapter_fit)}\nApproval: ${JSON.stringify(K.capsule.approval)}`,
  `ADAPTERS AND WHAT FITS WHAT\n${JSON.stringify(K.adapters)}`,
  `STOCKISTS: ${K.stockists.count} shops, listed with addresses and phone numbers at ${K.stockists.page}. By state:\n${Object.entries(K.stockists.by_state).map(([s, v]: any) => `${s}: ${v.join("; ")}`).join("\n")}`,
];
// Written answers: from the knowledge file (default) or the knowledge base when UPPABABY_KB_MODE=db.
const writtenAnswers = createWrittenAnswers({ mode: process.env.UPPABABY_KB_MODE, faq: K.faq, brand: "uppababy",
  url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY });
async function staticPrompt() { return [...STATIC_BASE, (await writtenAnswers()).text].join("\n\n"); }
```

In `ask()`, replace `{ type: "text", text: STATIC, cache_control: { type: "ephemeral" } },` with `{ type: "text", text: await staticPrompt(), cache_control: { type: "ephemeral" } },`. Change nothing else in the file.

- [ ] **Step 2: Prove file mode is byte-identical to today**

Run (from the repo root):

```bash
node --input-type=module -e '
import { readFileSync } from "node:fs";
import { fileWrittenAnswers } from "./src/lib/kb/core.ts";
const K = JSON.parse(readFileSync("src/data/uppababy-knowledge.json", "utf8"));
const old = `WRITTEN ANSWERS\n${K.faq.map(f => `[${f.topic}] Q: ${f.q}\nA: ${f.a}${f.link ? `\nMore: ${f.link}` : ""}`).join("\n\n")}`;
console.log(fileWrittenAnswers(K.faq) === old ? "FILE MODE IDENTICAL" : "DIFFERENT");'
```

Expected: `FILE MODE IDENTICAL`. The unit test in Task 1 pins the same format for future changes.

- [ ] **Step 3: Replay-mode bypass for testing (no logging, no rate limit)**

So the replay in Task 9 does not fill the AI Assistants feed or hit the rate limit, add at the top of `POST`:

```ts
  const replay = !!process.env.KB_REPLAY_SECRET && req.headers.get("x-kb-replay") === process.env.KB_REPLAY_SECRET;
```

Change `if (limited(ip))` to `if (!replay && limited(ip))`, and wrap the `after(...)` log call in `if (!replay) { ... }`. When `KB_REPLAY_SECRET` is unset (production default) nothing changes.

- [ ] **Step 4: Type-check, lint, test, commit**

Run: `npx tsc --noEmit -p . && npm run lint && npm test`
Expected: no errors.

```bash
git add src/app/api/uppababy-chat/route.ts
git commit -m "Ask UPPAbaby: written answers via the knowledge base reader (UPPABABY_KB_MODE, default file)"
```

---

### Task 9: Baseline, replay on a preview, pull request, go-live runbook

**Files:**
- Create: `scripts/kb-replay.ts`
- Create: `data/kb-seed/uppababy-standing-questions.json`
- Create: `docs/kb-go-live.md`

**Interfaces:**
- Consumes: the chat endpoint `POST /api/uppababy-chat` (`{ messages, session, page }` → `{ ok, reply }`), header `x-kb-replay`.

- [ ] **Step 1: Standing questions**

`data/kb-seed/uppababy-standing-questions.json`: `{ "questions": [ ... ] }` with about 40 questions, including one per confirmed fact, for example "Can I fold the Vista V3 with the toddler seat on?", "Can I put the Minu V3 fabrics in the washing machine?", "Does the Mesa fit the Kona without adapters?", "Does the bassinet fit the Minu V3?", "What is the weight limit of the Minu V3?", "My Vista was in a car accident, is it covered by Crash Exchange?", "From what age can my baby use the RumbleSeat?", "Does the BeSafe capsule fit my Vista?", "Is there a warranty on a floor display pram from Baby Bunting?", "Who can come to a Tune-Up Day?", plus common questions: warranty length, where is my serial number, Vista in a small boot, which pram for two children, where can I see one near me, TravelSafe, spare parts, delivery.

- [ ] **Step 2: Replay script**

`scripts/kb-replay.ts`:

```ts
// Replay real and standing questions against a chat endpoint and write a comparison.
// Usage: node scripts/kb-replay.ts <endpoint> <out.json> [--sample 100]
// Needs KB_REPLAY_SECRET (same value as the target deployment) and Supabase env to sample real questions.
import { readFileSync, writeFileSync } from "node:fs";

const [endpoint, out] = process.argv.slice(2);
const n = Number(process.argv[process.argv.indexOf("--sample") + 1]) || 100;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!, key = process.env.SUPABASE_SERVICE_ROLE_KEY!, secret = process.env.KB_REPLAY_SECRET!;
if (!endpoint || !out || !secret) { console.error("usage: node scripts/kb-replay.ts <endpoint> <out.json> (KB_REPLAY_SECRET set)"); process.exit(1); }

const real = await (await fetch(`${url}/rest/v1/assistant_logs?select=id,question,answer,created_at&brand=eq.uppababy&role=eq.assistant&question=neq.&order=created_at.desc&limit=${n * 3}`,
  { headers: { apikey: key, Authorization: `Bearer ${key}` } })).json() as { id: number; question: string; answer: string }[];
const seen = new Set<string>(); const sample = real.filter(r => { const k = r.question.toLowerCase().trim(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, n);
const standing = JSON.parse(readFileSync("data/kb-seed/uppababy-standing-questions.json", "utf8")).questions as string[];
const items = [...standing.map(q => ({ kind: "standing", question: q, before: null as string | null })), ...sample.map(r => ({ kind: "real", question: r.question, before: r.answer }))];

const results = [];
for (const it of items) {
  const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", "x-kb-replay": secret },
    body: JSON.stringify({ messages: [{ role: "user", content: it.question }], session: `kb-replay-${Date.now()}`, page: "/kb-replay" }) });
  const j = await res.json().catch(() => ({}));
  results.push({ ...it, after: j.reply || `ERROR ${res.status} ${j.error || ""}` });
  console.log(`${results.length}/${items.length}`);
}
writeFileSync(out, JSON.stringify(results, null, 1));
console.log(`wrote ${out}`);
```

- [ ] **Step 3: Push the branch and get a preview with the knowledge base on**

```bash
git add scripts/kb-replay.ts data/kb-seed/uppababy-standing-questions.json
git commit -m "Knowledge base: replay script and standing test questions"
git push -u origin kb/uppababy-knowledge-base
```

Set preview-only env vars on Vercel for the branch (never production): `vercel env add UPPABABY_KB_MODE preview` value `db` (scope to branch `kb/uppababy-knowledge-base` when prompted), `vercel env add KB_REPLAY_SECRET preview` with a random value (`openssl rand -hex 16`). Redeploy the branch. If the preview is behind Vercel deployment protection, use a protection bypass token (`x-vercel-protection-bypass` header) in the replay script's fetch, added via an env var `VERCEL_BYPASS`.

- [ ] **Step 4: Baseline and replay**

Baseline for standing questions: run the replay against production in `file` mode is not possible without the secret there, so take the standing-question baseline from the preview with `UPPABABY_KB_MODE=file` first (redeploy with `file`, run `node scripts/kb-replay.ts <preview>/api/uppababy-chat replay-file.json`), then switch the preview to `db`, redeploy, and run `node scripts/kb-replay.ts <preview>/api/uppababy-chat replay-db.json`. Real questions compare against what customers actually received (`before`).

- [ ] **Step 5: Review the comparison**

Read `replay-file.json` against `replay-db.json` question by question. Pass criteria:
- every confirmed-fact question answers with the confirmed fact in `db` and is unchanged or wrong in `file`;
- no other answer loses a correct fact, a working link or the tone (plain, short, no em dashes);
- no `ERROR` rows.
Write the findings to `docs/kb-replay-2026-10.md` (counts, every changed answer with before and after, verdict). Anything worse is fixed in the entries (not the prompt) and replayed.

- [ ] **Step 6: Go-live runbook**

`docs/kb-go-live.md`:

```markdown
# Ask UPPAbaby: switching to the knowledge base

Only when David says go.

1. Check the latest replay report in docs/ shows no answer got worse.
2. Vercel > Brand-Dashboard > Settings > Environment Variables: set UPPABABY_KB_MODE = db for Production.
3. Redeploy production (Deployments > latest > Redeploy).
4. Ask three questions on uppababy.com.au: one confirmed fact (fold the Vista with the seat on), one common question (warranty length), one product question (Vista price). Check the answers.

Off switch: set UPPABABY_KB_MODE = file (or delete it) and redeploy. The chat returns to the knowledge file.
KB_REPLAY_SECRET must never be set on Production.
```

- [ ] **Step 7: Pull request and ping Melanie**

```bash
git add docs/kb-go-live.md docs/kb-replay-2026-10.md
git commit -m "Knowledge base: replay findings and go-live runbook"
git push
gh pr create --base main --head kb/uppababy-knowledge-base --title "UPPAbaby knowledge base (behind UPPABABY_KB_MODE, default off)" --reviewer Mel5616 --body-file <(printf '%s\n' \
"Adds a shared UPPAbaby knowledge base (kb_entries, kb_history) with a Knowledge tab for David and Melanie, and lets Ask UPPAbaby read its written answers from it." \
"" \
"Production behaviour is unchanged: UPPABABY_KB_MODE defaults to file. Parity check: db mode with website answers only is byte-identical. Replay findings in docs/kb-replay-2026-10.md. Go-live steps in docs/kb-go-live.md." \
"" \
"Spec: UPPAbaby knowledge base design, 1 Oct 2026." \
"" \
"🤖 Generated with [Claude Code](https://claude.com/claude-code)")
```

Then show David the Teams message to Melanie before sending it, for example: "Hi Mel, David asked me to set up a shared UPPAbaby knowledge base in the dashboard. The pull request is ready for your review: <PR link>. Nothing changes on uppababy.com.au until it is switched on; the chat still reads the knowledge file by default." Send via the Microsoft 365 Teams chat tool only after David approves the wording.

---

## Later plans (not in this plan)

Phase 3 (helpdesk review, fortnightly summary, Save as answer) and Phase 4 (help centre articles built from entries) each get their own plan once Phases 1 and 2 are merged and live.
