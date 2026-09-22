-- Same purpose as add_edm_drafts_campaign_link.sql — lets a blog draft show
-- as connected to the campaign it was generated for.
alter table blog_drafts add column if not exists campaign_id uuid;
alter table blog_drafts add column if not exists campaign_name text;
create index if not exists blog_drafts_campaign_idx on blog_drafts (campaign_id);
