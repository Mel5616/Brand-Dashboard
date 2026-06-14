-- Add Google Ads table
-- Run in Supabase SQL Editor

create table if not exists google_ads (
  brand_id    int references brands(id) on delete cascade,
  month_key   text,
  spend       numeric default 0,
  impressions int     default 0,
  clicks      int     default 0,
  roas        numeric default 0,
  primary key (brand_id, month_key)
);

alter table google_ads enable row level security;
create policy "public read google_ads" on google_ads for select using (true);
