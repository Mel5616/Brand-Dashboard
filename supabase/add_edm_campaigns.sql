-- Email campaigns (EDMs) with a cached creative thumbnail, for the report and the Email tab.
-- Populated by scripts/sync_klaviyo_campaigns.py (which also creates a public 'edm' Storage bucket).
-- Run this once in the Supabase SQL editor.
create table if not exists edm_campaigns (
  brand_id    int  not null,
  campaign_id text not null,
  month_key   text,
  name        text,
  subject     text,
  sent_at     timestamptz,
  image_url   text,
  web_url     text,
  synced_at   timestamptz not null default now(),
  primary key (brand_id, campaign_id)
);
alter table edm_campaigns disable row level security;
