-- Live Meta ad copy + creative images for the Marketing Snapshot report —
-- mirrors google_ads_creatives / google_ads_images. Refreshed by
-- scripts/sync_meta.py, replaced wholesale per brand each run.
create table if not exists meta_ads_creatives (
  id bigint generated always as identity primary key,
  brand_id int not null,
  campaign_name text,
  ad_name text,
  title text,
  body text,
  clicks int default 0,
  impressions int default 0,
  synced_at timestamptz not null default now()
);
create index if not exists meta_ads_creatives_brand_idx on meta_ads_creatives (brand_id);
alter table meta_ads_creatives disable row level security;

create table if not exists meta_ads_images (
  id bigint generated always as identity primary key,
  brand_id int not null,
  campaign_name text,
  ad_name text,
  image_url text not null,
  synced_at timestamptz not null default now()
);
create index if not exists meta_ads_images_brand_idx on meta_ads_images (brand_id);
alter table meta_ads_images disable row level security;
