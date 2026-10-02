# UPPAbaby knowledge base: design

Date: 1 October 2026. Approved in conversation by David Kingsford; approvers David and Melanie.

## Purpose

One shared knowledge base that feeds:

1. the "Ask UPPAbaby" chat on uppababy.com.au,
2. the same chat on the help centre (help.uppababy.com.au),
3. the help centre articles,
4. a list of fixes for uppababy.com.au wherever the website disagrees with an approved answer.

It grows from helpdesk questions and team chat replies, mostly without manual approval.

## Hard requirement: today's chat must keep working as well as it does now

The uppababy.com.au chat answers well today. The design changes only the list of written answers it reads. On day one that list is identical to today's, so behaviour is identical. Nothing customer-facing switches until a replay of real customer questions shows the answers are the same or better, and David says go.

## Where things live today (found 1 Oct 2026)

- Chat: `Brand-Dashboard` repo (GitHub `Mel5616/Brand-Dashboard`, Vercel, marketing.coolkidz.com.au), route `src/app/api/uppababy-chat/route.ts`.
- Its knowledge: `src/data/uppababy-knowledge.json`, generated in a separate `uppababy-site` repo (not on GitHub under this account, not on David's Mac) by `scripts/build_knowledge.py`. Sections: `store`, `pages`, `collections`, `models`, `capsule`, `adapters`, `stockists`, `faq` (495 written answers: `topic`, `q`, `a`, `link`).
- The prompt is `PERSONA` (rules) + `STATIC` (the sections above, prompt-cached) + live Shopify products.
- Conversations: Supabase table `assistant_logs` (brand, session, page, question, answer, handoff, role). Team replies are rows with `role = 'human'`. Shown on the dashboard "AI Assistants" tab (`AssistantFeed`).
- Dashboard access: `src/lib/access.ts`, admins from `ADMIN_EMAILS` (default mel@coolkidz.com.au).

## Data model (Supabase, Brand-Dashboard project)

`kb_entries`

| column | notes |
|---|---|
| id | bigint identity |
| brand | text, `uppababy` (lets Frida/Zazu reuse it later; not in scope now) |
| topic | text, same topic names the FAQ uses (e.g. `Vista V3`, `Warranty`) |
| models | text[] |
| question | text |
| answer | text, chat style: plain, short, `[label](/path)` links |
| link | text, optional "More:" link, as in the FAQ today |
| source | `website` \| `confirmed` \| `help_centre` \| `helpdesk` \| `team_reply` |
| source_ref | text: page path, article id, confirmed-fact note, "asked N times Jun-Sep 2026", or assistant_logs id. Never customer details |
| ext_key | text, stable key per brand: website = hash of topic + question; `fact:<slug>`; `article:<id>:<n>`; `helpdesk:<slug>`; `log:<id>`. Lets loaders re-run safely |
| sort_order | integer: website entries keep their position in the knowledge file; a correction takes the position of the entry it replaces; new entries go after |
| corrects | bigint, the `website` entry this one replaces |
| status | `approved` \| `draft` \| `needs_review` \| `retired` |
| decided_by | text: `claude` (auto), or approver email |
| decided_reason | text: why approved, or why it needs review |
| checked_at, created_at, updated_at | timestamptz |

`kb_history`: entry id, before/after JSON, changed_by, reason, changed_at (trigger on update).

Access: service role only (chat server, sync jobs, Claude); dashboard reads and writes through its own API routes gated to approvers.

## Which answer wins

confirmed > help_centre > approved helpdesk / team_reply > website.
A website entry with an approved `corrects` pointing at it is left out of the chat and appears on the Website fixes list.

## Approval rules (Claude approves most entries)

Claude marks an entry `approved` when all hold:

- backed by a citable source: uppababy.com.au, David's confirmed facts, an existing approved entry, or for cleaning, folding and care, UPPAbaby's worldwide support site (support.uppababy.com);
- no contradiction with any approved entry;
- everyday topic: use, folding, cleaning, fitting, parts, where to buy, how to lodge a request, serial numbers.

It becomes `needs_review` (David or Melanie decide) when any hold:

- it contradicts the website, a confirmed fact or an approved entry;
- warranty decisions, refunds or policy; safety or legal claims; prices or offers; health or safe sleep;
- the only source is a staff reply in a ticket.

Every automatic decision records its source and reason, and can be undone from the Knowledge tab.

## Components

1. **Tables and loader.** Create `kb_entries`, `kb_history`. Load: the 495 website FAQs (`source=website`, `approved`), David's confirmed facts (`confirmed`, with `corrects` set where the site is wrong), the 34 rewritten help centre articles split into question-level entries (`help_centre`).
2. **Chat reads the knowledge base.** In `uppababy-chat/route.ts` only the `WRITTEN ANSWERS` block changes: built from approved entries, winners applied, corrected website entries left out, in exactly today's format and in `sort_order`, which starts as the knowledge file's own order. Everything else in the prompt is unchanged. Entries cached in memory for 5 minutes so the cached prompt prefix stays stable. Setting `UPPABABY_KB_MODE=file|db` (default `file` until go-live) switches back instantly. If Supabase fails, fall back to the file.
3. **Knowledge tab** in the dashboard (Websites group, approvers only): search and filter (topic, model, source, status), edit, approve, retire, undo from history; "Needs you" list; "Website fixes" list with copy/export.
4. **Website sync.** Script that reads a new `uppababy-knowledge.json` and upserts `website` entries by `ext_key`. A changed website answer that has an approved correction stays corrected; a changed answer without one is re-checked by Claude under the approval rules. A reworded website question gets a new key, so it arrives as a new entry and the old one is retired; any correction pointing at the old one is carried across when the topic and meaning match, otherwise it goes to "Needs you".
5. **Helpdesk review (fortnightly).** Claude reads recent UPPAbaby desk tickets through the Freshdesk API, groups repeated questions, writes general question-and-answer entries with a count, applies the approval rules, and sends David a short summary: added, changed, needs you. Runs with the existing fortnightly website check.
6. **Save as answer.** Button on each team reply in the AI Assistants tab; creates an entry under the same rules.
7. **Help centre articles from entries.** The theme's article build reads approved entries so an approved change flows into the matching article.

## Safeguards

- Customer details: anything from tickets or logs is rejected if it contains an email address, phone number, street address or order number; helpdesk entries are written as general questions.
- Only `approved` entries reach customers.
- Full change history; one-click undo.

## Testing and switch-over

- **Baseline:** save today's live answers for about 100 real customer questions sampled from `assistant_logs` (recent weeks) plus a standing list of about 40 questions, including every corrected fact (fold direction, Kona and Mesa, hand wash, Minu 22.7 kg, bassinet not on Minu V3, Crash Exchange Mesa only, RumbleSeat from 6 months, BeSafe not sold).
- **Parity check:** in `db` mode with no corrections applied, the written answers block must be byte-identical to `file` mode.
- **Replay:** run the question set against a Vercel preview in `db` mode; compare with the baseline. Switch only when corrected facts are right and no other answer is worse (Claude reviews; disagreements go to David).
- **Go-live:** David says go; set `UPPABABY_KB_MODE=db` on production. Off switch: set it back to `file`.
- **Ongoing:** rerun the question set after each fortnightly update before new entries go live; anything that gets worse is held for David.

## Build order

1. Tables, loader, Knowledge tab. No customer-facing change.
2. Chat reads the knowledge base (behind `UPPABABY_KB_MODE`), baseline and replay on a preview, go-live on David's say-so.
3. Helpdesk review, summary, Save as answer.
4. Help centre articles built from entries.

## Out of scope

Frida and Zazu assistants; editing the `uppababy-site` repo; changing the chat's rules, tone or product data.

## Notes

- Melanie owns and maintains the Brand-Dashboard app, so changes land there as pull requests for her to see.
- The fortnightly jobs run as Claude scheduled tasks, which only run while the Claude app is open on David's Mac.
