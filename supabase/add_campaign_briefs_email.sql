-- Tracks when a brief was actually emailed to each assigned influencer
-- (separate from being merely "assigned" in the dashboard).
alter table campaign_brief_influencers add column if not exists emailed_at timestamptz;
