-- Social-post performance fields for the influencer gifting board.
-- (reach, content_url, engagements, status already exist on influencer_entries.)
-- Run once in Supabase.
alter table influencer_entries add column if not exists likes int;
alter table influencer_entries add column if not exists posted_at date;
alter table influencer_entries add column if not exists content_type text;  -- Reel | Post | Story | Other
