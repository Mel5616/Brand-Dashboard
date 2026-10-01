# Ask UPPAbaby: switching to the knowledge base

Only when David says go. Until then Production keeps reading the knowledge file (UPPABABY_KB_MODE defaults to file).

## Before switching

The replay runs against a branch preview, so the preview needs the same keys Production has. Vercel does not copy them across.

1. Melanie, in Vercel > brand-dashboard > Settings > Environment Variables, adds the Preview environment to each of these existing variables: ANTHROPIC_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, UPPABABY_SHOPIFY_TOKEN and UPPABABY_SHOPIFY_DOMAIN. Production values stay as they are.
2. Set two Preview-only variables for the branch kb/uppababy-knowledge-base: UPPABABY_KB_MODE (file to start with) and KB_REPLAY_SECRET (a random value, for example from `openssl rand -hex 16`). If the preview is behind Vercel deployment protection, create a protection bypass token and keep it for the replay as VERCEL_BYPASS.
3. Deploy the branch preview, then run the replay three times. Each run needs KB_REPLAY_SECRET set to the same value as the preview (and VERCEL_BYPASS if protection is on):
   - With UPPABABY_KB_MODE=file: `node scripts/kb-replay.ts <preview>/api/uppababy-chat data/kb-seed/uppababy-standing-questions.json replay-file.json`
   - Change UPPABABY_KB_MODE to db, redeploy the preview, and run the same command with `replay-db.json` as the output.
   - Still in db mode, run the real-question sample: `node scripts/kb-replay.ts <preview>/api/uppababy-chat <real-questions.json> replay-real-db.json`. Its answers are compared with what customers actually received (the before field).
4. Review the results question by question:
   - Every confirmed-fact question gives the confirmed fact in db mode.
   - No other answer loses a correct fact, a working link or the tone (plain, short, no em dashes).
   - No ERROR rows.
   Fix anything worse in the knowledge entries, not the prompt, and replay again.
5. David reads the findings and says go.

## Switching

1. Check the latest replay findings in docs/ show no answer got worse.
2. Vercel > brand-dashboard > Settings > Environment Variables: set UPPABABY_KB_MODE = db for Production.
3. Redeploy production (Deployments > latest > Redeploy).
4. Ask three questions on uppababy.com.au: one confirmed fact (fold the Vista with the seat on), one common question (warranty length), one product question (Vista price). Check the answers.

## Off switch

Set UPPABABY_KB_MODE = file (or delete it) and redeploy. The chat returns to the knowledge file.

KB_REPLAY_SECRET must never be set on Production.
