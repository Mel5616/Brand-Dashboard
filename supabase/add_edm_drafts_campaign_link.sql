-- Links an edm_draft back to the campaign it was generated/sent for, so a
-- multi-email series (e.g. "Generate campaign kit"'s 3 EDMs, or a campaign's
-- hand-written emails sent via "Send to Email Planner") can be shown as a
-- connected set instead of unrelated one-off drafts. campaign_name is
-- denormalised (not a foreign key join) so Email Writing/EDM Planner don't
-- need to fetch the campaigns table just to show a label.
alter table edm_drafts add column if not exists campaign_id uuid;
alter table edm_drafts add column if not exists campaign_name text;
create index if not exists edm_drafts_campaign_idx on edm_drafts (campaign_id);
