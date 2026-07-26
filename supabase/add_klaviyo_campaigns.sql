-- Recent Klaviyo email campaigns (last ~3 weeks per sync) with per-campaign
-- results — feeds the weekly brief's "email sends this week" panel.
create table if not exists klaviyo_campaigns (
  brand_id    int  not null,
  campaign_id text not null,
  name        text not null,
  sent_at     timestamptz,
  recipients  int,
  open_rate   numeric,
  click_rate  numeric,
  revenue     numeric,
  synced_at   timestamptz not null default now(),
  primary key (brand_id, campaign_id)
);
alter table klaviyo_campaigns disable row level security;
