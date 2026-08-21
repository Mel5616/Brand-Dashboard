-- Team gift-log results form (/log-gift) previously only captured Likes and
-- Reach per content piece. Adding Engagement / Shares / Saves / New followers
-- to match what's already tracked on Influencer Agreements deliverables.
-- influencer_entries.engagements already exists (add_influencer_social.sql).
alter table influencer_entries add column if not exists shares int;
alter table influencer_entries add column if not exists saves int;
alter table influencer_entries add column if not exists new_followers int;

alter table influencer_content add column if not exists engagements int;
alter table influencer_content add column if not exists shares int;
alter table influencer_content add column if not exists saves int;
alter table influencer_content add column if not exists new_followers int;
