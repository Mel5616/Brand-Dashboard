# Ask UPPAbaby: switching to the knowledge base

Only when David says go. Until then Production keeps reading the knowledge file (UPPABABY_KB_MODE defaults to file).

## Before switching

The replay runs against a branch preview, so the preview needs the same keys Production has. Vercel does not copy them across.

1. Melanie, in Vercel > brand-dashboard > Settings > Environment Variables, adds the Preview environment to each of these existing variables: ANTHROPIC_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SHOPIFY_CLIENT_CREDS. Production values stay as they are. If SHOPIFY_CLIENT_CREDS is missing from Preview, the chat silently answers without live prices, stock or product links, so the replay would look worse in both modes.
2. Set two Preview-only variables for the branch kb/uppababy-knowledge-base: UPPABABY_KB_MODE (file to start with) and KB_REPLAY_SECRET (a random value, for example from `openssl rand -hex 16`). If the preview is behind Vercel deployment protection, create a protection bypass token and keep it for the replay as VERCEL_BYPASS.
3. Deploy the branch preview, then run the replay three times. Each run needs KB_REPLAY_SECRET set to the same value as the preview (and VERCEL_BYPASS if protection is on):
   - With UPPABABY_KB_MODE=file: `node scripts/kb-replay.ts <preview>/api/uppababy-chat data/kb-seed/uppababy-standing-questions.json replay-file.json`
   - Change UPPABABY_KB_MODE to db, redeploy the preview, and run the same command with `replay-db.json` as the output.
   - Still in db mode, run the real-question sample: `node scripts/kb-replay.ts <preview>/api/uppababy-chat <real-questions.json> replay-real-db.json`. Its answers are compared with what customers actually received (the before field).

   real-questions.json is an export of public.assistant_logs for brand uppababy: the latest 100 or so unique customer questions, with the answer each customer received as the before field, in the `{ "items": [{ "question", "before" }] }` shape kb-replay.ts reads. Make it with the Supabase SQL editor or the Supabase MCP. It holds real customer text, so keep it outside the repo folder and never commit it. The replay outputs (replay-*.json) are ignored by git for the same reason, and so is any real-questions*.json saved in the repo by mistake.
4. Review the results question by question:
   - Every confirmed-fact question gives the confirmed fact in db mode.
   - No other answer loses a correct fact, a working link or the tone (plain, short, no em dashes).
   - No ERROR rows.
   Fix anything worse in the knowledge entries, not the prompt, and replay again.
   Write the findings in `docs/kb-replay-2026-10.md`: counts and paraphrased examples only, never customer text.
5. David reads the findings and says go.

## Switching

1. Check the replay findings in `docs/kb-replay-2026-10.md` show no answer got worse.
2. Vercel > brand-dashboard > Settings > Environment Variables: set UPPABABY_KB_MODE = db for Production.
3. Redeploy production (Deployments > latest > Redeploy).
4. Ask three questions on uppababy.com.au: one confirmed fact (fold the Vista with the seat on), one common question (warranty length), one product question (Vista price). Check the answers.

## Off switch

Set UPPABABY_KB_MODE = file (or delete it) and redeploy. The chat returns to the knowledge file.

KB_REPLAY_SECRET must never be set on Production.

## Keeping answers current

Re-running the loader is safe. It adds new rows, refreshes only the wording of existing website answers (topic, question, answer, link, page and order) and never changes approvals, retirements, edits or corrections. Seed rows that already exist are left alone.

Website sync (spec component 4) is a planned follow-up. Until then, whenever src/data/uppababy-knowledge.json is regenerated, run `node scripts/kb-load.ts --sql <dir>` and apply the files in name order through the Supabase SQL editor or the Supabase MCP to pick up website wording changes.

Supabase returns at most 1000 rows per request by default. There are about 580 entries today, so the Knowledge tab and the chat reader see them all, but they need pagination before Phase 3 grows the table past 1000. The loader already pages its reads.
