-- Same purpose as add_edm_drafts_campaign_link.sql — lets a Website Request
-- ticket show as connected to the campaign it was filed for.
alter table website_requests add column if not exists campaign_id uuid;
alter table website_requests add column if not exists campaign_name text;
create index if not exists website_requests_campaign_idx on website_requests (campaign_id);
