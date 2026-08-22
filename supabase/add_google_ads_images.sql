-- Live creative images from Google Ads Performance Max asset groups, for the
-- Activations report's visual ad gallery. Refreshed by scripts/sync.py,
-- replaced wholesale per brand each run — no history kept.
create table if not exists google_ads_images (
  id bigint generated always as identity primary key,
  brand_id int not null,
  campaign_name text,
  asset_group text,
  image_url text not null,
  synced_at timestamptz not null default now()
);
create index if not exists google_ads_images_brand_idx on google_ads_images (brand_id);
alter table google_ads_images disable row level security;
