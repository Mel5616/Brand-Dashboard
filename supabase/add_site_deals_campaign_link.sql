-- Same purpose as add_edm_drafts_campaign_link.sql — lets a D2C site promo
-- show as connected to the campaign it was created for, so a campaign's
-- offer can be laid out clearly and flow straight into the promotions
-- tracker instead of being retyped by hand.
alter table site_deals add column if not exists campaign_id uuid;
alter table site_deals add column if not exists campaign_name text;
create index if not exists site_deals_campaign_idx on site_deals (campaign_id);
