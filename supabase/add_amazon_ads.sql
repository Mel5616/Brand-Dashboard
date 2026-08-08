-- Amazon Ads as a paid channel, mirroring pinterest_ads / google_ads in shape
-- (brand_id, month_key, spend, sales, roas) so it plugs into the same
-- blended-cost math as every other platform. No live API — Amazon Ads
-- requires an approved developer app, so this is filled by uploading the
-- "Advertised product" report from Amazon Ads console each month (parsed
-- and rolled up by brand in the Marketing Budget tab's Amazon Ads card).
-- Deliberately kept OUT of marketing_actuals: Amazon spend isn't part of
-- the planned annual channel budget, it's tracked separately as its own
-- line so it never reads as "over/under budget" against a target that
-- was never set for it.

create table if not exists amazon_ads (
  brand_id    int     not null,
  month_key   text    not null,     -- 'YYYY-MM'
  spend       numeric default 0,
  sales       numeric default 0,    -- attributed sales, from the Amazon report
  impressions bigint  default 0,
  clicks      bigint  default 0,
  note        text,                 -- e.g. which report/upload this came from
  updated_at  timestamptz not null default now(),
  primary key (brand_id, month_key)
);
alter table amazon_ads disable row level security;
